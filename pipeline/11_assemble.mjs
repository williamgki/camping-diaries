// S11 — Assemble the nine canonical JSON outputs + app runtime data.
//   data/out/{trips,places,route_evidence,routes,route_geometry,excursions,
//             source_pages,review_queue,extraction_summary}.json
//   public/data/  core JSONs + geometry/<trip>.json chunks + search_index.json
//   public/scans/ 1600w WebP page images + 320w thumbs (sharp)
// Applies human corrections from patches/*.json (JSON-pointer ops) before writing.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync, copyFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const polyline = require('@mapbox/polyline')
const MiniSearch = require('minisearch')
const sharp = require('sharp')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'data/out')
const PUB = join(ROOT, 'public/data')
const SKIP_IMAGES = process.argv.includes('--skip-images')
mkdirSync(OUT, { recursive: true })
mkdirSync(join(PUB, 'geometry'), { recursive: true })
mkdirSync(join(ROOT, 'public/scans'), { recursive: true })

const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'))
const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// ---------- Load inputs
const sources = readJ(join(ROOT, 'pipeline/sources.json'))
const splitManifest = readJ(join(ROOT, 'data/work/split_manifest.json'))
const pageMap = readJ(join(ROOT, 'data/work/page_map.json'))
const geocoded = readJ(join(ROOT, 'data/work/geocoded_places.json'))
const routesBuilt = readJ(join(ROOT, 'data/work/routes_built.json'))
const geometryStore = readJ(join(ROOT, 'data/work/geometry_store.json'))
const segments = readJ(join(ROOT, 'data/work/trips/segments.json'))
const tripsDir = join(ROOT, 'data/work/trips')
const tripFiles = readdirSync(tripsDir).filter((f) => f.startsWith('trip_') && f.endsWith('_route.json')).sort()
const trips = tripFiles.map((f) => readJ(join(tripsDir, f)))
const transcripts = {}
for (const f of readdirSync(join(ROOT, 'data/work/transcripts')).filter((f) => f.endsWith('.json'))) {
  const t = readJ(join(ROOT, 'data/work/transcripts', f))
  transcripts[t.spread_id] = t
}

const placeKey = (name, cc) => `${slug(name)}|${(cc ?? '').toLowerCase()}`
function resolvePlace(stop) {
  if (!stop?.normalized_name) return null
  return geocoded[placeKey(stop.normalized_name, stop.geocode_hint?.countrycodes)] ?? geocoded[`${slug(stop.normalized_name)}|`] ?? null
}

// ---------- places.json
const placesOut = {}
for (const p of Object.values(geocoded)) {
  placesOut[p.place_id] = {
    place_id: p.place_id,
    normalized_name: p.normalized_name,
    display_name: p.display_name,
    lon: p.lon,
    lat: p.lat,
    country: p.country,
    precision: p.precision,
    curated: p.curated,
    source: p.source,
    original_wordings: p.original_wordings,
    ambiguous: p.ambiguous,
    alternates: p.alternates,
    trips: p.trips,
  }
}

// ---------- route_evidence / excursions / trips / routes
const evidence = []
const excursionsOut = []
const tripsOut = []
const routesOut = []
const reviewQueue = []
const builtByTrip = Object.fromEntries(routesBuilt.trips.map((t) => [t.trip_id, t]))

