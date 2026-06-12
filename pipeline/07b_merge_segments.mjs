// S7b — Merge window boundary findings into the adjudicated trip list
// (data/work/trips/segments.json). Deterministic re-merge from the window
// files (not the workflow's in-flight merge) with documented overrides.
//
// Adjudications baked in (evidence in comments):
//  * Germany 2003 spans the A/B volume seam as ONE trip. A_0348_R is
//    "Friday August 8th" in Weimar ("20*C+M+B*03" Epiphany chalk = 2003);
//    B_0003_R resumes "left the Gemmeke's house in Weimar" with ages
//    Thomas 23 / John ~16 / Charles 14 — all three anchor to 2003 (they were
//    9 / 21mo / 6wk in May 1989); B_0004_L: "the Wall came down - 1991-2003".
//    The window agent's "Germany 2005" reading of B_0003_R is a date misread
//    -> dropped, trip extended, review item emitted by assemble via flags.
//  * Spain & France 2008 spans the book-3 seam inside volume B: the writer
//    started a new notebook (index at B_0145) mid-holiday. B_0146_R
//    "Zamora, Salamanca..." is the same journey as B_0138_R "Bilbao ferry,
//    Burgos, Zamora..." -> continuation dropped, range extended.
//  * Overlapping windows re-report trips already underway at their window
//    start ("return leg", "continues from previous window") -> dropped by
//    rule R2 below.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const WDIR = join(ROOT, 'data/work/trips/windows')
const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'))

const windows = readJ(join(ROOT, 'data/work/segwin/_windows.json'))
const winStart = Object.fromEntries(windows.map((w) => [w.id, w.from.replace('.json', '')]))

const ord = (pid) => {
  const m = pid.match(/^([AB])_(\d{4})(?:_([LR]))?/)
  if (!m) return null
  // volume B continues after A in one global ordering (vol A has 350 spreads)
  const base = m[1] === 'A' ? 0 : 350 * 2 + 2
  return base + Number(m[2]) * 2 + (m[3] === 'R' ? 1 : 0)
}

// ---- collect every boundary from every window file
const raw = []
for (const f of readdirSync(WDIR).filter((f) => f.endsWith('.json'))) {
  const w = readJ(join(WDIR, f))
  for (const b of w.boundaries ?? []) {
    if (!b.start_page_id || ord(b.start_page_id) == null) continue
    raw.push({ ...b, window: w.window_id })
  }
}
raw.sort((a, b) => ord(a.start_page_id) - ord(b.start_page_id))

// ---- cluster: same position (±2 half-pages) across DIFFERENT windows is the
// same boundary; the same window reporting two nearby starts means two real
// (small) trips, so never merge within a window.
const clusters = []
for (const b of raw) {
  const c = clusters[clusters.length - 1]
  if (c && ord(b.start_page_id) - ord(c.members[c.members.length - 1].start_page_id) <= 2 && !c.members.some((m) => m.window === b.window)) {
    c.members.push(b)
  } else {
    clusters.push({ members: [b] })
  }
}
let merged = clusters.map((c) => {
  const best = c.members.reduce((a, b) => (b.confidence > a.confidence ? b : a))
  return { ...best, agreeing_windows: new Set(c.members.map((m) => m.window)).size }
})

// ---- R1: explicit drops (see adjudication notes above)
const DROP = new Set([
  'B_0001_L', // vol B cover — interior of Germany 2003
  'B_0002_L', // vol B front index — interior of Germany 2003
  'B_0003_R', // "Germany 2005" date misread — Germany 2003 continues here
  'B_0142_R', // overflow pages — interior of Spain 2008
  'B_0145_L', // book-3 index written mid-holiday — interior of Spain 2008
  'B_0146_R', // Spain continuation after the index seam
])
// ---- R2: window-edge continuation artifacts
const CONT_RE = /continu|return leg|overflow|trip end|started in previous/i
const monthsApart = (a, b) => {
  if (!a || !b) return 99
  const pa = String(a).split('-').map(Number)
  const pb = String(b).split('-').map(Number)
  return Math.abs((pa[0] - pb[0]) * 12 + ((pa[1] ?? 6) - (pb[1] ?? 6)))
}
const kept = []
for (const b of merged) {
  if (DROP.has(b.start_page_id)) continue
  const atWindowStart = ord(b.start_page_id) - ord(winStart[b.window] ?? b.start_page_id) <= 3
  const prev = kept[kept.length - 1]
  const sameJourney = prev && prev.kind === 'trip' && monthsApart(b.date_guess, prev.date_guess) <= 1
  if (CONT_RE.test(b.title_guess) && b.confidence <= 0.65) continue
  if (atWindowStart && b.confidence <= 0.6 && b.agreeing_windows <= 1 && sameJourney) continue
  kept.push(b)
}

