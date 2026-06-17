// S9 — Geocode every place referenced by extracted trip routes.
// Sources, in priority order:
//   1. pipeline/ferries.json port table (crossing terminals; curated coords)
//   2. pipeline/region_anchors.json (vague regions -> representative anchor, approximate)
//   3. Nominatim public API (1 req/s, cached permanently in data/cache/geocode_cache.json)
// Output: data/work/geocoded_places.json — place_id -> resolution record.
// --offline: never touch the network; a cache miss is a hard error.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OFFLINE = process.argv.includes('--offline')
const CACHE_PATH = join(ROOT, 'data/cache/geocode_cache.json')
const USER_AGENT = 'camping-diaries-pipeline/1.0 (williamgkirby@gmail.com)'

const ferries = JSON.parse(readFileSync(join(ROOT, 'pipeline/ferries.json'), 'utf8'))
const regionAnchors = JSON.parse(readFileSync(join(ROOT, 'pipeline/region_anchors.json'), 'utf8'))
const curatedPlaces = JSON.parse(readFileSync(join(ROOT, 'pipeline/curated_places.json'), 'utf8'))
// Glossary place corrections override curated_places (family feedback). Keyed
// by the slug of a stop's normalized_name, same as the curated lookup below.
const glossary = JSON.parse(readFileSync(join(ROOT, 'pipeline/glossary.json'), 'utf8'))
for (const [k, v] of Object.entries(glossary.places ?? {})) curatedPlaces[k] = v
const cache = existsSync(CACHE_PATH) ? JSON.parse(readFileSync(CACHE_PATH, 'utf8')) : {}

const slug = (s) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')

// ---- Collect every (normalized_name, geocode_hint, original_wording) from trip files
const tripsDir = join(ROOT, 'data/work/trips')
const tripFiles = readdirSync(tripsDir).filter((f) => f.startsWith('trip_') && f.endsWith('_route.json'))
const wanted = new Map() // key -> { name, countrycodes, wordings:Set, trips:Set }
function want(name, hint, wording, tripId) {
  if (!name) return
  const cc = hint?.countrycodes?.toLowerCase() ?? ''
  const key = `${slug(name)}|${cc}`
  if (!wanted.has(key)) wanted.set(key, { name, countrycodes: cc, wordings: new Set(), trips: new Set() })
  const w = wanted.get(key)
  if (wording) w.wordings.add(wording)
  w.trips.add(tripId)
}
let skipped = 0
for (const f of tripFiles) {
  let trip
  try {
    trip = JSON.parse(readFileSync(join(tripsDir, f), 'utf8'))
  } catch {
    skipped++ // mid-write or malformed; the next pass picks it up
    continue
  }
  for (const s of trip.main_route ?? []) want(s.normalized_name, s.geocode_hint, s.original_wording, trip.trip_id)
  for (const ex of trip.excursions ?? [])
    for (const s of ex.stops ?? []) want(s.normalized_name, s.geocode_hint, s.original_wording, trip.trip_id)
}
if (skipped) console.log(`skipped ${skipped} unreadable trip files`)
console.log(`${tripFiles.length} trips reference ${wanted.size} distinct places`)

// ---- Resolution
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function nominatim(query, countrycodes) {
  const cacheKey = `${query}|${countrycodes}`
  if (cache[cacheKey]) return cache[cacheKey]
  if (OFFLINE) throw new Error(`offline rebuild: geocode cache miss for "${cacheKey}"`)
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('q', query)
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '3')
  url.searchParams.set('accept-language', 'en')
  if (countrycodes) url.searchParams.set('countrycodes', countrycodes)
  await sleep(1100) // Nominatim usage policy: max 1 req/s
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`nominatim ${res.status} for "${query}"`)
  const body = await res.json()
  cache[cacheKey] = body
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 1))
  return body
}

const portByName = {}
for (const [key, p] of Object.entries(ferries.ports)) {
  portByName[slug(p.name)] = { key, ...p }
  portByName[slug(key)] = { key, ...p }
}

// Build progressively simpler query variants: Nominatim free-text search
// chokes on "near X" clauses, parentheticals and over-qualified compounds.
function queryVariants(name) {
  const v = []
  const push = (q) => {
    q = q.replace(/\s+/g, ' ').replace(/\s*,\s*/g, ', ').trim().replace(/^,|,$/g, '')
    if (q && !v.some((x) => x.toLowerCase() === q.toLowerCase())) v.push(q)
  }
  push(name)
  push(name.replace(/\(.*?\)/g, '').replace(/\b(near|nr\.?|just outside|west of|east of|north of|south of)\s+[^,]+/gi, ''))
  const segs = name.split(',').map((s) => s.trim()).filter(Boolean)
  if (segs.length >= 3) push(`${segs[0]}, ${segs[segs.length - 2]}`)
  if (segs.length >= 2) push(segs[0])
  return v
}

