// S7-prep — Build segmentation window files: trimmed transcript bundles with
// overlapping spread ranges, plus the index entries of the notebooks they touch.
// Output: data/work/segwin/<window_id>.json
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const TDIR = join(ROOT, 'data/work/transcripts')
const ODIR = join(ROOT, 'data/work/segwin')
mkdirSync(ODIR, { recursive: true })

const WIDTH = 30
const STEP = 24
const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'))
const pageMap = readJ(join(ROOT, 'data/work/page_map.json'))

const indexes = {}
for (const f of readdirSync(join(ROOT, 'data/work/index'))) {
  const idx = readJ(join(ROOT, 'data/work/index', f))
  indexes[f] = idx
}

function trimPage(p) {
  return {
    page_id: p.page_id,
    no: p.handwritten_page_no,
    blank: p.blank || undefined,
    dates: (p.dates ?? []).map((d) => d.raw),
    headings: p.headings ?? [],
    places: p.place_mentions ?? [],
    sketch: p.route_sketch || undefined,
    sketch_desc: p.route_sketch_description ?? undefined,
    index_page: p.is_index_page || undefined,
    captions: p.photo_captions?.length ? p.photo_captions : undefined,
    text: (p.full_text ?? '').slice(0, 2600),
  }
}

const windows = []
for (const vol of ['A', 'B']) {
  const files = readdirSync(TDIR).filter((f) => f.startsWith(`${vol}_`)).sort()
  const n = files.length
  let w = 0
  for (let start = 0; start < n; start += STEP) {
    const slice = files.slice(start, start + WIDTH)
    if (slice.length < 3) break
    w++
    const id = `${vol}_w${String(w).padStart(2, '0')}`
    const spreads = slice.map((f) => {
      const t = readJ(join(TDIR, f))
      return { spread_id: t.spread_id, pages: (t.pages ?? []).map(trimPage) }
    })
    // attach index entries of the books whose ranges overlap this window
    const sn = (sid) => Number(sid.split('_')[1])
    const lo = sn(spreads[0].spread_id)
    const hi = sn(spreads[spreads.length - 1].spread_id)
    const books = (pageMap[vol]?.books ?? []).filter(
      (b) => sn(b.start_spread) <= hi && sn(b.end_spread) >= lo,
    )
    const indexEntries = []
    for (const [name, idx] of Object.entries(indexes)) {
      if (idx.volume !== vol) continue
      indexEntries.push({ file: name, entries: idx.entries })
    }
    writeFileSync(
      join(ODIR, `${id}.json`),
      JSON.stringify({ window_id: id, volume: vol, books: books.map((b) => ({ start: b.start_spread, end: b.end_spread, index_spreads: b.index_spreads })), index_entries: indexEntries, spreads }, null, 1),
    )
    windows.push({ id, vol, from: spreads[0].spread_id, to: spreads[spreads.length - 1].spread_id })
    if (start + WIDTH >= n) break
  }
}

// Cross-volume window: end of A + start of B (the 2003 Germany trip may span volumes).
const aFiles = readdirSync(TDIR).filter((f) => f.startsWith('A_')).sort().slice(-14)
const bFiles = readdirSync(TDIR).filter((f) => f.startsWith('B_')).sort().slice(0, 14)
const xSpreads = [...aFiles, ...bFiles].map((f) => {
  const t = readJ(join(TDIR, f))
  return { spread_id: t.spread_id, pages: (t.pages ?? []).map(trimPage) }
})
writeFileSync(
  join(ODIR, 'X_w01.json'),
  JSON.stringify({ window_id: 'X_w01', volume: 'A+B', note: 'volume boundary window: does the trip at the end of A continue into the start of B?', spreads: xSpreads }, null, 1),
)
windows.push({ id: 'X_w01', vol: 'A+B', from: aFiles[0], to: bFiles[bFiles.length - 1] })

writeFileSync(join(ODIR, '_windows.json'), JSON.stringify(windows, null, 1))
console.log(`${windows.length} windows written to data/work/segwin/`)
if (existsSync(join(ODIR, '_windows.json'))) console.log(windows.map((w) => `${w.id}:${w.from}→${w.to}`).join(' '))
