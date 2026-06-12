# Route review report

**Generated:** 2026-06-12 · **Pipeline run:** full rebuild from the two MASTER
PDFs (sha256s in `pipeline/sources.json`) · **Validation:** 0 errors
(`extraction_summary.json → validation`).

## Headline numbers

| | |
|---|---|
| Scanned spreads / pages | 723 / 1,446 (100% transcribed) |
| Physical notebooks detected | 9 (4 in vol A, 5 in vol B), each with its own handwritten index |
| Trips | **260** (1989 → June 2022) |
| Resolved / in review | 189 / 71 (review = unresolved main-route stop or weak confidence) |
| Main-route stops | 1,248 — **100% carry page citation + verbatim excerpt + confidence** |
| Excursions | 396 (kept separate from main routes) |
| Ferry/tunnel crossings | 62 explicit legs (geodesic sea lines, never road-routed) |
| Distinct places | 1,613 (160 unresolved → review queue, never faked; 61 ambiguous flagged) |
| Route geometries | 1,907 (OSRM road legs from committed cache; offline rebuild byte-identical) |
| Review queue | ~1,160 items (unresolved places, ambiguous geocodes, boundary warnings, page-number anomalies, illegible pages) |
| Countries | GB, IE, FR, BE, NL, DE, CH, AT, IT, ES, PT, NO, SE |

## Model usage

- Bulk page transcription: `claude-sonnet-4-6` (chosen by judged calibration —
  see `calibration_report.md`; haiku rejected at 0.30 place accuracy / 54
  hallucinations vs sonnet's 0.955 / 0).
- Index transcription, trip segmentation (32 overlapping windows),
  route extraction for the 53 complex trips, and all audits: `claude-opus-4-8`.
- Route extraction for the 207 small trips: `claude-sonnet-4-6`.
- Orchestration, merge adjudication, final review: Claude Fable.

## The five mandatory accuracy audits — all pass

Adversarial opus auditors verified canonical data against the original page
images (full verdicts in workflow run `wf_70e542ef-1ad`):

**(a) Ireland 1996 incl. County Down — PASS.** The southern loop (Dún
Laoghaire → Wicklow → Kilkenny → Cashel → Dingle → Clare → Clonmacnoise →
Lough Ree) precedes Killyleagh, Co. Down, matching the diary's own hand-drawn
numbered route map (A_0186_R, "Ireland August 1996", entries 1–18). Both Irish
Sea crossings are explicit ferry legs; Dún Laoghaire is named on the page,
Holyhead is marked `inferred` (the diary says "Anglesey" but never writes
"Holyhead"). All 29 stops citation-checked.

**(b) Norway 1998 via Newcastle ferry — PASS.** Outbound "North Shields,
New Castle … Ferry to Bergen" and return Stavanger → North Shields are named
on A_0232_R / A_0250_R and modelled as the only two ferry legs. The auditor
decoded all 23 road-leg geometries: **zero points in the Low Countries.**
Finding: a transcript misread ("Oslo" for **Dale**, the knitwear town) in an
item already excluded from the route — corrected via
`patches/2026-06-12-audit-corrections.json`.

**(c) Dover–Calais inferred only when unnamed — PASS.** France 1991
(Loire/Auvergne): the auditor read every spread around the crossing; the diary
opens mid-journey in France and never names a port. The dover-calais legs are
`inferred: true` with a user-visible reason.

**(d) Fixed-base holiday with separated excursions — PASS.** Upper Cantref
Farm, Brecon 1995: main route is exactly home → Bewdley → farm → Malvern →
home; all six day trips live in `excursions.json` with their own citations.
Findings: a local Evensong church had been geocoded ~40 km away, and
"[?Llangynach]" is actually **Llanfrynach** (A_0150_R) — both fixed via
`pipeline/curated_places.json` and re-routed.

**(e) Mixed-page / volume-boundary case — PASS.** The Germany 2003 trip spans
the A/B volume seam (`pdf_spreads A_0342 → B_0009`, volume "A+B"). Volume B
opens mid-trip leaving Weimar; the transcribed date "Saturday August 6 2005"
on B_0003_R is a misread, overridden on three independent anchors: the
travellers' ages (Thomas 23 / John ~16 / Charles 14, all → 2003), vol A's
"Friday August 8th" in Weimar with "20*C+M+B*03" Epiphany chalk, and B_0004's
"the Wall came down – 1991–2003". The mixed B_0009 page is split correctly
between the Germany and Cotswolds trips, and the override is recorded in the
review queue (`seg-` item, `date_misread_2005_overridden` flag). The same
pattern recurs inside volume B where a new notebook (index at B_0145) was
started mid-way through the Spain 2008 trip — also modelled as one trip.

## Honest-uncertainty inventory

- 160 unresolved places: predominantly private locations ("Kate & Jamie's
  farm", named friends' houses), unnamed campsites, and faint-pencil readings
  marked `[?…]`. They are cited and listed, not mapped.
- 71 trips in `review` status, each with queue items explaining why.
- All Dover–Calais defaults, Holyhead inferences, and region anchors
  (Hadrian's Wall etc.) carry `inferred`/`approximate` flags visible in the
  app (review mode shows confidence per stop).
- Page-number anomalies (sonnet's known weakness, caught by reconciliation)
  are queued; trips key off scan ids, so they do not affect routes.

## Corrections workflow (verified end-to-end)

Review mode → resolve item → Export patches → drop file in `patches/` →
`npm run assemble` re-applies deterministically (review-queue patches are
addressed by stable item id). One audit correction is already baked in this
way, plus two coordinate fixes via `pipeline/curated_places.json`.
