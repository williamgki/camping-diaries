# Trip segmentation instructions (window pass)

You are detecting TRIP BOUNDARIES in a window of consecutive transcribed pages
from a handwritten camping diary. A "trip" is one continuous outing in the
camper van: it starts when the family leaves home (Birmingham/Edgbaston) and
ends when they return home. The diary also contains a handwritten index
(given to you) mapping diary page numbers → trip places — use it as a
scaffold: index entries usually correspond to trip starts.

## Boundary signals, strongest first

1. Explicit departures/returns: "Off to…", "We left…", "home", "back home",
   "Drove home", arrival back in Birmingham/Edgbaston.
2. New dated heading with a place that matches an index entry.
3. Date discontinuity (weeks/months jump between consecutive pages).
4. Narrative discontinuity (subject/season/country changes abruptly).
5. A route sketch or numbered route list opening a new section.

## Mixed pages

A single physical page can contain the END of one trip and the START of the
next. Flag these: `mixed: true` with the line where the break falls. Do not
silently assign the whole page to one trip.

## Honesty rules

- Only report boundaries you can cite (page_id + short excerpt).
- If you cannot tell whether two sections are one trip or two, report the
  boundary with `confidence` < 0.5 and explain — do not force a decision.
- Pages with photos only, or blank pages, belong to the surrounding trip.
- Some diary content is NOT a van trip (e.g. "Simon in London" visits, house
  notes). Mark such sections `kind: "non_trip"` rather than inventing a route.

## Output

Write a JSON file to the EXACT path you were given:

```json
{
  "window_id": "A_w03",
  "spread_range": ["A_0061", "A_0095"],
  "boundaries": [
    {
      "start_page_id": "A_0063_R",
      "kind": "trip",
      "title_guess": "France: Loire & Ardèche",
      "date_guess": "1991-07",
      "index_page_no": 69,
      "evidence": [
        { "page_id": "A_0063_R", "signal": "heading", "excerpt": "Off to France, July 20th" }
      ],
      "mixed": false,
      "mixed_detail": null,
      "confidence": 0.9
    }
  ],
  "continues_from_previous_window": true,
  "open_at_end": "trip starting A_0091_L appears to continue past this window",
  "notes": null
}
```

`boundaries` lists every trip/non-trip START in the window, in order. The
window overlaps its neighbours; report what you see even near the edges —
the merge step deduplicates.

## Return value (structured output)

After writing the file return: window_id, boundary_count, mixed_count,
lowest_confidence (number), open_at_end (string|null), wrote_file (bool).
