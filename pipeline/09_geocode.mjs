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
for (const f of tripFiles) {
  const trip = JSON.parse(readFileSync(join(tripsDir, f), 'utf8'))
  for (const s of trip.main_route ?? []) want(s.normalized_name, s.geocode_hint, s.original_wording, trip.trip_id)
  for (const ex of trip.excursions ?? [])
    for (const s of ex.stops ?? []) want(s.normalized_name, s.geocode_hint, s.original_wording, trip.trip_id)
}
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

const out = {}
let nQueries = 0
for (const [key, w] of wanted) {
  const placeId = key.split('|')[0]
  const nameSlug = slug(w.name)

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

  // 2. region anchors
  const region = regionAnchors[w.name.toLowerCase()] ?? regionAnchors[nameSlug.replace(/-/g, ' ')]
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

  // 3. Nominatim
  let results
  try {
    results = await nominatim(w.name, w.countrycodes)
    nQueries++
  } catch (e) {
    if (OFFLINE) throw e
    console.error(`  geocode error for "${w.name}": ${e.message}`)
    results = []
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
