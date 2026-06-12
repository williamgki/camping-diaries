# Spread transcription instructions

You are transcribing one scanned spread (two facing pages) of a handwritten
family camping diary (1989–2019, UK family, trips around Britain and Europe in
a camper van). Your output feeds an evidence-first route-extraction pipeline:
**accuracy and honesty about uncertainty matter more than completeness.**

## Absolute rules

1. **Transcribe verbatim.** Preserve original spelling, grammar, abbreviations
   and underlining (mark underlined words with `__double underscores__`).
   Do NOT modernize, correct, or paraphrase. E.g. if the diary says
   "Almost Contenious work" you write exactly that.
2. **Never invent text.** If a word is unreadable write `[illegible]`. If you
   can only partly read it, write your best reading wrapped as `[?word]`.
   A page full of `[?]` markers is a GOOD transcript if the ink is faint.
3. **Place names matter most.** Take extra care with anything that could be a
   place: town names, campsites, rivers, castles, ferry ports. If unsure
   between two readings, give your best in the text plus the alternative in
   `notes` (e.g. "could read 'Conques' or 'Cougnes'").
4. Faint pencil text is still text — transcribe it and lower `legibility`.

## What each page can contain

- Travel narrative with dates ("July 14th Friday", "May.", "1989" in margins)
- Underlined headings, often place names ("Weekend in the __Peak District__")
- Handwritten page numbers in the TOP OUTER CORNERS (left page: top-left;
  right page: top-right). Photo-only pages are often unnumbered.
- Glued-in photos and postcards, sometimes with captions
- Hand-drawn route sketches/maps (roads, arrows, place labels)
- Index pages (numbered list mapping page numbers → places) — flag these
- Marginalia, later annotations in different ink

## Output file

Write (with the Write tool) a JSON file to the EXACT path you were given, with
this structure:

```json
{
  "spread_id": "A_0042",
  "volume": "A",
  "pdf_page": 42,
  "pages": [
    {
      "page_id": "A_0042_L",
      "side": "L",
      "handwritten_page_no": 78,
      "blank": false,
      "full_text": "verbatim transcription with __underlines__, [illegible], [?guesses] …",
      "dates": [
        { "raw": "July 14th Friday", "iso_guess": "1989-07-14", "confidence": 0.85 }
      ],
      "headings": ["Weekend in the Peak District"],
      "underlined_places": ["Peak District", "Chatsworth"],
      "place_mentions": ["Alport", "Youlgreave", "Tissington Trail", "Haddon Hall", "Chatsworth"],
      "route_sketch": false,
      "route_sketch_description": null,
      "photo_captions": ["The Horse Rider, Bamburg Cathedral"],
      "is_index_page": false,
      "ink": "blue",
      "legibility": 0.85,
      "notes": null
    },
    { "page_id": "A_0042_R", "side": "R", "…": "same shape" }
  ]
}
```

Field notes:
- `handwritten_page_no`: integer or null. Only report a number you can see.
- `blank`: true for empty pages (still include the page object).
- `dates.iso_guess`: "YYYY-MM-DD", or "YYYY-MM", or "YYYY" — only as precise
  as the diary supports. Year often comes from context given to you, margin
  notes, or earlier pages; if you genuinely can't anchor a year, use null and
  say why in notes. `confidence` 0–1.
- `place_mentions`: every place name appearing in the text, in reading order,
  spelled as the diary spells it. Include campsites, rivers, castles, towns,
  ferry ports, regions.
- `route_sketch`: true if the page contains a hand-drawn map or route diagram.
  Describe it in `route_sketch_description` (places labelled, arrows, order).
- `ink`: dominant medium — "blue" | "black" | "pencil" | "mixed".
- `legibility`: 0–1 — how confidently you could read this page overall.
- `is_index_page`: true for numbered page→place index lists (front matter).
  Still fill `full_text` with the entries you can read.

The spread is given to you as two image files (left half, right half) with a
3% horizontal overlap at the gutter — text in the overlap belongs to whichever
page it sits on; don't transcribe it twice.

If an image shows a cover, endpaper, or pure photo page with no text, return
the page object with `blank` or empty `full_text` and appropriate flags —
do not pad.

## Return value (structured output)

After writing the file, return ONLY this small summary object (your final
structured output): spread_id, pages_written (int), handwritten_page_nos
(array, nulls allowed), has_route_sketch (bool), is_index (bool),
min_legibility (number), place_count (int), wrote_file (bool).