const spreadNum = (sid) => Number(sid.split('_')[1])
for (const trip of trips) {
  const built = builtByTrip[trip.trip_id] ?? { legs: [], excursion_legs: [], total_km: 0 }
  const stops = [...(trip.main_route ?? [])].sort((a, b) => a.seq - b.seq)
  let unresolvedCount = 0
  for (const s of stops) {
    const place = resolvePlace(s)
    const pid = place?.place_id ?? slug(s.normalized_name ?? s.original_wording ?? 'unknown')
    const resolved = !!(place && place.lon != null)
    if (!resolved && s.role !== 'home') unresolvedCount++
    evidence.push({
      trip_id: trip.trip_id,
      seq: s.seq,
      place_id: pid,
      role: resolved ? s.role : s.role === 'home' ? 'home' : 'unresolved',
      original_wording: s.original_wording,
      excerpt: s.excerpt,
      source_page_id: s.source_page_id,
      confidence: s.confidence,
      approximate: s.approximate ?? place?.precision === 'region_anchor',
      inferred: s.inferred ?? false,
      inference_reason: s.inference_reason ?? null,
    })
  }
  for (const [i, ex] of (trip.excursions ?? []).entries()) {
    const base = stops.find((s) => s.seq === ex.base_seq)
    excursionsOut.push({
      trip_id: trip.trip_id,
      excursion_id: `${trip.trip_id}-ex${i}`,
      base_place_id: base ? (resolvePlace(base)?.place_id ?? null) : null,
      label: ex.label,
      date_guess: ex.date_guess ?? null,
      stops: (ex.stops ?? []).map((s) => ({
        place_id: resolvePlace(s)?.place_id ?? slug(s.normalized_name ?? 'unknown'),
        normalized_name: s.normalized_name,
        original_wording: s.original_wording,
        excerpt: s.excerpt,
        source_page_id: s.source_page_id,
        confidence: s.confidence,
        resolved: !!resolvePlace(s),
      })),
      geometry_refs: built.excursion_legs.filter((l) => l.excursion_index === i).map((l) => l.geometry_ref),
    })
  }
  for (const [ui, u] of (trip.unresolved ?? []).entries()) {
    reviewQueue.push({
      id: `unres-${trip.trip_id}-${ui}`,
      type: 'unresolved_place',
      trip_id: trip.trip_id,
      page_id: u.source_page_id ?? null,
      detail: `${u.original_wording}: ${u.issue}`,
      candidates: [],
      status: 'open',
    })
  }
  const confidences = stops.map((s) => s.confidence).filter((c) => c != null)
  const lowConf = confidences.filter((c) => c < 0.7).length
  const avgConf = confidences.length ? confidences.reduce((a, c) => a + c, 0) / confidences.length : 1
  // 'review' means the DRAWN ROUTE is materially uncertain: unresolved
  // main-route stops or weak overall confidence. Mixed-page boundary flags are
  // surfaced as page-level warnings (review queue) without demoting the trip,
  // and unresolved excursion side-places (friends' farms etc.) stay queued.
  const status = unresolvedCount > 0 || avgConf < 0.6 ? 'review' : 'resolved'
  const sRange = trip.spread_range ?? []
  tripsOut.push({
    id: trip.trip_id,
    slug: trip.trip_id,
    title: trip.title,
    volume: trip.volume,
    start_date: trip.date_start ?? null,
    end_date: trip.date_end ?? null,
    year: trip.date_start ? Number(String(trip.date_start).slice(0, 4)) : null,
    date_precision: trip.date_precision ?? 'year',
    travellers: trip.travellers ?? [],
    countries: trip.countries ?? [],
    summary: trip.summary ?? '',
    diary_pages: trip.diary_page_range ?? null,
    pdf_spreads: sRange,
    stats: {
      stops: stops.length,
      excursions: (trip.excursions ?? []).length,
      crossings: (trip.crossings ?? []).length,
      distance_km: built.total_km,
    },
    confidence: confidences.length ? +(confidences.reduce((a, c) => a + c, 0) / confidences.length).toFixed(2) : null,
    low_confidence_stops: lowConf,
    unresolved_stops: unresolvedCount + (trip.unresolved?.length ?? 0),
    boundary_flags: trip.boundary_flags ?? [],
    status,
  })
  routesOut.push({
    trip_id: trip.trip_id,
    legs: built.legs,
    excursion_legs: built.excursion_legs,
  })
}

