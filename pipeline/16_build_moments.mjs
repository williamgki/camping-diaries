// S16 — Build per-trip "moment" timelines for play mode.
// For each trip, walk its main-route stops; attach the curated quote (fallback:
// the stop's evidence excerpt) and any cropped diary images whose source page
// falls in that stop's page span. Emit public/data/moments/<trip>.json.
// `t` (position along the route) is computed in the APP from lon/lat, so there
// is one source of projection truth. Deterministic; no network.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { applyNames } from './glossary_names.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = join(ROOT, 'public/data/moments')
mkdirSync(OUT, { recursive: true })
const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'))

const trips = readJ(join(ROOT, 'data/out/trips.json'))
const evidence = readJ(join(ROOT, 'data/out/route_evidence.json'))
const places = readJ(join(ROOT, 'data/out/places.json'))
const sourcePages = readJ(join(ROOT, 'data/out/source_pages.json'))
const pageById = Object.fromEntries(sourcePages.map((p) => [p.page_id, p]))
const mediaIndex = existsSync(join(ROOT, 'data/work/media_index.json')) ? readJ(join(ROOT, 'data/work/media_index.json')) : []

// images grouped by trip + source page
const mediaByTripPage = {}
for (const m of mediaIndex) {
  ;(mediaByTripPage[m.trip_id] ??= {})[m.page_id] ??= []
  mediaByTripPage[m.trip_id][m.page_id].push(m)
}

const evByTrip = {}
for (const e of evidence) (evByTrip[e.trip_id] ??= []).push(e)

// global half-page ordinal so we can find pages "between this stop and the next"
const pageOrd = (pid) => {
  const m = pid.match(/^([AB])_(\d{4})_([LR])$/)
  if (!m) return -1
  return (m[1] === 'A' ? 0 : 100000) + Number(m[2]) * 2 + (m[3] === 'R' ? 1 : 0)
}

let tripsWithMoments = 0
let totalMoments = 0
let totalImages = 0

for (const trip of trips) {
  const quotesPath = join(ROOT, `data/work/quotes/${trip.id}.json`)
  const quotes = existsSync(quotesPath) ? readJ(quotesPath) : null
  const quoteBySeq = {}
  for (const q of quotes?.per_stop ?? []) quoteBySeq[q.seq] = q.quote
  const tripMedia = mediaByTripPage[trip.id] ?? {}

  const stops = (evByTrip[trip.id] ?? [])
    .filter((e) => e.role !== 'home' && e.role !== 'unresolved')
    .map((e) => ({ ...e, place: places[e.place_id] }))
    .filter((e) => e.place && e.place.lon != null)
    .sort((a, b) => a.seq - b.seq)

  const moments = []
  for (let i = 0; i < stops.length; i++) {
    const s = stops[i]
    const nextOrd = i + 1 < stops.length ? pageOrd(stops[i + 1].source_page_id ?? '') : Infinity
    const thisOrd = pageOrd(s.source_page_id ?? '')

    // images: this stop's own page, plus any photo pages up to (not incl.) the
    // next stop's page — captures photo-only pages that follow an entry.
    const imgs = []
    for (const [pid, list] of Object.entries(tripMedia)) {
      const o = pageOrd(pid)
      if (o < 0) continue
      const inSpan = thisOrd >= 0 && o >= thisOrd && (nextOrd === Infinity ? o <= thisOrd + 3 : o < nextOrd)
      if (inSpan) for (const m of list) imgs.push({ src: m.src, w: m.w, h: m.h, caption: m.caption, type: m.type })
    }
    // prefer photos/postcards first, cap to 3 per moment
    imgs.sort((a, b) => (a.type === 'map' || a.type === 'ticket' ? 1 : 0) - (b.type === 'map' || b.type === 'ticket' ? 1 : 0))
    const images = imgs.slice(0, 3)

    const quote = applyNames(quoteBySeq[s.seq] ?? s.excerpt ?? null)
    if (!quote && images.length === 0) continue // nothing to show at this stop

    moments.push({
      seq: s.seq,
      place_id: s.place_id,
      lon: s.place.lon,
      lat: s.place.lat,
      place: applyNames(s.place.normalized_name),
      date: trip.start_date ?? (trip.year ? String(trip.year) : null),
      role: s.role,
      quote,
      images: images.map((im) => ({ ...im, caption: applyNames(im.caption) })),
    })
    totalImages += images.length
  }

  const out = {
    trip_id: trip.id,
    epigraph: quotes?.epigraph?.quote ? { quote: applyNames(quotes.epigraph.quote) } : null,
    moments,
  }
  writeFileSync(join(OUT, `${trip.id}.json`), JSON.stringify(out))
  if (moments.length) tripsWithMoments++
  totalMoments += moments.length
}

console.log(`moments: ${tripsWithMoments}/${trips.length} trips have moments; ${totalMoments} moments, ${totalImages} images`)
