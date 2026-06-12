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
  const books = [] // { start_spread, end_spread, byNumber, index_spreads }
  let book = null
  const newBook = (spread) => {
    book = { start_spread: spread, end_spread: spread, byNumber: {}, index_spreads: [] }
    books.push(book)
  }
  let prev = null // { no, page_id }
  for (const f of files) {
    let t
    try {
      t = JSON.parse(readFileSync(join(TDIR, f), 'utf8'))
    } catch {
      anomalies.push({ type: 'unreadable_transcript', file: f })
      continue
    }
    if (!book) newBook(t.spread_id)
    for (const p of t.pages ?? []) {
      if (p.is_index_page && !book.index_spreads.includes(t.spread_id)) {
        // an index page after numbered content signals the next notebook
        if (Object.keys(book.byNumber).length > 10) {
          newBook(t.spread_id)
          prev = null
        }
        book.index_spreads.push(t.spread_id)
      }
      const n = p.handwritten_page_no
      if (n == null) continue
      // numbering reset (e.g. 140 -> 2) without an index in between: new book
      if (prev && n < prev.no - 20 && n <= 12) {
        newBook(t.spread_id)
        prev = null
      }
      if (book.byNumber[n] && book.byNumber[n] !== p.page_id) {
        anomalies.push({ type: 'duplicate_page_no', no: n, pages: [book.byNumber[n], p.page_id] })
      } else {
        book.byNumber[n] = p.page_id
      }
      if (prev) {
        if (n < prev.no) {
          anomalies.push({ type: 'decreasing_page_no', from: prev, to: { no: n, page_id: p.page_id } })
        } else if (n - prev.no > 6) {
          anomalies.push({ type: 'large_jump', from: prev, to: { no: n, page_id: p.page_id } })
        }
      }
      prev = { no: n, page_id: p.page_id }
      book.end_spread = t.spread_id
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