// ---- derive trips: each trip runs to the half-page before the next boundary
const lastPage = { A: 'A_0350_R', B: 'B_0373_R' }
const prevPid = (pid) => {
  const m = pid.match(/^([AB])_(\d{4})_([LR])$/)
  if (m[3] === 'R') return `${m[1]}_${m[2]}_L`
  const n = Number(m[2]) - 1
  if (n >= 1) return `${m[1]}_${String(n).padStart(4, '0')}_R`
  return m[1] === 'B' ? lastPage.A : pid
}
const slug = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 6).join('-')

const trips = []
const nonTrips = []
const usedIds = new Set()
for (let i = 0; i < kept.length; i++) {
  const b = kept[i]
  const next = kept[i + 1]
  const sameVol = next && next.start_page_id[0] === b.start_page_id[0]
  // The Germany 2003 trip crosses the seam: its true end is just before the
  // first boundary in volume B (the out-of-sequence Normandy page A_0350 and
  // B's front matter sit inside its range and are flagged for the extractor).
  const crosses = b.start_page_id === 'A_0342_R'
  const nextInB = crosses ? kept.slice(i + 1).find((k) => k.start_page_id[0] === 'B') : null
  let end = crosses && nextInB
    ? prevPid(nextInB.start_page_id)
    : next && sameVol
      ? prevPid(next.start_page_id)
      : lastPage[b.start_page_id[0]]
  // adjacent boundaries can squeeze a one-page trip to negative length —
  // every trip includes at least its own start page
  if (ord(end) < ord(b.start_page_id)) end = b.start_page_id
  if (b.kind === 'non_trip') {
    nonTrips.push({ start_page_id: b.start_page_id, end_page_id: end, title: b.title_guess, window: b.window })
    continue
  }
  const year = (String(b.date_guess ?? '').match(/^(\d{4})/) ?? [])[1] ?? 'undated'
  let id = `${year}-${slug(b.title_guess)}`
  while (usedIds.has(id)) id += '-b'
  usedIds.add(id)
  trips.push({
    trip_id: id,
    title_guess: b.title_guess,
    date_guess: b.date_guess ?? null,
    start_page_id: b.start_page_id,
    end_page_id: end,
    mixed_start: !!b.mixed,
    mixed_end: !!(next && next.mixed),
    confidence: b.confidence,
    agreeing_windows: b.agreeing_windows,
    window: b.window,
    flags: [
      ...(crosses ? ['cross_volume', 'date_misread_2005_overridden'] : []),
      ...(b.start_page_id === 'B_0138_R' ? ['spans_notebook_seam'] : []),
      ...(b.start_page_id === 'A_0350_L' ? ['out_of_sequence_page'] : []),
      ...(b.confidence < 0.6 ? ['low_confidence_boundary'] : []),
    ],
  })
}

writeFileSync(
  join(ROOT, 'data/work/trips/segments.json'),
  JSON.stringify({ trips, non_trips: nonTrips, dropped: [...DROP], boundary_count: kept.length }, null, 1),
)
console.log(`${trips.length} trips, ${nonTrips.length} non-trip sections (from ${raw.length} raw boundaries, ${merged.length} merged)`)
const flagged = trips.filter((t) => t.flags.length)
console.log(`flagged: ${flagged.map((t) => `${t.trip_id}[${t.flags.join('+')}]`).slice(0, 12).join(', ')}`)
