# Camping Diaries · 1989–2019

A private family atlas of thirty years of camping-van trips, rebuilt from the two
scanned handwritten diary volumes. A map-first React site backed by an
evidence-first extraction pipeline: every route stop is cited to a diary page,
uncertainty is explicit, and the original scans are one click away.

## Run it

```sh
npm install
npm run dev        # local site at http://localhost:5173
npm run build      # production static build in dist/
npm run preview    # serve the production build
```

The site is fully static. `public/data/` (canonical JSON) and `public/scans/`
(WebP page images) must exist — they are produced by the pipeline below and are
not committed (scans are ~hundreds of MB).

## Sources

- `~/Downloads/MASTER A Van 1989-2003.pdf` — 350 scanned spreads
- `~/Downloads/MASTER B 2003-2019.pdf` — 373 scanned spreads

Each PDF page is a two-page spread. Each volume compiles several physical
notebooks; handwritten page numbering restarts per notebook, and each notebook
has its own handwritten index (page number → places). See
`reports/missing_sources.md` for material that is known-lost (the 2026 legacy
site's JSON) and therefore absent from this rebuild.

## Rebuilding the data

```sh
npm run manifest    # S0  sources.json + missing-source report
npm run render      # S1  PDFs → scans/vol{A,B}/spreads/*.jpg (200 DPI)
npm run split       # S2  spreads → page halves + LLM derivatives + split manifest
# S3–S8 are LLM workflow stages (see pipeline/prompts/): calibration,
#   per-spread transcription → data/work/transcripts/,
#   index transcription → data/work/index/,
#   trip segmentation → data/work/trips/segments.json,
#   per-trip route extraction → data/work/trips/trip_*_route.json
npm run reconcile   # S6  handwritten page numbers ↔ scan order (per notebook)
npm run geocode     # S9  Nominatim (1 req/s, cached) + curated ports/regions
npm run route       # S10 OSRM road legs (cached) + geodesic ferry legs
npm run assemble    # S11 canonical JSON + WebP scans + search index + patches
npm run validate    # S12 schema + accuracy rules (exits non-zero on failure)
# S13 detect_media — LLM vision workflow: bounding boxes of glued photos /
#   postcards / sketches / maps per page (+ rotation) → data/work/media/
npm run media:crop  # S14 crop & rotate those regions → public/media/<trip>/*.webp
# S15 curate_quotes — LLM workflow: one evocative verbatim quote per stop
#   (+ a trip epigraph) → data/work/quotes/
npm run moments     # S16 join stops + quotes + crops → public/data/moments/<trip>.json
```

Deterministic stages are idempotent and resumable. `geocode`/`route` accept
`--offline`: with the committed caches in `data/cache/`, the full canonical
dataset rebuilds byte-identically with **zero network access**. `assemble`
accepts `--skip-images` to skip WebP regeneration.

The LLM stages were run with: `claude-sonnet-4-6` for page transcription
(chosen over haiku by a judged 10-spread calibration — see
`reports/calibration_report.md`), `claude-opus-4-8` for index transcription,
trip segmentation, route extraction and audits, and `claude-sonnet-4-6` for
media detection (S13) and quote curation (S15). Their prompts are versioned in
`pipeline/prompts/`; their outputs are committed under `data/work/`, so the
deterministic pipeline can rebuild everything without re-running them —
including the cropped images and play-mode moments, which `media:crop` and
`moments` rebuild from `data/work/media/` + `data/work/quotes/` with no network.

## Play mode (journey moments)

Selecting a trip and pressing **Play journey** animates a marker along the
route; the camera eases in and follows it, slowing briefly at each stop. As the
marker reaches a stop, a quiet "moment card" fades in (lower-left) with a
cropped diary photo/sketch/postcard from that page and an evocative verbatim
quotation, captioned `place · date`. Cards degrade gracefully — quote-only
where a page has no image, image-only where there's no quote — and trips with
neither simply show none. The card data is one self-contained file per trip,
`public/data/moments/<trip>.json`; positions along the route (`t`) are computed
in the app by projecting each stop onto the playback path.

## Evidence rules (what the data promises)

- Every canonical main-route stop carries `source_page_id`, a verbatim excerpt,
  a role (`home`, `overnight_base`, `main_stop`, `transit_stop`,
  `crossing_terminal`, `inferred_anchor`, `unresolved`) and a confidence score.
- Ferries and tunnels are explicit legs (dashed sea lines), never road-routed.
  Dover–Calais is used only when an England–France crossing is implied but
  unnamed, and is marked `inferred`.
- Vague regions ("Hadrian's Wall") map to representative anchors marked
  approximate (≈), never fake-precise points.
- Anything the diary doesn't support lands in `review_queue.json` instead of
  the map. Review mode (top right) shows it all and exports corrections as
  JSON patches; drop them in `patches/` and re-run `npm run assemble`.

## Corrections workflow

1. Toggle **Review** in the site, resolve items (notes are kept).
2. **Export patches** → save the file into `patches/`.
3. `npm run assemble && npm run validate` — corrections are applied
   deterministically on every rebuild.

## Outputs (data/out/)

`trips.json`, `places.json`, `route_evidence.json`, `routes.json`,
`route_geometry.json` (polyline6), `excursions.json`, `source_pages.json`,
`review_queue.json`, `extraction_summary.json` — schemas in
`pipeline/schemas/outputs.schema.json`.

## Known limitations

- Transcription is vision-LLM based; faint pencil pages carry low `legibility`
  scores and their uncertain readings are marked `[?…]`/`[illegible]` rather
  than guessed. Unresolved trips/stops are listed in the review queue — see
  `reports/route_review.md` for the audit.
- Geocoding/routing use today's place names and road network (OSRM); historic
  roads/ferry schedules are out of scope.
- The map needs network access for OpenFreeMap vector tiles (style is local;
  a CARTO raster fallback is documented in `src/map/style-fallback.md`).

## Privacy

The diaries contain family names and a home address. The pipeline only ever
sends bare place names to public geocoding/routing APIs; the home anchor is
Birmingham city, never the street address. The built site contains family
content — host it privately.