// ---------- review queue: geocode + routing + segmentation + page anomalies
for (const p of Object.values(geocoded)) {
  if (p.precision === 'unresolved')
    reviewQueue.push({ id: `geo-${p.place_id}`, type: 'unresolved_place', trip_id: p.trips[0] ?? null, page_id: null, detail: `No geocode result for "${p.normalized_name}" (wordings: ${p.original_wordings.join(', ')})`, candidates: [], status: 'open' })
  else if (p.ambiguous)
    reviewQueue.push({ id: `amb-${p.place_id}`, type: 'ambiguous_geocode', trip_id: p.trips[0] ?? null, page_id: null, detail: `"${p.normalized_name}" → ${p.display_name}`, candidates: p.alternates.map((a) => a.display_name), status: 'open' })
}
for (const w of routesBuilt.warnings) {
  reviewQueue.push({ id: `route-${reviewQueue.length}`, type: w.type === 'detour_ratio' ? 'routing_detour' : 'routing_issue', trip_id: w.trip ?? null, page_id: null, detail: JSON.stringify(w), candidates: [], status: 'open' })
}
for (const b of segments.trips ?? []) {
  if (b.mixed_start || b.mixed_end || (b.confidence ?? 1) < 0.6 || (b.flags ?? []).length)
    reviewQueue.push({
      id: `seg-${b.trip_id}`,
      type: 'boundary_conflict',
      trip_id: b.trip_id,
      page_id: b.start_page_id,
      detail: `${b.title_guess}: mixed_start=${!!b.mixed_start} mixed_end=${!!b.mixed_end} confidence=${b.confidence}${(b.flags ?? []).length ? ' flags=' + b.flags.join(',') : ''}`,
      candidates: [],
      status: 'open',
    })
}
for (const vol of ['A', 'B']) {
  for (const a of pageMap[vol]?.anomalies ?? [])
    reviewQueue.push({ id: `pg-${vol}-${reviewQueue.length}`, type: 'page_number_anomaly', trip_id: null, page_id: a.to?.page_id ?? a.pages?.[1] ?? null, detail: JSON.stringify(a), candidates: [], status: 'open' })
}

// ---------- source_pages.json
const gOrd = (sid) => (sid[0] === 'A' ? 0 : 351) + spreadNum(sid) // global order across volumes
const tripSpreadRanges = trips
  .filter((t) => t.spread_range?.length === 2)
  .map((t) => ({ id: t.trip_id, from: gOrd(t.spread_range[0]), to: gOrd(t.spread_range[1]) }))
const sourcePages = []
for (const m of splitManifest) {
  const t = transcripts[m.spread_id]
  for (const side of ['L', 'R']) {
    const pageId = `${m.spread_id}_${side}`
    const tp = t?.pages?.find((p) => p.side === side || p.page_id === pageId)
    const n = spreadNum(m.spread_id)
    sourcePages.push({
      page_id: pageId,
      volume: m.volume,
      pdf_page: m.pdf_page,
      side,
      handwritten_page_no: tp?.handwritten_page_no ?? null,
      image: { webp: `scans/${pageId}.webp`, thumb: `scans/${pageId}_t.webp` },
      trip_ids: tripSpreadRanges.filter((r) => gOrd(m.spread_id) >= r.from && gOrd(m.spread_id) <= r.to).map((r) => r.id),
      is_index: tp?.is_index_page ?? false,
      legibility: tp?.legibility ?? null,
      has_route_sketch: tp?.route_sketch ?? false,
      photo_captions: tp?.photo_captions ?? [],
      blank: tp?.blank ?? false,
    })
    if ((tp?.legibility ?? 1) < 0.5 && !(tp?.blank))
      reviewQueue.push({ id: `leg-${pageId}`, type: 'illegible_page', trip_id: null, page_id: pageId, detail: `legibility ${tp.legibility}`, candidates: [], status: 'open' })
  }
}

// ---------- route_geometry.json (polyline6 archive) + per-trip GeoJSON chunks
const routeGeometry = {}
for (const [ref, g] of Object.entries(geometryStore)) {
  routeGeometry[ref] = {
    source: g.source,
    cache_key: g.cache_key ?? null,
    polyline6: polyline.encode(g.coordinates.map(([lon, lat]) => [lat, lon]), 6),
  }
}
for (const r of routesOut) {
  const features = []
  for (const leg of r.legs) {
    const g = geometryStore[leg.geometry_ref]
    if (!g) continue
    features.push({
      type: 'Feature',
      properties: { kind: 'main', mode: leg.mode, seq: leg.seq, from: leg.from, to: leg.to, inferred: leg.inferred ?? false, uncertain: leg.uncertain ?? false, distance_km: leg.distance_km, ferry_route: leg.ferry_route ?? null },
      geometry: { type: 'LineString', coordinates: g.coordinates },
    })
  }
  for (const leg of r.excursion_legs) {
    const g = geometryStore[leg.geometry_ref]
    if (!g) continue
    features.push({
      type: 'Feature',
      properties: { kind: 'excursion', mode: 'road', label: leg.label, from: leg.from, to: leg.to, distance_km: leg.distance_km },
      geometry: { type: 'LineString', coordinates: g.coordinates },
    })
  }
  writeFileSync(join(PUB, 'geometry', `${r.trip_id}.json`), JSON.stringify({ type: 'FeatureCollection', features }))
}

