# Camping Diaries · 1989–2022

A private family atlas of thirty-three years of camping-van trips, rebuilt from
two scanned handwritten diary volumes. A **map-first React site** backed by a
**reproducible, evidence-first extraction pipeline**: every route stop is cited
to a diary page, uncertainty is explicit, the original scans and glued-in photos
are one click away, and a "play journey" mode animates each trip with diary
photos and quotations.

- **Live:** https://williamgki.github.io/camping-diaries/
- **Repo:** https://github.com/williamgki/camping-diaries
- **Local project root:** `~/Sites/camping-diaries`

---

## Table of contents

1. [What it is](#1-what-it-is)
2. [Quick start](#2-quick-start)
3. [How it was built (architecture)](#3-how-it-was-built-architecture)
4. [The data pipeline, stage by stage](#4-the-data-pipeline-stage-by-stage)
5. [Canonical data model](#5-canonical-data-model)
6. [The React app](#6-the-react-app)
7. [The glossary (corrections engine)](#7-the-glossary-corrections-engine)
8. [Suggestions / feedback workflow](#8-suggestions--feedback-workflow)
9. [Deployment](#9-deployment)
10. [Reproducibility & offline rebuilds](#10-reproducibility--offline-rebuilds)
11. [Repository layout](#11-repository-layout)
12. [Common maintenance tasks](#12-common-maintenance-tasks)
13. [Reports & provenance](#13-reports--provenance)
14. [Limitations & privacy](#14-limitations--privacy)

---

## 1. What it is

Two scanned diaries — **"MASTER A Van 1989-2003.pdf"** (350 spreads) and
**"MASTER B 2003-2019.pdf"** (373 spreads, actually running to **June 2022**) —
are the sole source of truth. A vision-LLM pipeline transcribes every page,
segments the narrative into trips, extracts cited route evidence, geocodes and
road-routes it, crops the glued-in photos, and curates evocative quotations. The
result is a static site you can explore by map, timeline, search, and animated
playback.

**Current dataset** (`data/out/extraction_summary.json`):

| | |
|---|---|
| Scanned spreads / pages | 723 / 1,446 (100 % transcribed) |
| Trips | **260** (May 1989 → June 2022) |
| Resolved / in review | 190 / 70 |
| Main-route stops | 1,248 — **100 % carry a page citation + excerpt + confidence** |
| Excursions (day trips) | 396 |
| Ferry/tunnel crossings | explicit geodesic legs, never road-routed |
| Distinct places | 1,613 |
| Route geometries | 1,912 |
| Cropped diary images | 587 (across 137 trips) |
| Playback "moments" | 1,159 (across 260 trips) |
| Review-queue items | 1,159 (unresolved/ambiguous/boundary/illegible) |

---

## 2. Quick start

```sh
cd ~/Sites/camping-diaries
npm install
npm run dev          # local dev server → http://localhost:5173
npm run build        # production static build → dist/
npm run preview      # serve the production build
npm run deploy       # build + publish to GitHub Pages (gh-pages branch)
```

The site is fully static. It needs network access only for **map tiles** (vector
tiles from OpenFreeMap) — all trip data, scans and photos are served locally.
`public/data/` and `public/scans/` + `public/media/` must exist (produced by the
pipeline, below; not committed because they are large).

---

## 3. How it was built (architecture)

```
  diary PDFs ──▶ render ──▶ split ──▶ [vision transcribe] ──▶ reconcile pages
                                                 │
                                                 ▼
                                   [segment into trips] ──▶ [extract cited routes]
                                                 │
                              ┌──────────────────┼───────────────────┐
                              ▼                  ▼                   ▼
                          geocode            [detect media]      [curate quotes]
                              ▼                  ▼                   ▼
                           route ──▶ assemble ──▶ crop media ──▶ build moments
                                          │
                                          ▼
                                       validate ──▶ public/data + public/scans + public/media
                                          │
                                          ▼
                                    React app (Vite) ──▶ GitHub Pages
```

- **Deterministic stages** are plain Node/Python scripts (`pipeline/NN_*.mjs|py`),
  idempotent and offline-rebuildable from committed caches.
- **`[bracketed]` stages** are vision/text LLM passes. They were run as fan-out
  subagent workflows; their **prompts** live in `pipeline/prompts/` and their
  **outputs are committed** under `data/work/`, so the deterministic pipeline can
  rebuild everything without re-running any model.
- **Model tiers used:** `claude-sonnet-4-6` for page transcription (chosen over
  haiku by a judged 10-spread calibration — `reports/calibration_report.md`),
  media detection, and quote curation; `claude-opus-4-8` for index
  transcription, trip segmentation, route extraction and the accuracy audits.

**Stack:** React 18 + TypeScript + Vite 6; MapLibre GL v5 with a customised
OpenFreeMap "positron" vector style checked in at `src/map/style.json`; zustand
for state; MiniSearch for search; sharp (image crops) and ajv (validation) in the
pipeline.

---

## 4. The data pipeline, stage by stage

Run end-to-end with `npm run pipeline`, or individually. Numbers are the stage
prefix on each `pipeline/` file. Bracketed stages are LLM workflows (no npm
script — re-run via the prompts in `pipeline/prompts/`).

| Stage | Script / prompt | What it does |
|---|---|---|
| S0 | `00_manifest.mjs` (`npm run manifest`) | Hashes the source PDFs; writes `pipeline/sources.json` + `reports/missing_sources.md`. |
| S1 | `01_render.py` (`npm run render`) | PyMuPDF renders each PDF page (a two-page spread) to a 200-DPI JPEG → `scans/vol{A,B}/spreads/`. |
| S2 | `02_split.py` (`npm run split`) | Splits each spread at the gutter into left/right page images + ≤1.15 MP LLM derivatives → `scans/vol{A,B}/{pages,llm}/` + `data/work/split_manifest.json`. |
| S3 | `prompts/transcribe_spread.md` | **Calibration:** 10 spreads × haiku vs sonnet, opus-judged → picked sonnet. |
| S4 | `prompts/transcribe_index.md` | Transcribes each notebook's handwritten index (page→place list). → `data/work/index/`. |
| S5 | `prompts/transcribe_spread.md` | **Bulk transcription**, one agent per spread → `data/work/transcripts/*.json` (verbatim text, dates, headings, place mentions, photo flags, legibility). |
| S6 | `06_reconcile_pages.mjs` (`npm run reconcile`) | Maps handwritten page numbers ↔ scan order, per physical notebook → `data/work/page_map.json`. |
| S7 | `07_prep_windows.mjs` + `prompts/segment.md` + `07b_merge_segments.mjs` + `08_prep_trips.mjs` | **Trip segmentation:** overlapping windows detect trip boundaries; merge + adjudicate into `data/work/trips/segments.json`; build per-trip source bundles. Handles the cross-volume Germany 2003 trip and notebook-seam cases. |
| S8 | `prompts/extract_route.md` | **Per-trip route extraction:** ordered stops with role, citation, excerpt, confidence; crossings; excursions; unresolved items → `data/work/trips/trip_*_route.json`. |
| S9 | `09_geocode.mjs` (`npm run geocode`) | Geocodes place names via Nominatim (1 req/s, cached). Consults `pipeline/curated_places.json` + `pipeline/glossary.json` first; vague regions → `region_anchors.json` (marked approximate). |
| S10 | `10_route.mjs` (`npm run route`) | Road legs via public OSRM (cached); ferries/tunnels as geodesic sea lines from `pipeline/ferries.json` — never road-routed. |
| S11 | `11_assemble.mjs` (`npm run assemble`) | Builds the 9 canonical JSON outputs + per-trip geometry chunks + WebP scan derivatives + MiniSearch index + `public/data/glossary.json`; applies `glossary.json` name substitutions and `patches/`. `--skip-images` skips WebP regeneration. |
| S12 | `12_validate.mjs` (`npm run validate`) | ajv schemas + rules: every canonical stop cited; ferries never road-routed; Norway not via the Low Countries; home at 86 Westfield Road; etc. Exits non-zero on failure. |
| S13 | `prompts/detect_media.md` → `14_crop_media.mjs` (`npm run media:crop`) | **Media detection** (vision: bounding boxes + rotation of glued photos/postcards/sketches/maps) → crop & rotate upright → `public/media/<trip>/*.webp` + `data/work/media_index.json`. |
| S15 | `prompts/curate_quotes.md` → `16_build_moments.mjs` (`npm run moments`) | **Quote curation** (one evocative verbatim line per stop + a trip epigraph) → joined with stops + cropped images into `public/data/moments/<trip>.json`. |

Supporting files: `pipeline/make_style.py` (regenerates the map style from
upstream OpenFreeMap), `pipeline/glossary_names.mjs` (shared name-substitution
helper), `pipeline/ingest_suggestions.mjs` (see §8), `pipeline/schemas/`.

---

## 5. Canonical data model

`npm run assemble` writes nine JSON files to `data/out/` (and copies the
runtime-needed ones to `public/data/`). Schemas: `pipeline/schemas/`.

| File | Contents |
|---|---|
| `trips.json` | id, slug, title, volume, date range, year, travellers, countries, summary, page ranges, stats, confidence, status (`resolved`/`review`). |
| `places.json` | place_id → normalized name, display name, lon/lat, country, precision (`exact`/`locality`/`region_anchor`/`approximate`/`unresolved`), curated flag, ambiguity, source trips. |
| `route_evidence.json` | per trip, ordered stops: place_id, role (`home`/`departure`/`overnight_base`/`main_stop`/`transit_stop`/`crossing_terminal`/`inferred_anchor`/`unresolved`), excerpt, source_page_id, confidence, inferred flag. |
| `routes.json` | per trip: ordered legs with mode (`road`/`ferry`/`tunnel`), geometry ref, distance, inferred/uncertain flags. |
| `route_geometry.json` | geometry_ref → polyline6-encoded coordinates + source (`osrm`/`geodesic`). |
| `excursions.json` | day trips kept separate from the main route, each with base, stops, citations, geometry refs. |
| `source_pages.json` | every page: volume, pdf page, side, handwritten page no, WebP image paths, trip ids, index/sketch flags, legibility, photo captions. |
| `review_queue.json` | typed open issues: unresolved place, ambiguous geocode, boundary conflict, illegible page, page-number anomaly, routing issue. |
| `extraction_summary.json` | source hashes, all counts, % cited stops, validation result. |

Runtime-only extras in `public/data/`: per-trip `geometry/<trip>.json`,
`moments/<trip>.json`, `underlay.json` (all-trips faint layer), `search_index.json`,
`glossary.json` (human-readable glossary for the feedback panel).

---

## 6. The React app

`src/` — entry `main.tsx` → `App.tsx`. State is one zustand store (`src/store.ts`).
URL state (selected trip, open page, review mode) syncs via `src/lib/useUrlSync.ts`,
so links are shareable.

| Component | Role |
|---|---|
| `MapCanvas.tsx` | MapLibre map; layers for all-trips underlay, selected route (road/ferry/excursion/uncertain), stops; playback animation (marker + drawn line + camera follow + dwell at moments); zoom controls. |
| `TopBar.tsx` | Title, search box, **Filters**, **Review**, **Suggest** buttons. |
| `TimelinePanel.tsx` | Left panel: trips by decade/year, filterable. |
| `TripDetailPanel.tsx` | Right panel: ordered stops with roles, confidence, citation chips (open scans); play/scrub controls; crossings; excursions. |
| `ScanDrawer.tsx` | Bottom drawer: the original diary page scan for a cited page, with prev/next. |
| `PlaybackMoments.tsx` | Lower-left "moment card" during playback: cropped diary photo + verbatim quote + place·date. |
| `ReviewOverlay.tsx` | Review mode: the review queue, low-confidence/unresolved surfacing, and JSON-patch export. |
| `FeedbackPanel.tsx` | **Suggest** panel: the glossary (read-only) + link to the suggestion form (see §8). |
| `SearchBox.tsx` | Client-side search (MiniSearch) over trips, places and diary text. |

Helpers in `src/lib/`: `data.ts` (loaders), `playback.ts` (route-walking maths),
`moments.ts` (moment placement along the route), `links.ts` (external links incl.
the suggestion-form URL), `useUrlSync.ts`.

---

## 7. The glossary (corrections engine)

`pipeline/glossary.json` is the single control point for family corrections.
Three sections:

- **`home`** — the family home, used as the start/end of every trip. Currently
  **86 Westfield Road, Edgbaston (B15 3JG)**.
- **`places`** — keyed by the slug of a stop's normalized name; overrides
  geocoding with corrected coordinates + label (e.g. the family's "Dinas" →
  Dinas Farm, Llanbedr; "Kate & Jamie's farm" → Brook House Farm, Avenbury).
  Read first by `09_geocode.mjs` (alongside `curated_places.json`).
- **`names`** — verbatim text substitutions applied to all visible strings at
  assemble/moments time (e.g. `Kay` → `Kaz`, John's partner), with guards like
  `unless_followed_by: ["Knapton"]` so the place "Kay Knapton" is left alone.
  Applied via `pipeline/glossary_names.mjs`; trip-id slugs are never changed, so
  existing shared links keep working.

`assemble` also emits a human-readable `public/data/glossary.json` that the
**Suggest** panel displays, so family can see what's already taught.

To apply a correction: edit `pipeline/glossary.json`, then
`npm run geocode && npm run route && npm run assemble && npm run moments && npm run validate && npm run deploy`.

---

## 8. Suggestions / feedback workflow

Family submit corrections in plain English; nothing changes live — everything is
reviewed and applied by hand.

1. **Submit** — the site's **Suggest** button opens a Google Form
   (`SUGGESTION_FORM_URL` in `src/lib/links.ts`):
   https://forms.gle/p68eJcQoMV8eJwuCA — *"Place and Trip Feedback Form"*
   (Your name · Which trip or place · Type · Your suggestion). No login needed;
   nothing runs on the static site → safe.
2. **Collect** — responses land in a Google Sheet you own (link a Sheet from the
   form's Responses tab). Export it as CSV.
3. **Ingest** — `node pipeline/ingest_suggestions.mjs <responses.csv>` turns each
   new row into a reviewable Markdown file in `suggestions/incoming/`, deduped by
   content hash (re-running never duplicates).
4. **Review & apply** — work through `suggestions/incoming/*.md`, set each
   `status:` (`applied`/`rejected`/…). Promote glossary-type items into
   `pipeline/glossary.json` (§7), rebuild and redeploy.

`suggestions/README.md` documents this loop; the folder is seeded with the
family's feedback to date.

---

## 9. Deployment

Hosted on **GitHub Pages**, public, at https://williamgki.github.io/camping-diaries/.

```sh
npm run deploy        # = bash deploy.sh
```

`deploy.sh` runs `npm run build`, then publishes the built `dist/` (≈350 MB,
including scans + photos) to the **`gh-pages` branch** from a clean throwaway tree
with `git add -A`. **Why not the gh-pages npm tool / a git-push auto-deploy:** the
heavy asset folders (`scans/`, `media/`, `data/geometry/`, `data/moments/`) are
`.gitignore`d, and those tools inherit the ignore rules and silently drop the
216 MB `scans/` folder. The clean-tree force-add avoids that. GitHub Pages takes
~1–2 min to go live after each deploy.

Vite is configured with `base: './'` (relative) so the site works at the
`/camping-diaries/` sub-path, and a `public/.nojekyll` file stops Jekyll mangling
the asset folders.

The **source `main` branch** holds code + the committed pipeline outputs/caches
(it does *not* hold the heavy assets); the **`gh-pages` branch** holds the full
built site.

---

## 10. Reproducibility & offline rebuilds

- `data/cache/` (committed) holds the **geocode cache** (2,184 entries) and
  **OSRM route cache** (2,150 files). With these, `npm run geocode -- --offline`
  and `npm run route -- --offline` rebuild the data **byte-identically with zero
  network access** (verified).
- The LLM stages' outputs are committed under `data/work/` (transcripts, index,
  segments, per-trip routes, media detections, quotes), so the deterministic
  pipeline reproduces the whole site without re-running any model.
- Only the large derived artefacts are gitignored and regenerated locally:
  `scans/`, `public/scans/`, `public/media/`, `public/data/geometry/`,
  `public/data/moments/`.

---

## 11. Repository layout

```
camping-diaries/
├── README.md                 # this file
├── deploy.sh                 # build + publish dist/ to gh-pages
├── index.html  vite.config.ts  tsconfig*.json  package.json
├── src/                      # React app
│   ├── components/  lib/  store.ts  types.ts  map/style.json
├── public/
│   ├── data/                 # runtime JSON (+ geometry/, moments/ — gitignored)
│   ├── scans/                # WebP page scans (gitignored)
│   └── media/                # cropped diary photos (gitignored)
├── pipeline/
│   ├── 00…16 *.mjs|py         # the pipeline stages (§4)
│   ├── prompts/              # the LLM-stage prompts
│   ├── schemas/              # ajv output schemas
│   ├── glossary.json         # corrections engine (§7)
│   ├── curated_places.json  ferries.json  region_anchors.json  sources.json
│   └── ingest_suggestions.mjs  glossary_names.mjs  make_style.py
├── data/
│   ├── work/                 # committed LLM outputs + intermediates
│   ├── cache/                # committed geocode + OSRM caches (offline rebuild)
│   └── out/                  # the 9 canonical JSON outputs
├── patches/                  # review-mode JSON-patch corrections (applied at assemble)
├── suggestions/              # family suggestion "database" (§8)
├── reports/                  # provenance reports (§13)
└── scans/                    # rendered page images (gitignored)
```

---

## 12. Common maintenance tasks

**Fix a place or a name:** edit `pipeline/glossary.json` →
`npm run geocode && npm run route && npm run assemble && npm run moments && npm run validate && npm run deploy`.

**Process new form submissions:** download the responses CSV →
`node pipeline/ingest_suggestions.mjs responses.csv` → review
`suggestions/incoming/*.md` → apply via the glossary → rebuild + deploy.

**Change the suggestion form:** update `SUGGESTION_FORM_URL` in
`src/lib/links.ts` → `npm run deploy`.

**Re-run an LLM stage** (rare): use the matching prompt in `pipeline/prompts/`;
write outputs to the same `data/work/` paths, then re-run the deterministic
stages from `assemble` onward.

**Rebuild everything from the PDFs:** `npm run pipeline` (re-runs deterministic
stages; LLM stages reuse their committed `data/work/` outputs).

---

## 13. Reports & provenance

- `reports/missing_sources.md` — what source material exists and what was
  searched for but not found (a prior 2026 site, deleted).
- `reports/calibration_report.md` — the transcription model bake-off (sonnet
  chosen over haiku, 0 vs 54 hallucinated place names).
- `reports/route_review.md` — the route-accuracy audit, including the five
  mandatory calibration cases (Ireland/County Down, Norway via the Newcastle
  ferry, inferred Dover–Calais, fixed-base excursions, cross-volume Germany 2003).

---

## 14. Limitations & privacy

- **Transcription** is vision-LLM based; faint pencil pages carry low legibility
  scores and uncertain readings are marked `[?…]`/`[illegible]` rather than
  guessed. Unresolved places/trips are listed in the review queue, not invented.
- **Geocoding/routing** use today's place names and road network (OSRM); historic
  roads and ferry schedules are out of scope. Vague regions use representative
  anchors marked approximate.
- **Privacy:** the site is **public** and contains family names, photos, and the
  home address (which already appears on the first diary scan). Only bare place
  names are ever sent to the public geocoding/routing/tile services. To make it
  private later: change the repo visibility in GitHub Settings — Pages keeps
  working.
```
