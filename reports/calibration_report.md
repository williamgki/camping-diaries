# Transcription model calibration report

**Date:** 2026-06-12 · **Method:** 10 stratified spreads (5 per volume, spanning
eras, ink types, photo/caption pages, printed ephemera, route sketches)
transcribed independently by `claude-haiku-4-5` and `claude-sonnet-4-6`, then
judged blind by `claude-opus-4-8` against the scan images.

## Result: claude-sonnet-4-6 selected for bulk transcription

| Metric (mean over 10 spreads) | haiku-4-5 | sonnet-4-6 |
|---|---|---|
| Place-name accuracy | 0.303 | **0.955** |
| Overall quality | 0.330 | **0.930** |
| Hallucinated words/places (total) | 54 | **0** |
| Judge wins | 0 | **10** |

## Decisive failure modes in haiku (why it was rejected)

- **Confident place inventions that would poison geocoding:** "Arrog Camp"
  (Dinas Camp), "Harbach" (Harlech), "Pande Peyrot" (Pas de Peyrol), "Aosane"
  (Roanne), "Rhino" (Rhinog), "Sword Breuille" (Bréville), "Killeyone"
  (Killhope), "Lindbands" (Vindolanda).
- **Whole-sentence hallucination** on faint captions (invented people/places
  not on the page, e.g. "Atlantic", "Bridgton", "Helen" on A_0135).
- **Low legibility honesty** (0.2–0.55): guessed confidently instead of
  marking `[illegible]`/`[?…]`.

## Sonnet quality notes

- Read faint pencil, rotated printed ephemera, accented French/German names
  (Bréville, Bénouville, umlauts) correctly; flagged genuine uncertainty
  (`[?Middlewich]`, `[?Pas] de Peyrol`) instead of guessing.
- Known weakness: occasional page-number misread (A_0200: read 30, scan shows
  31) → handled by the dedicated page-reconciliation stage (S6), which
  validates page-number monotonicity and cross-checks the handwritten index.

## Cost implication

Bulk run (723 spreads) on sonnet ≈ $27 vs ≈ $9 on haiku — accepted: haiku's
30% place accuracy would corrupt the entire downstream route extraction.

Raw judgments: `data/work/calibration/` (haiku/, sonnet/ transcripts) and the
per-spread judge notes embedded in workflow run `wf_f48416fc-e14`.