const out = {}
let nQueries = 0
for (const [key, w] of wanted) {
  const placeId = key.split('|')[0]
  const nameSlug = slug(w.name)

  // 0. audit/human-curated overrides — the corrected name becomes the label
  // shown in the app (place_id slug stays put, so links/data keys are stable).
  const curated = curatedPlaces[nameSlug]
  if (curated && curated.lon != null) {
    out[key] = {
      place_id: placeId,
      normalized_name: curated.name ?? w.name,
      display_name: curated.name,
      lon: curated.lon,
      lat: curated.lat,
      country: curated.country,
      precision: curated.precision ?? 'locality',
      curated: true,
      source: 'curated_places.json',
      original_wordings: [...w.wordings],
      trips: [...w.trips],
      ambiguous: false,
      alternates: [],
    }
    continue
  }

  // 1. ferry port table
  const port = portByName[nameSlug]
  if (port) {
    out[key] = {
      place_id: placeId,
      normalized_name: w.name,
      display_name: port.name,
      lon: port.lon,
      lat: port.lat,
      country: port.country,
      precision: 'exact',
      curated: true,
      source: 'ferries.json',
      original_wordings: [...w.wordings],
      trips: [...w.trips],
      ambiguous: false,
      alternates: [],
    }
    continue
  }

  // 2. region anchors (also try the bare first segment: "Cotswolds, UK" -> "cotswolds")
  const firstSeg = w.name.split(',')[0].trim().toLowerCase()
  const region =
    regionAnchors[w.name.toLowerCase()] ?? regionAnchors[nameSlug.replace(/-/g, ' ')] ?? regionAnchors[firstSeg]
  if (region) {
    out[key] = {
      place_id: placeId,
      normalized_name: w.name,
      display_name: `${w.name} (anchor: ${region.anchor})`,
      lon: region.lon,
      lat: region.lat,
      country: region.country,
      precision: 'region_anchor',
      curated: true,
      source: 'region_anchors.json',
      original_wordings: [...w.wordings],
      trips: [...w.trips],
      ambiguous: false,
      alternates: [],
    }
    continue
  }

  // 3. Nominatim, walking the variant chain until something resolves
  let results = []
  let usedQuery = w.name
  for (const q of queryVariants(w.name)) {
    try {
      results = await nominatim(q, w.countrycodes)
      nQueries++
    } catch (e) {
      if (OFFLINE) throw e
      console.error(`  geocode error for "${q}": ${e.message}`)
      results = []
    }
    if (results.length) {
      usedQuery = q
      break
    }
  }
  if (!results.length) {
    out[key] = {
      place_id: placeId,
      normalized_name: w.name,
      display_name: null,
      lon: null,
      lat: null,
      country: w.countrycodes || null,
      precision: 'unresolved',
      curated: false,
      source: 'nominatim',
      original_wordings: [...w.wordings],
      trips: [...w.trips],
      ambiguous: false,
      alternates: [],
    }
    continue
  }
  // Reject hits outside the plausible Europe bbox (a bogus match elsewhere in
  // the world is worse than honest unresolved).
  results = results.filter((r) => Number(r.lon) > -25 && Number(r.lon) < 35 && Number(r.lat) > 35 && Number(r.lat) < 72)
  if (!results.length) {
    out[key] = {
      place_id: placeId,
      normalized_name: w.name,
      display_name: null,
      lon: null,
      lat: null,
      country: w.countrycodes || null,
      precision: 'unresolved',
      curated: false,
      source: 'nominatim',
      original_wordings: [...w.wordings],
      trips: [...w.trips],
      ambiguous: false,
      alternates: [],
    }
    continue
  }
  const top = results[0]
  // Ambiguous when a second hit of similar importance lands far from the first.
  let ambiguous = false
  if (results[1]) {
    const d = Math.hypot(top.lat - results[1].lat, top.lon - results[1].lon)
    const imp = (top.importance ?? 0) - (results[1].importance ?? 0)
    ambiguous = d > 0.5 && imp < 0.1
  }
  const granular = ['city', 'town', 'village', 'hamlet', 'castle', 'museum', 'attraction', 'peak', 'locality', 'suburb', 'isolated_dwelling', 'farm']
  out[key] = {
    place_id: placeId,
    normalized_name: w.name,
    display_name: top.display_name,
    lon: Number(top.lon),
    lat: Number(top.lat),
    country: w.countrycodes || null,
    precision: granular.includes(top.type) ? 'exact' : 'locality',
    curated: false,
    source: 'nominatim',
    query: usedQuery,
    osm_type: top.osm_type,
    osm_id: top.osm_id,
    nominatim_type: `${top.class}/${top.type}`,
    original_wordings: [...w.wordings],
    trips: [...w.trips],
    ambiguous,
    alternates: results.slice(1).map((r) => ({ display_name: r.display_name, lon: Number(r.lon), lat: Number(r.lat), type: `${r.class}/${r.type}` })),
  }
}

writeFileSync(join(ROOT, 'data/work/geocoded_places.json'), JSON.stringify(out, null, 1))
const unresolved = Object.values(out).filter((p) => p.precision === 'unresolved')
const ambiguous = Object.values(out).filter((p) => p.ambiguous)
console.log(
  `geocoded ${Object.keys(out).length} places (${nQueries} live queries, rest cached/curated); ` +
    `${unresolved.length} unresolved, ${ambiguous.length} ambiguous`,
)
