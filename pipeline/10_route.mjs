// S10 — Build leg-aware route geometry for every trip.
//   road legs:  OSRM public driving profile, full GeoJSON geometry, cached per
//               coordinate pair in data/cache/osrm/<sha1>.json
//   ferry/tunnel legs: great-circle geodesics between curated port coords —
//               never road-routed.
// Output: data/work/routes_built.json (trip legs) +
//         data/work/geometry_store.json (geometry_ref -> coordinates)
// --offline: cache misses are hard errors, network never touched.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OFFLINE = process.argv.includes('--offline')
const OSRM_DIR = join(ROOT, 'data/cache/osrm')
mkdirSync(OSRM_DIR, { recursive: true })

const ferries = JSON.parse(readFileSync(join(ROOT, 'pipeline/ferries.json'), 'utf8'))
const places = JSON.parse(readFileSync(join(ROOT, 'data/work/geocoded_places.json'), 'utf8'))

const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const placeKey = (name, cc) => `${slug(name)}|${(cc ?? '').toLowerCase()}`
function lookup(stop) {
  if (!stop?.normalized_name) return null
  const k = placeKey(stop.normalized_name, stop.geocode_hint?.countrycodes)
  const p = places[k] ?? places[`${slug(stop.normalized_name)}|`] ?? null
  return p && p.lon != null ? p : null
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const round5 = (x) => Math.round(x * 1e5) / 1e5

async function osrmRoute(from, to) {
  const coordStr = `${round5(from.lon)},${round5(from.lat)};${round5(to.lon)},${round5(to.lat)}`
  const hash = createHash('sha1').update(coordStr).digest('hex')
  const cachePath = join(OSRM_DIR, `${hash}.json`)
  if (existsSync(cachePath)) return JSON.parse(readFileSync(cachePath, 'utf8'))
  if (OFFLINE) throw new Error(`offline rebuild: OSRM cache miss for ${coordStr}`)
  await sleep(1100)
  const url = `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`
  const res = await fetch(url, { headers: { 'User-Agent': 'camping-diaries-pipeline/1.0 (williamgkirby@gmail.com)' } })
  if (!res.ok) throw new Error(`osrm ${res.status} for ${coordStr}`)
  const body = await res.json()
  const data =
    body.code === 'Ok' && body.routes?.[0]
      ? { coordStr, distance_m: body.routes[0].distance, coordinates: body.routes[0].geometry.coordinates }
      : { coordStr, error: body.code }
  writeFileSync(cachePath, JSON.stringify(data))
  return data
}

// Great-circle arc (n segments) between two points — for ferry/tunnel sea legs.
function geodesic(from, to, n = 48) {
  const toRad = (d) => (d * Math.PI) / 180
  const toDeg = (r) => (r * 180) / Math.PI
  const φ1 = toRad(from.lat), λ1 = toRad(from.lon), φ2 = toRad(to.lat), λ2 = toRad(to.lon)
  const Δ = 2 * Math.asin(
    Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2),
  )
  if (Δ === 0) return [[from.lon, from.lat], [to.lon, to.lat]]
  const coords = []
  for (let i = 0; i <= n; i++) {
    const f = i / n
    const a = Math.sin((1 - f) * Δ) / Math.sin(Δ)
    const b = Math.sin(f * Δ) / Math.sin(Δ)
    const x = a * Math.cos(φ1) * Math.cos(λ1) + b * Math.cos(φ2) * Math.cos(λ2)
    const y = a * Math.cos(φ1) * Math.sin(λ1) + b * Math.cos(φ2) * Math.sin(λ2)
    const z = a * Math.sin(φ1) + b * Math.sin(φ2)
    coords.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.hypot(x, y)))])
  }
  return coords
}
const haversineKm = (a, b) => {
  const toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat), dLon = toRad(b.lon - a.lon)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2
  return 12742 * Math.asin(Math.sqrt(s))
}

const tripsDir = join(ROOT, 'data/work/trips')
const tripFiles = readdirSync(tripsDir).filter((f) => f.startsWith('trip_') && f.endsWith('_route.json')).sort()

const geometryStore = {}
const builtTrips = []
const warnings = []

