// S6 — Reconcile handwritten diary page numbers with PDF page order.
// Each scanned volume is a COMPILATION of several physical notebooks; the
// handwritten page numbering restarts in each notebook (each also has its own
// index page). This builds data/work/page_map.json segmenting each volume into
// "books" with their own number→page_id maps, validates monotonicity within a
// book, and cross-checks the front index. Anomalies feed the review queue.
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TDIR = join(ROOT, 'data/work/transcripts')

const result = {}
for (const vol of ['A', 'B']) {
  const files = readdirSync(TDIR)
    .filter((f) => f.startsWith(`${vol}_`) && f.endsWith('.json'))
    .sort()
  const anomalies = []

  // Load all transcripts in spread order.
  const spreads = []
  for (const f of files) {
    try {
      spreads.push(JSON.parse(readFileSync(join(TDIR, f), 'utf8')))
    } catch {
      anomalies.push({ type: 'unreadable_transcript', file: f })
    }
  }

  // Pass 1: notebook boundaries = clusters of index spreads. Each physical
  // notebook in the compiled volume opens with its own handwritten index;
  // page-number readings are too noisy to use for splitting (misreads would
  // create false notebooks), so indexes are the only split signal.
  const indexSpreadNums = spreads
    .filter((t) => (t.pages ?? []).some((p) => p.is_index_page))
    .map((t) => Number(t.spread_id.split('_')[1]))
  const boundaries = []
  for (const n of indexSpreadNums) {
    const last = boundaries[boundaries.length - 1]
    if (last && n - last.end <= 2) last.end = n
    else boundaries.push({ start: n, end: n })
  }

  // Pass 2: assign every spread to the book opened by the latest boundary.
  const books = boundaries.map((b) => ({
    index_at: b,
    start_spread: null,
    end_spread: null,
    byNumber: {},
    index_spreads: [],
  }))
  if (!books.length) books.push({ index_at: null, start_spread: null, end_spread: null, byNumber: {}, index_spreads: [] })
  let prev = null
  for (const t of spreads) {
    const n = Number(t.spread_id.split('_')[1])
    let bi = 0
    for (let i = 0; i < boundaries.length; i++) if (n >= boundaries[i].start) bi = i
    const book = books[bi]
    if (!book.start_spread) {
      book.start_spread = t.spread_id
      prev = null // numbering restarts with each notebook
    }
    book.end_spread = t.spread_id
    for (const p of t.pages ?? []) {
      if (p.is_index_page && !book.index_spreads.includes(t.spread_id)) book.index_spreads.push(t.spread_id)
      const no = p.handwritten_page_no
      if (no == null) continue
      if (book.byNumber[no] && book.byNumber[no] !== p.page_id) {
        anomalies.push({ type: 'duplicate_page_no', no, pages: [book.byNumber[no], p.page_id] })
      } else {
        book.byNumber[no] = p.page_id
      }
      if (prev) {
        if (no < prev.no) anomalies.push({ type: 'decreasing_page_no', from: prev, to: { no, page_id: p.page_id } })
        else if (no - prev.no > 6) anomalies.push({ type: 'large_jump', from: prev, to: { no, page_id: p.page_id } })
      }
      prev = { no, page_id: p.page_id }
    }
  }
  const byNumber = books[0]?.byNumber ?? {} // front index targets the first book

  // Cross-check against the transcribed index, if present.
  const indexPath = join(ROOT, `data/work/index/vol${vol}_index.json`)
  const indexCheck = { entries: 0, mapped: 0, unmapped: [] }
  if (existsSync(indexPath)) {
    const idx = JSON.parse(readFileSync(indexPath, 'utf8'))
    for (const e of idx.entries ?? []) {
      indexCheck.entries++
      if (byNumber[e.page_no]) indexCheck.mapped++
      else indexCheck.unmapped.push({ page_no: e.page_no, text: e.text })
    }
  }

  result[vol] = {
    transcript_files: files.length,
    books: books.map((b) => ({
      start_spread: b.start_spread,
      end_spread: b.end_spread,
      numbered_pages: Object.keys(b.byNumber).length,
      index_spreads: b.index_spreads,
      byNumber: b.byNumber,
    })),
    anomalies,
    indexCheck,
  }
  console.log(
    `vol ${vol}: ${files.length} transcripts, ${books.length} notebooks ` +
      `(${books.map((b) => `${b.start_spread}→${b.end_spread}:${Object.keys(b.byNumber).length}pp`).join(', ')}), ` +
      `${anomalies.length} anomalies, front index ${indexCheck.mapped}/${indexCheck.entries} mapped`,
  )
}

writeFileSync(join(ROOT, 'data/work/page_map.json'), JSON.stringify(result, null, 1))
console.log('wrote data/work/page_map.json')
