# Quote curation instructions

You are choosing the most evocative **verbatim** lines from one camping-trip's
diary pages, to caption a gentle map animation of the journey. The goal is
warmth and a sense of place — the small human details a family would love to
re-read — NOT a summary and NOT terse facts.

You are given the trip bundle (its pages, each with `page_id`, `text`, dates,
places). You will also be told the trip's ordered main-route stops (seq +
place + source_page_id).

## What to produce

1. **`epigraph`** — one short, lovely verbatim line that captures the whole
   trip's spirit (≤140 chars). Pick the single most charming/atmospheric
   sentence fragment anywhere in the trip. Record its `source_page_id`.

2. **`per_stop`** — for each main-route stop you can support, the single most
   evocative verbatim line tied to THAT stop (prefer text on the stop's own
   `source_page_id`, else a clearly-related nearby page). ≤160 chars each.

## Rules

- **Strictly verbatim.** Copy the diary's exact words and spelling (quirks like
  "Almost Contenious" or "beautifal" stay). You may trim to a clean fragment and
  drop a trailing clause, but never paraphrase or add words. Do not include
  `[illegible]`/`[?…]` markers — choose a clean readable line instead.
- Prefer sensory, human, or surprising lines ("Charles swam upstream & back",
  "the wasps drove us indoors", "hot showers, comfortable bed") over logistics
  ("we left at 9.15").
- Skip a stop if it has no quotable line — better to omit than to force one.
- One quote per stop maximum. Keep them short.

## Output

Write a JSON file to the EXACT path you are given:
```json
{
  "trip_id": "...",
  "epigraph": { "quote": "Glorious sunshine & a fabulous holiday — even time to read & write letters.", "source_page_id": "A_0004_R" },
  "per_stop": [
    { "seq": 3, "source_page_id": "A_0181_R", "quote": "The Rock of Cashel rose out of the plain, grey and astonishing." }
  ]
}
```

## Return value (structured output)

After writing the file, return: trip_id, epigraph_len (int), stop_quote_count
(int), wrote_file (bool).
