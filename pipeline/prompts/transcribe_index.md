# Index transcription instructions

You are transcribing the handwritten INDEX pages at the front of a camping
diary volume. The index maps handwritten diary page numbers to trip place
names, in columns, with year marginalia beside groups of entries
(e.g. "1989", "— 1990", "1991" written next to the list).

These indexes are the structural scaffold for trip segmentation, so:

- Transcribe EVERY entry you can read, in order, column by column,
  left page then right page (and any continuation/PTO page).
- Preserve original spelling exactly.
- An entry is: page number(s) + place text. Some entries have multiple lines
  of places under one number (a multi-stop trip); keep them together.
- Numbers may be corrected/overwritten in the original (e.g. "132" struck
  through, "133" written) — record what you see in `note`.
- Year markers: attach the year to every entry it governs (years apply to all
  following entries until the next year marker).
- Gaps in numbering are normal (multi-page trips) — do not invent entries.

## Output file

Write a JSON file to the EXACT path you were given:

```json
{
  "volume": "A",
  "source_spreads": ["A_0002"],
  "entries": [
    { "page_no": 1, "text": "Malvern + farm", "year": 1989, "note": null },
    { "page_no": 2, "text": "Harlech", "year": 1989, "note": null },
    { "page_no": 105, "text": "Simon in London", "year": 1992, "note": "1992 marker beside this entry" }
  ],
  "uncertain_entries": [
    { "approx_page_no": 132, "text": "[?Salbris]", "year": 1991, "note": "number overwritten, could be 132 or 133" }
  ]
}
```

## Return value (structured output)

After writing the file return: volume, entry_count, uncertain_count,
first_entry (string), last_entry (string), years_seen (array of ints),
wrote_file (bool).
