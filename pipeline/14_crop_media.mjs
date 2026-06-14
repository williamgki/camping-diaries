// S14 — Crop detected diary media regions into standalone WebP images.
// Reads data/work/media/<page_id>.json (vision detection output), crops each
// kept region from the full-res page JPG (or the spread JPG when the region
// spans the gutter), and writes public/media/<trip>/<page_id>_<n>.webp — one
// copy per trip that the page belongs to. Records data/work/media_index.json.
// Idempotent on output-file existence; no network.
import { readFileSync, readdirSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const sharp = require('sharp')

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MEDIA_DIR = join(ROOT, 'data/work/media')
const OUT_ROOT = join(ROOT, 'public/media')
const PAD = 0.03 // fractional padding around each detected box
const MAX_EDGE = 900
const MIN_AREA = 0.02 // skip boxes smaller than 2% of the page

const readJ = (p) => JSON.parse(readFileSync(p, 'utf8'))
const sourcePages = readJ(join(ROOT, 'data/out/source_pages.json'))
const pageById = Object.fromEntries(sourcePages.map((p) => [p.page_id, p]))
const clamp01 = (v) => Math.max(0, Math.min(1, v))

mkdirSync(OUT_ROOT, { recursive: true })
const index = []
let cropped = 0
let skipped = 0

const detectFiles = existsSync(MEDIA_DIR) ? readdirSync(MEDIA_DIR).filter((f) => f.endsWith('.json')) : []
for (const f of detectFiles) {
  const det = readJ(join(MEDIA_DIR, f))
  const page = pageById[det.page_id]
  if (!page) continue
  const regions = (det.regions ?? []).filter((r) => r.keep !== false && r.bbox)
  let n = 0
  for (const r of regions) {
    let [x, y, w, h] = r.bbox.map(Number)
    if (!(w > 0 && h > 0) || w * h < MIN_AREA) continue
    // Gutter-spanning items are clipped on the half-page; crop from the spread.
    const useSpread = r.spans_gutter === true
    const spreadId = det.page_id.replace(/_[LR]$/, '')
    const srcJpg = useSpread
      ? join(ROOT, `scans/vol${page.volume}/spreads/${spreadId}.jpg`)
      : join(ROOT, `scans/vol${page.volume}/pages/${det.page_id}.jpg`)
    if (!existsSync(srcJpg)) {
      skipped++
      continue
    }
    // For a spread crop we only have half-page-normalized coords; widen toward
    // the gutter so the continuation is included (best-effort).
    if (useSpread) {
      const onLeft = det.page_id.endsWith('_L')
      // map the half-page box into spread space (each half ≈ 50% of the spread)
      x = onLeft ? x * 0.54 : 0.46 + x * 0.54
      w = w * 0.6
    }
    const x0 = clamp01(x - PAD)
    const y0 = clamp01(y - PAD)
    const x1 = clamp01(x + w + PAD)
    const y1 = clamp01(y + h + PAD)

    const meta = await sharp(srcJpg).metadata()
    const W = meta.width
    const H = meta.height
    let left = Math.max(0, Math.round(x0 * W))
    let top = Math.max(0, Math.round(y0 * H))
    let cw = Math.max(8, Math.round((x1 - x0) * W))
    let ch = Math.max(8, Math.round((y1 - y0) * H))
    // keep the window fully inside the image
    cw = Math.min(cw, W)
    ch = Math.min(ch, H)
    left = Math.min(left, W - cw)
    top = Math.min(top, H - ch)
    const region = { left, top, width: cw, height: ch }
    n += 1

    for (const tripId of page.trip_ids ?? []) {
      const outDir = join(OUT_ROOT, tripId)
      mkdirSync(outDir, { recursive: true })
      const rel = `media/${tripId}/${det.page_id}_${n}.webp`
      const outPath = join(ROOT, 'public', rel)
      let outW = cw
      let outH = ch
      if (!existsSync(outPath)) {
        const rot = [0, 90, 180, 270].includes(r.rotate_cw) ? r.rotate_cw : 0
        try {
          // Extract to a buffer FIRST, then rotate in a fresh pipeline — sharp
          // otherwise applies rotate before extract and the area goes invalid.
          const cropBuf = await sharp(srcJpg).extract(region).toBuffer()
          let img = sharp(cropBuf)
          if (rot) img = img.rotate(rot) // make the glued item upright
          const resized = await img
            .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 72 })
            .toFile(outPath)
          outW = resized.width
          outH = resized.height
          cropped++
        } catch (e) {
          console.error(`  crop failed ${det.page_id} region ${n} (${JSON.stringify(region)} of ${W}x${H}): ${e.message}`)
          skipped++
          continue
        }
      } else {
        const m = await sharp(outPath).metadata()
        outW = m.width
        outH = m.height
      }
      index.push({
        trip_id: tripId,
        page_id: det.page_id,
        src: rel,
        w: outW,
        h: outH,
        type: r.type ?? 'photo',
        caption: r.caption ?? '',
        spans_gutter: !!r.spans_gutter,
      })
    }
  }
}

writeFileSync(join(ROOT, 'data/work/media_index.json'), JSON.stringify(index, null, 1))
console.log(`media: ${detectFiles.length} pages scanned, ${cropped} crops written, ${skipped} skipped, ${index.length} index rows`)
