# Per-trip route & evidence extraction

You are reconstructing ONE camping trip's route from transcribed diary pages
(and page images where given). Your output becomes the canonical route shown
on a family map — **every stop must be cited, and uncertainty must be
explicit. Never invent route details.**

## Evidence hierarchy (use in this order)

1. Hand-drawn route sketches, numbered route lists, map pages
2. Dated travel narrative ("We drove on to Bamberg…")
3. Overnight bases, campsites, departures, arrivals, return-home notes
4. Explicit ferry/tunnel/bridge/port/border mentions
5. Photo captions and nearby contextual clues
6. The volume index entry for this trip

## Stop roles

- `home` — Birmingham (the family home). Unless the diary shows otherwise,
  every trip starts and ends at home. Use "Birmingham, UK" (city anchor) —
  never the street address.
- `departure` — explicit non-home start (rare)
- `overnight_base` — slept there (campsite, friend's house, fixed base)
- `main_stop` — visited on the way as part of the journey's progression
- `transit_stop` — passed through / brief stop explicitly on a driving leg
- `crossing_terminal` — ferry port / tunnel terminal actually used
- `inferred_anchor` — a representative point for a vague region ("Hadrian's
  Wall", "the Burren") — mark `approximate: true`
- `unresolved` — named in the diary but you cannot tell where it is or where
  it fits; keep it, flag it

## Main route vs excursions

The MAIN ROUTE is the ordered chain of overnight progression:
home → (crossing) → base₁ → base₂ → … → home.
Day trips that leave a base and return to the SAME base the same day are
EXCURSIONS — group them separately under that base. A fixed-base holiday may
have a 3-stop main route and ten excursions. Do not flatten excursions into
the main route.

## Crossings (ferries/tunnels)

- If the diary names a port, ferry or tunnel — use it (`inferred: false`).
- England–France implied with no port named → dover-calais, `inferred: true`,
  reason "default England–France crossing".
- Ireland: explicit Irish Sea crossing; prefer Holyhead↔Dún Laoghaire/Dublin
  when supported or strongly implied; otherwise mark unresolved for review.
- Norway: if the diary indicates the Newcastle/North Shields ferry, the
  crossing is north_shields→bergen/stavanger/kristiansand as evidenced.
  NEVER route a Norway trip through the Low Countries in that case.
- Port keys come from pipeline/ferries.json (Read it). If the diary names a
  port not in that file, still record it (key: null, name verbatim) and note it.

## Confidence rubric (per stop)

- 0.9–1.0: explicitly narrated with date/overnight ("We've stopped at
  Neumannshof") or on a route sketch
- 0.7–0.85: clearly visited in narrative order, but brief or undated
- 0.5–0.65: probable from context (photo caption, index entry only)
- < 0.5: speculative → role `unresolved` instead, with your best notes

## Output file

Write a JSON file to the EXACT path you were given:

```json
{
  "trip_id": "1991-france-loire-ardeche",
  "title": "France: Loire, Ardèche & Lot",
  "volume": "A",
  "spread_range": ["A_0063", "A_0101"],
  "diary_page_range": [69, 101],
  "date_start": "1991-07-20",
  "date_end": "1991-08-26",
  "date_precision": "day|month|year",
  "travellers": ["Simon", "Eve", "Thomas", "William", "Peter", "John", "Charles"],
  "countries": ["GB", "FR"],
  "main_route": [
    {
      "seq": 1,
      "normalized_name": "Birmingham, UK",
      "original_wording": null,
      "role": "home",
      "confidence": 1.0,
      "approximate": false,
      "source_page_id": null,
      "excerpt": null,
      "geocode_hint": { "countrycodes": "gb" }
    },
    {
      "seq": 2,
      "normalized_name": "Dover",
      "original_wording": "Dover",
      "role": "crossing_terminal",
      "confidence": 0.6,
      "approximate": false,
      "inferred": true,
      "inference_reason": "default England-France crossing; no port named",
      "source_page_id": "A_0064_L",
      "excerpt": "crossed over to France in the morning",
      "geocode_hint": { "countrycodes": "gb" }
    }
  ],
  "crossings": [
    {
      "after_seq": 2,
      "route_key": "dover-calais",
      "kind": "ferry",
      "named_in_diary": false,
      "inferred": true,
      "source_page_id": "A_0064_L",
      "excerpt": "crossed over to France in the morning"
    }
  ],
  "excursions": [
    {
      "base_seq": 5,
      "label": "Day trip to Chenonceaux",
      "date_guess": "1991-08-02",
      "stops": [
        {
          "normalized_name": "Château de Chenonceau",
          "original_wording": "Chenonceaux",
          "confidence": 0.85,
          "source_page_id": "A_0084_R",
          "excerpt": "We visited Chenonceaux in the afternoon",
          "geocode_hint": { "countrycodes": "fr" }
        }
      ]
    }
  ],
  "unresolved": [
    {
      "original_wording": "[?Cassaniouze]",
      "issue": "place name uncertain; could be Cassaniouze (Cantal)",
      "source_page_id": "A_0090_L",
      "excerpt": "drove via [?Cassaniouze]"
    }
  ],
  "boundary_flags": [],
  "summary": "2-3 sentence factual summary of the trip for the trip list",
  "extraction_notes": "anything the reviewer should know"
}
```

Rules:
- `normalized_name`: a geocodable modern name ("Triers" → "Trier, Germany";
  keep the diary's spelling in `original_wording`).
- Every main_route/excursion stop (except `home`) needs `source_page_id` +
  `excerpt` (short verbatim quote).
- Keep stop count honest: a place merely *mentioned* ("we read about X") is
  NOT a stop.
- `geocode_hint.countrycodes`: lowercase ISO codes to bias geocoding.
- If the trip's pages include a route sketch, follow its order over narrative
  order and cite the sketch page.
- trip_id: `<year>-<short-slug>`.

## Return value (structured output)

After writing the file return: trip_id, title, stop_count, excursion_count,
crossing_count, unresolved_count, countries (array), date_start, date_end,
min_stop_confidence (number), wrote_file (bool).