for (const f of tripFiles) {
  const trip = JSON.parse(readFileSync(join(tripsDir, f), 'utf8'))
  const legs = []
  let legSeq = 0

  // Expand the ordered main route into waypoints, splicing crossing terminals
  // in at their indicated positions.
  const stops = [...(trip.main_route ?? [])].sort((a, b) => a.seq - b.seq)
  const crossingsAfter = new Map()
  for (const c of trip.crossings ?? []) {
    if (!crossingsAfter.has(c.after_seq)) crossingsAfter.set(c.after_seq, [])
    crossingsAfter.get(c.after_seq).push(c)
  }

  // Build a waypoint list: { kind:'stop', stop, place } and { kind:'crossing', crossing }
  const waypoints = []
  for (const s of stops) {
    waypoints.push({ kind: 'stop', stop: s, place: lookup(s) })
    for (const c of crossingsAfter.get(s.seq) ?? []) waypoints.push({ kind: 'crossing', crossing: c })
  }

  // Walk waypoints producing legs. Crossings replace the road leg between the
  // surrounding stops with road->portA, sea, portB->road segments.
  let cursor = null // { lon, lat, label } current position (last resolvable point)
  let pendingUncertain = false
  for (const wp of waypoints) {
    if (wp.kind === 'crossing') {
      const c = wp.crossing
      const named = ferries.named_routes[c.route_key]
      if (!named) {
        warnings.push({ trip: trip.trip_id, type: 'unknown_crossing_key', key: c.route_key ?? null })
        continue
      }
      let pa = ferries.ports[named.from]
      let pb = ferries.ports[named.to]
      // Orient the crossing to the direction of travel: the named route is
      // stored one way (e.g. north_shields->stavanger) but the diary may be
      // on the return sailing.
      if (cursor && haversineKm(cursor, pb) < haversineKm(cursor, pa)) [pa, pb] = [pb, pa]
      if (cursor && haversineKm(cursor, pa) > 0.5) {
        const r = await osrmRoute(cursor, pa)
        if (r.coordinates) {
          const ref = `g${Object.keys(geometryStore).length}`
          geometryStore[ref] = { source: 'osrm', cache_key: r.coordStr, coordinates: r.coordinates }
          legs.push({ seq: ++legSeq, mode: 'road', from: cursor.label, to: pa.name, geometry_ref: ref, distance_km: +(r.distance_m / 1000).toFixed(1), uncertain: pendingUncertain })
        } else warnings.push({ trip: trip.trip_id, type: 'osrm_error', detail: r.error, from: cursor.label, to: pa.name })
      }
      const ref = `g${Object.keys(geometryStore).length}`
      geometryStore[ref] = { source: 'geodesic', coordinates: geodesic(pa, pb) }
      legs.push({
        seq: ++legSeq,
        mode: named.kind, // 'ferry' | 'tunnel'
        from: pa.name,
        to: pb.name,
        geometry_ref: ref,
        distance_km: +haversineKm(pa, pb).toFixed(1),
        ferry_route: c.route_key,
        inferred: !!c.inferred,
        uncertain: false,
      })
      cursor = { lon: pb.lon, lat: pb.lat, label: pb.name }
      pendingUncertain = false
      continue
    }
    const { stop, place } = wp
    if (!place) {
      if (stop.role !== 'home') {
        warnings.push({ trip: trip.trip_id, type: 'unresolved_stop', name: stop.normalized_name, seq: stop.seq })
        pendingUncertain = true // the next drawable leg spans an unresolved gap
      }
      continue
    }
    const here = { lon: place.lon, lat: place.lat, label: place.normalized_name }
    if (cursor && haversineKm(cursor, here) > 0.5) {
      const direct = haversineKm(cursor, here)
      const r = await osrmRoute(cursor, here)
      if (r.coordinates) {
        const ratio = r.distance_m / 1000 / direct
        if (ratio > 3 && direct > 30)
          warnings.push({ trip: trip.trip_id, type: 'detour_ratio', from: cursor.label, to: here.label, ratio: +ratio.toFixed(1) })
        const ref = `g${Object.keys(geometryStore).length}`
        geometryStore[ref] = { source: 'osrm', cache_key: r.coordStr, coordinates: r.coordinates }
        legs.push({ seq: ++legSeq, mode: 'road', from: cursor.label, to: here.label, geometry_ref: ref, distance_km: +(r.distance_m / 1000).toFixed(1), uncertain: pendingUncertain })
        pendingUncertain = false
      } else {
        warnings.push({ trip: trip.trip_id, type: 'osrm_error', detail: r.error, from: cursor.label, to: here.label })
      }
    }
    cursor = here
  }

  // Excursions: base -> stop, one out-and-back line per excursion stop.
  const excursionLegs = []
  for (const [exIdx, ex] of (trip.excursions ?? []).entries()) {
    const base = stops.find((s) => s.seq === ex.base_seq)
    const basePlace = base ? lookup(base) : null
    if (!basePlace) {
      if ((ex.stops ?? []).length) warnings.push({ trip: trip.trip_id, type: 'excursion_base_unresolved', label: ex.label })
      continue
    }
    for (const s of ex.stops ?? []) {
      const p = lookup(s)
      if (!p) {
        warnings.push({ trip: trip.trip_id, type: 'unresolved_excursion_stop', name: s.normalized_name, excursion: ex.label })
        continue
      }
      if (haversineKm(basePlace, p) < 0.5) continue
      const r = await osrmRoute(basePlace, p)
      if (r.coordinates) {
        const ref = `g${Object.keys(geometryStore).length}`
        geometryStore[ref] = { source: 'osrm', cache_key: r.coordStr, coordinates: r.coordinates }
        excursionLegs.push({ excursion_index: exIdx, label: ex.label, from: basePlace.normalized_name, to: p.normalized_name, geometry_ref: ref, distance_km: +(r.distance_m / 1000).toFixed(1) })
      }
    }
  }

  builtTrips.push({
    trip_id: trip.trip_id,
    legs,
    excursion_legs: excursionLegs,
    total_km: +legs.reduce((a, l) => a + l.distance_km, 0).toFixed(0),
  })
  console.log(`${trip.trip_id}: ${legs.length} legs (${legs.filter((l) => l.mode !== 'road').length} crossings), ${excursionLegs.length} excursion legs`)
}

writeFileSync(join(ROOT, 'data/work/routes_built.json'), JSON.stringify({ trips: builtTrips, warnings }, null, 1))
writeFileSync(join(ROOT, 'data/work/geometry_store.json'), JSON.stringify(geometryStore))
console.log(`built ${builtTrips.length} trips, ${Object.keys(geometryStore).length} geometries, ${warnings.length} warnings`)
if (warnings.length) console.log('warning types:', [...new Set(warnings.map((w) => w.type))].join(', '))
