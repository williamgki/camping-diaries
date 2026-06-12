// S8-prep — Build per-trip source bundles for route-extraction agents.
// Consumes data/work/trips/segments.json (the adjudicated boundary list) and
// emits data/work/tripsrc/<trip_id>.json: every page of the trip (full text,
// untrimmed), its notebook index entry, and the LLM image paths of any
// route-sketch pages in range. Mixed boundary pages are included in BOTH
// adjacent trips, flagged.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TDIR = join(ROOT, 'data/work/transcripts')
const ODIR = join(ROOT, 'data/work/tripsrc')
mkdirSync(ODIR, { recursive: true })
const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'))

const segments = readJ(join(ROOT, 'data/work/trips/segments.json'))
const transcripts = {}
for (const f of readdirSync(TDIR).filter((f) => f.endsWith('.json'))) {
  const t = readJ(join(TDIR, f))
  transcripts[t.spread_id] = t
}
const spreadIds = Object.keys(transcripts).sort()

const ord = (pid) => {
  const m = pid.match(/^([AB])_(\d{4})(?:_([LR]))?/)
  const base = m[1] === 'A' ? 0 : 351 * 2 // volume B continues after A in one global ordering
  return { vol: m[1], n: Number(m[2]), side: m[3] ?? 'L', o: base + Number(m[2]) * 2 + (m[3] === 'R' ? 1 : 0) }
}

let written = 0
for (const trip of segments.trips) {
  if (trip.kind === 'non_trip') continue
  const a = ord(trip.start_page_id)
  const b = ord(trip.end_page_id)
  const pages = []
  const sketchImages = []
  for (const sid of spreadIds) {
    const s = ord(sid)
    // cross-volume trips: include spreads from both volumes in [start..end] order
    const within =
      a.vol === b.vol
        ? s.vol === a.vol && s.n >= a.n && s.n <= b.n
        : (s.vol === a.vol && s.n >= a.n) || (s.vol === b.vol && s.n <= b.n)
    if (!within) continue
    for (const p of transcripts[sid].pages ?? []) {
      const po = ord(p.page_id ?? `${sid}_${p.side}`)
      if (po.o < a.o || po.o > b.o) continue
      pages.push({
        page_id: p.page_id ?? `${sid}_${p.side}`,
        no: p.handwritten_page_no,
        dates: (p.dates ?? []).map((d) => ({ raw: d.raw, iso: d.iso_guess })),
        headings: p.headings ?? [],
        places: p.place_mentions ?? [],
        sketch: p.route_sketch || undefined,
        sketch_desc: p.route_sketch_description ?? undefined,
        captions: p.photo_captions?.length ? p.photo_captions : undefined,
        legibility: p.legibility,
        boundary_mixed:
          (trip.mixed_start && po.o === a.o) || (trip.mixed_end && po.o === b.o) ? true : undefined,
        text: p.full_text ?? '',
      })
      if (p.route_sketch && sketchImages.length < 8) {
        const vol = s.vol
        sketchImages.push(`${ROOT}/scans/vol${vol}/llm/${sid}_${p.side}.jpg`)
      }
    }
  }
  writeFileSync(
    join(ODIR, `${trip.trip_id}.json`),
    JSON.stringify(
      {
        trip_id: trip.trip_id,
        title_guess: trip.title_guess,
        date_guess: trip.date_guess,
        volume: a.vol === b.vol ? a.vol : 'A+B',
        spread_range: [`${a.vol}_${String(a.n).padStart(4, '0')}`, `${b.vol}_${String(b.n).padStart(4, '0')}`],
        mixed_start: trip.mixed_start ?? false,
        mixed_end: trip.mixed_end ?? false,
        index_entry: trip.index_entry ?? null,
        boundary_evidence: trip.evidence ?? [],
        sketch_images: sketchImages,
        pages,
      },
      null,
      1,
    ),
  )
  written++
}
console.log(`${written} trip bundles written to data/work/tripsrc/`)
