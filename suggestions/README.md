# Suggestions — the family corrections database

Family members propose corrections in natural language via the **Suggest a
change** button on the site, which opens a Google Form. This folder is where
those suggestions live once pulled in, so we can work through them deliberately
(changes are **never applied live** — always reviewed first).

## Flow

1. Someone submits the Google Form → a row lands in the responses Sheet.
2. Export the Sheet as CSV, then ingest it:
   ```sh
   node pipeline/ingest_suggestions.mjs ~/Downloads/responses.csv
   ```
   This writes one Markdown file per new submission to `incoming/`, skipping
   rows already imported (deduped by a content hash). No network, no secrets.
3. Work through `incoming/*.md`. For each, set `status:` in the frontmatter:
   - `applied` — change made (note what changed).
   - `rejected` — with a reason.
   - `duplicate` / `wontfix` as needed.
4. **Glossary-type** suggestions (a name spelling, or "X = the place Y") get
   promoted into `pipeline/glossary.json`:
   - a place correction → a `places` entry keyed by the stop's normalized-name
     slug, with coordinates;
   - a name/spelling → a `names` substitution.
   Then re-run `npm run geocode && npm run route && npm run assemble &&
   npm run moments && npm run validate && npm run build && npm run deploy`.

## File shape (`incoming/<date>-<n>.md`)

```markdown
---
id: 2026-06-17-3
date: 2026-06-17
submitter: Simon
trip: 1989 Dinas / Harlech
type: place            # correction | glossary | place | photo | bug | other
status: new            # new | applied | rejected | duplicate | wontfix
source: google-form
hash: a1b2c3d4
---

Dinas (first trip) is the wrong one — it should be the campsite inland from
Llanbedr, not the common Dinas hamlet.
```

Glossary changes already applied this round (seed entries in
`pipeline/glossary.json`): home → 86 Westfield Road; "Kate & Jamie's farm" →
Brook House Farm, Avenbury; first-trip "Dinas" → Dinas Farm, Llanbedr; "Kay" →
"Kaz" (John's partner).
