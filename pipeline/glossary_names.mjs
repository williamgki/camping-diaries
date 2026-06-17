// Shared verbatim-text substitutions from pipeline/glossary.json `names`.
// Applied to user-visible strings at assemble + moments time (the source work
// files stay pristine, so this is fully reversible by editing the glossary).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const NAMES = JSON.parse(readFileSync(join(ROOT, 'pipeline/glossary.json'), 'utf8')).names ?? []
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const RULES = NAMES.map((r) => {
  const guard = (r.unless_followed_by ?? []).map(esc).join('|')
  return {
    re: new RegExp(`\\b${esc(r.from)}\\b${guard ? `(?!\\s+(?:${guard})\\b)` : ''}`, 'g'),
    to: r.to,
  }
})

export function applyNames(value) {
  if (typeof value !== 'string' || !value) return value
  let out = value
  for (const r of RULES) out = out.replace(r.re, r.to)
  return out
}