// ---------- all-trips underlay: every main leg, Douglas-Peucker simplified.
// The underlay is a faint gesture layer — heavy simplification is fine.
function rdp(coords, tol) {
  if (coords.length < 3) return coords
  const [x1, y1] = coords[0]
  const [x2, y2] = coords[coords.length - 1]
  let maxD = 0
  let idx = 0
  const dx = x2 - x1
  const dy = y2 - y1
  const denom = Math.hypot(dx, dy) || 1e-12
  for (let i = 1; i < coords.length - 1; i++) {
    const d = Math.abs(dy * coords[i][0] - dx * coords[i][1] + x2 * y1 - y2 * x1) / denom
    if (d > maxD) {
      maxD = d
      idx = i
    }
  }
  if (maxD <= tol) return [coords[0], coords[coords.length - 1]]
  return [...rdp(coords.slice(0, idx + 1), tol).slice(0, -1), ...rdp(coords.slice(idx), tol)]
}
const underlay = {
  type: 'FeatureCollection',
  features: routesOut.flatMap((r) =>
    r.legs
      .map((leg) => {
        const g = geometryStore[leg.geometry_ref]
        if (!g) return null
        const coords = rdp(g.coordinates, 0.004).map(([lon, lat]) => [+lon.toFixed(4), +lat.toFixed(4)])
        return { type: 'Feature', properties: { trip_id: r.trip_id }, geometry: { type: 'LineString', coordinates: coords } }
      })
      .filter(Boolean),
  ),
}
writeFileSync(join(PUB, 'underlay.json'), JSON.stringify(underlay))

// ---------- extraction_summary.json
const citedStops = evidence.filter((e) => e.role !== 'home' && e.source_page_id && e.excerpt)
const nonHome = evidence.filter((e) => e.role !== 'home')
const summary = {
  generated_at: new Date().toISOString(),
  sources: sources.sources.map((s) => ({ volume: s.volume, sha256: s.sha256, pages: s.pages })),
  counts: {
    spreads: splitManifest.length,
    pages: sourcePages.length,
    transcribed_spreads: Object.keys(transcripts).length,
    trips: tripsOut.length,
    resolved_trips: tripsOut.filter((t) => t.status === 'resolved').length,
    review_trips: tripsOut.filter((t) => t.status === 'review').length,
    main_route_stops: nonHome.length,
    cited_stop_pct: nonHome.length ? +((100 * citedStops.length) / nonHome.length).toFixed(1) : null,
    excursions: excursionsOut.length,
    places: Object.keys(placesOut).length,
    geometries: Object.keys(routeGeometry).length,
    review_queue: reviewQueue.length,
  },
}

