// S12 — Validate the canonical outputs: ajv schema checks + binding accuracy rules.
// Exit code 1 on any hard failure. Appends a validation block to extraction_summary.json.
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Ajv = require('ajv')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'data/out')
const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'))

const schemas = readJ(join(ROOT, 'pipeline/schemas/outputs.schema.json'))
const ajv = new Ajv({ allErrors: true, strict: false })
const errors = []
const warns = []

const data = {}
for (const name of ['trips.json', 'places.json', 'route_evidence.json', 'routes.json', 'route_geometry.json', 'excursions.json', 'source_pages.json', 'review_queue.json', 'extraction_summary.json']) {
  data[name] = readJ(join(OUT, name))
  if (schemas[name]) {
    const ok = ajv.validate(schemas[name], data[name])
    if (!ok) errors.push(...ajv.errors.slice(0, 10).map((e) => `${name} ${e.instancePath}: ${e.message}`))
  }
}

const trips = data['trips.json']
const evidence = data['route_evidence.json']
const routes = data['routes.json']
const geometry = data['route_geometry.json']
const places = data['places.json']
const queue = data['review_queue.json']

// Rule 1: every canonical non-home stop carries citation + confidence.
for (const e of evidence) {
  if (e.role === 'home') continue
  if (!e.source_page_id || !e.excerpt) errors.push(`uncited stop: ${e.trip_id} seq ${e.seq} (${e.place_id}, role ${e.role})`)
  if (e.confidence == null) errors.push(`no confidence: ${e.trip_id} seq ${e.seq}`)
}

// Rule 2: every trip is resolved or carries explicit review material.
for (const t of trips) {
  if (t.status === 'review') {
    const hasQueue = queue.some((q) => q.trip_id === t.id) || t.unresolved_stops > 0 || (t.boundary_flags ?? []).length > 0
    if (!hasQueue) errors.push(`trip ${t.id} is 'review' with no review-queue entry or unresolved stops`)
  }
}

// Rule 3: geometry integrity — every leg's geometry_ref exists; ferry/tunnel legs
// are geodesic (never road-routed); road legs come from OSRM cache.
for (const r of routes) {
  for (const leg of [...r.legs, ...(r.excursion_legs ?? [])]) {
    const g = geometry[leg.geometry_ref]
    if (!g) { errors.push(`missing geometry ${leg.geometry_ref} (${r.trip_id})`); continue }
    if ((leg.mode === 'ferry' || leg.mode === 'tunnel') && g.source !== 'geodesic')
      errors.push(`crossing leg road-routed: ${r.trip_id} ${leg.from}→${leg.to}`)
    if ((leg.mode === 'road' || !leg.mode) && g.source !== 'osrm')
      errors.push(`road leg not from OSRM cache: ${r.trip_id} ${leg.from ?? leg.label}→${leg.to}`)
  }
}

// Rule 4: Norway trips using a North Shields ferry must not route through the
// Low Countries. (Belgium/Netherlands bbox, conservative.)
const polyline = require('@mapbox/polyline')
const inLowCountries = ([lat, lon]) => lon > 2.6 && lon < 7.1 && lat > 49.6 && lat < 53.5
for (const r of routes) {
  const usesNewcastleFerry = r.legs.some((l) => (l.ferry_route ?? '').startsWith('north_shields'))
  if (!usesNewcastleFerry) continue
  for (const leg of r.legs) {
    if (leg.mode !== 'road') continue
    const coords = polyline.decode(geometry[leg.geometry_ref]?.polyline6 ?? '', 6)
    if (coords.some(inLowCountries)) errors.push(`Norway trip ${r.trip_id} road leg ${leg.from}→${leg.to} crosses the Low Countries`)
  }
}

// Rule 5: place sanity — coordinates inside Europe bbox (schema), home anchor is Birmingham city.
const home = Object.values(places).find((p) => p.normalized_name?.toLowerCase().startsWith('birmingham'))
if (home && (Math.abs(home.lat - 52.48) > 0.2 || Math.abs(home.lon - -1.89) > 0.3))
  errors.push(`home anchor not at Birmingham city: ${home.lat},${home.lon}`)

// Rule 6 (warnings): inferred crossings should be queued or marked.
for (const r of routes) {
  for (const leg of r.legs) {
    if (leg.inferred && leg.mode !== 'road') {
      const t = trips.find((t) => t.id === r.trip_id)
      if (t?.status === 'resolved') warns.push(`inferred crossing on resolved trip ${r.trip_id}: ${leg.ferry_route}`)
    }
  }
}

// Rule 7: every trip in trips.json has a routes.json entry and vice versa.
const tripIds = new Set(trips.map((t) => t.id))
const routeIds = new Set(routes.map((r) => r.trip_id))
for (const id of tripIds) if (!routeIds.has(id)) errors.push(`trip ${id} has no route entry`)
for (const id of routeIds) if (!tripIds.has(id)) errors.push(`route ${id} has no trip entry`)

const summary = data['extraction_summary.json']
summary.validation = {
  passed: errors.length === 0,
  errors: errors.slice(0, 50),
  error_count: errors.length,
  warnings: warns.slice(0, 50),
  warning_count: warns.length,
}
writeFileSync(join(OUT, 'extraction_summary.json'), JSON.stringify(summary, null, 1))
writeFileSync(join(ROOT, 'public/data/extraction_summary.json'), JSON.stringify(summary))

console.log(`validation: ${errors.length} errors, ${warns.length} warnings`)
for (const e of errors.slice(0, 20)) console.log('  ERROR', e)
for (const w of warns.slice(0, 10)) console.log('  warn ', w)
process.exit(errors.length ? 1 : 0)
