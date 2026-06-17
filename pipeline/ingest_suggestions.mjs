// Ingest Google Form responses (CSV export) into suggestions/incoming/*.md.
// Usage: node pipeline/ingest_suggestions.mjs <responses.csv>
// Idempotent: each row is hashed; rows already present (any status) are skipped.
// No network, no secrets. Column matching is fuzzy so it survives Form edits.
import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const INCOMING = join(ROOT, 'suggestions/incoming')
mkdirSync(INCOMING, { recursive: true })

const csvPath = process.argv[2]
if (!csvPath || !existsSync(csvPath)) {
  console.error('Usage: node pipeline/ingest_suggestions.mjs <responses.csv>')
  process.exit(1)
}

// --- minimal RFC-4180 CSV parser (handles quotes, commas, newlines in fields)
function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQ) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else inQ = false
      } else field += c
    } else if (c === '"') inQ = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = '' }
    else field += c
  }
  if (field.length || row.length) { row.push(field); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const rows = parseCsv(readFileSync(csvPath, 'utf8'))
if (rows.length < 2) { console.log('no data rows'); process.exit(0) }
const header = rows[0].map((h) => h.toLowerCase())
const col = (...keys) => {
  const i = header.findIndex((h) => keys.some((k) => h.includes(k)))
  return i >= 0 ? i : -1
}
const ci = {
  time: col('timestamp', 'time'),
  name: col('name', 'who', 'you'),
  trip: col('trip', 'place'),
  type: col('type', 'kind', 'category'),
  text: col('suggestion', 'change', 'correction', 'message', 'detail'),
}

// existing hashes (so re-ingest is idempotent regardless of status)
const seen = new Set()
for (const f of existsSync(INCOMING) ? readdirSync(INCOMING) : []) {
  if (!f.endsWith('.md')) continue
  const m = readFileSync(join(INCOMING, f), 'utf8').match(/^hash:\s*(\w+)/m)
  if (m) seen.add(m[1])
}

const slug = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)
const dateOf = (raw) => {
  const m = String(raw || '').match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/) || String(raw || '').match(/(\d{1,2})[-/](\d{1,2})[-/](\d{4})/)
  if (!m) return new Date().toISOString().slice(0, 10) // fallback: today (only for filename grouping)
  return m[1].length === 4 ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}
const esc = (s) => String(s ?? '').replace(/\n+/g, ' ').trim()

let written = 0
let skipped = 0
const perDay = {}
for (const r of rows.slice(1)) {
  const text = ci.text >= 0 ? r[ci.text] : r[r.length - 1]
  if (!text || !text.trim()) continue
  const submitter = esc(ci.name >= 0 ? r[ci.name] : '') || 'anonymous'
  const trip = esc(ci.trip >= 0 ? r[ci.trip] : '')
  const typeRaw = esc(ci.type >= 0 ? r[ci.type] : '').toLowerCase()
  const type = /gloss|name|spell/.test(typeRaw) ? 'glossary'
    : /place|location|where|map/.test(typeRaw) ? 'place'
    : /photo|image|picture/.test(typeRaw) ? 'photo'
    : /bug|broke|error/.test(typeRaw) ? 'bug'
    : /correct/.test(typeRaw) ? 'correction' : 'other'
  const hash = createHash('sha1').update(`${submitter}|${trip}|${text}`).digest('hex').slice(0, 8)
  if (seen.has(hash)) { skipped++; continue }
  seen.add(hash)
  const date = dateOf(ci.time >= 0 ? r[ci.time] : '')
  perDay[date] = (perDay[date] ?? 0) + 1
  const id = `${date}-${perDay[date]}`
  const fname = `${date}-${slug(submitter)}-${hash}.md`
  const body = `---
id: ${id}
date: ${date}
submitter: ${submitter}
trip: ${trip}
type: ${type}
status: new
source: google-form
hash: ${hash}
---

${text.trim()}
`
  writeFileSync(join(INCOMING, fname), body)
  written++
}
console.log(`ingested ${written} new suggestion(s), skipped ${skipped} already-present`)