// ---------- apply human patches (JSON-pointer ops against the output objects)
const outputs = {
  'trips.json': tripsOut,
  'places.json': placesOut,
  'route_evidence.json': evidence,
  'routes.json': routesOut,
  'route_geometry.json': routeGeometry,
  'excursions.json': excursionsOut,
  'source_pages.json': sourcePages,
  'review_queue.json': reviewQueue,
  'extraction_summary.json': summary,
}
function applyPointer(doc, pointer, op, value) {
  const parts = pointer.split('/').slice(1).map((p) => p.replace(/~1/g, '/').replace(/~0/g, '~'))
  let target = doc
  for (let i = 0; i < parts.length - 1; i++) target = target[Array.isArray(target) ? Number(parts[i]) : parts[i]]
  const last = Array.isArray(target) ? Number(parts[parts.length - 1]) : parts[parts.length - 1]
  if (op === 'replace' || op === 'add') target[last] = value
  else if (op === 'remove') Array.isArray(target) ? target.splice(last, 1) : delete target[last]
}
const patchDir = join(ROOT, 'patches')
let patchCount = 0
if (existsSync(patchDir)) {
  for (const f of readdirSync(patchDir).filter((f) => f.endsWith('.json')).sort()) {
    for (const p of readJ(join(patchDir, f))) {
      if (!outputs[p.target_file]) continue
      try {
        // review-queue patches address items by stable id, not by index
        // (indices shift between rebuilds)
        let pointer = p.json_pointer
        if (p.target_file === 'review_queue.json' && p.review_id) {
          const idx = reviewQueue.findIndex((q) => q.id === p.review_id)
          if (idx === -1) throw new Error(`review item ${p.review_id} not found`)
          pointer = pointer.replace(/^\/\d+\//, `/${idx}/`)
        }
        applyPointer(outputs[p.target_file], pointer, p.op, p.value)
        patchCount++
        const item = reviewQueue.find((q) => q.id === p.review_id)
        if (item) item.status = 'patched'
      } catch (e) {
        console.error(`patch failed (${f}): ${p.json_pointer}: ${e.message}`)
      }
    }
  }
}
summary.counts.patches_applied = patchCount

// ---------- write outputs (data/out + public/data)
for (const [name, obj] of Object.entries(outputs)) {
  writeFileSync(join(OUT, name), JSON.stringify(obj, null, 1))
  if (name !== 'route_geometry.json') writeFileSync(join(PUB, name), JSON.stringify(obj))
}

// ---------- search index (MiniSearch, lazy-loaded by the app)
const mini = new MiniSearch({ fields: ['title', 'text'], storeFields: ['type', 'title', 'trip_id', 'page_id'] })
const docs = []
for (const t of tripsOut) docs.push({ id: `trip:${t.id}`, type: 'trip', title: t.title, text: `${t.summary} ${(t.countries ?? []).join(' ')} ${t.year ?? ''}`, trip_id: t.id, page_id: null })
for (const p of Object.values(placesOut)) docs.push({ id: `place:${p.place_id}`, type: 'place', title: p.normalized_name, text: p.original_wordings.join(' '), trip_id: p.trips?.[0] ?? null, page_id: null })
for (const [sid, t] of Object.entries(transcripts))
  for (const pg of t.pages ?? []) {
    if (!pg.full_text) continue
    docs.push({ id: `page:${pg.page_id ?? sid + '_' + pg.side}`, type: 'page', title: `${sid} p.${pg.handwritten_page_no ?? '?'}`, text: pg.full_text.slice(0, 4000), trip_id: null, page_id: pg.page_id ?? `${sid}_${pg.side}` })
  }
mini.addAll(docs)
writeFileSync(join(PUB, 'search_index.json'), JSON.stringify(mini.toJSON()))

console.log(`outputs written: ${Object.keys(outputs).join(', ')}`)
console.log(`search index: ${docs.length} documents`)

// ---------- WebP scan derivatives
if (!SKIP_IMAGES) {
  let made = 0, skipped = 0
  for (const vol of ['A', 'B']) {
    const pdir = join(ROOT, `scans/vol${vol}/pages`)
    if (!existsSync(pdir)) continue
    const files = readdirSync(pdir).filter((f) => f.endsWith('.jpg'))
    for (const f of files) {
      const pageId = basename(f, '.jpg')
      const webp = join(ROOT, 'public/scans', `${pageId}.webp`)
      const thumb = join(ROOT, 'public/scans', `${pageId}_t.webp`)
      if (existsSync(webp) && existsSync(thumb)) { skipped++; continue }
      const img = sharp(join(pdir, f))
      await img.clone().resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 70 }).toFile(webp)
      await img.clone().resize({ width: 320 }).webp({ quality: 60 }).toFile(thumb)
      made++
      if (made % 200 === 0) console.log(`webp: ${made} converted`)
    }
  }
  console.log(`webp: ${made} converted, ${skipped} already present`)
}
console.log('assemble complete')
