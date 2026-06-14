# Diary media detection instructions

You are locating the **glued-in visual items** on one scanned page of a
handwritten family camping diary, so they can be cropped out and shown beside
the journey on a map. The page is a single half of a diary spread (left or
right). It contains handwriting and, often, glued-in **photographs, postcards,
hand-drawn route sketches/maps, or tickets/ephemera**.

## What to return

Find every distinct glued-in or drawn VISUAL item — NOT the handwriting. For
each, give a tight bounding box in **normalized coordinates** (fractions of the
image width/height, origin top-left): `x` = left edge, `y` = top edge,
`w` = width, `h` = height, all in 0–1.

Types:
- `photo` — a glued photographic print
- `postcard` — a glued postcard (often captioned, e.g. a château or town)
- `sketch` — a hand-drawn picture/illustration
- `map` — a hand-drawn route map / numbered route diagram
- `ticket` — a glued ticket, business card, leaflet, stamp or similar ephemera

## Rules

1. **Exclude handwriting.** A region that is only diary text is NOT an item.
   A photo with a handwritten caption beside it → box the PHOTO only, put the
   caption text in `caption`.
2. One box per distinct item. If two photos are glued side by side, return two.
3. Box tightly around the item's visible edges (include a white photo border if
   present, exclude surrounding diary paper).
4. `caption`: any caption written for this item (verbatim), else a 3–6 word
   description of what it shows. Empty string if truly indescribable.
5. `keep`: true unless the item is tiny/decorative (e.g. a doodle < ~4% of the
   page area) or too degraded to be worth showing.
5b. `rotate_cw`: the diary spread was scanned rotated, so glued photos/postcards
   often appear sideways or upside-down. Give the degrees to rotate this item
   **clockwise** to make it upright and naturally viewable — one of 0, 90, 180,
   270. Judge from the scene and any printed caption text (e.g. a postcard whose
   title reads bottom-to-top up the right side needs `rotate_cw: 90`). Use 0 for
   hand-drawn maps/sketches that are already upright on the page.
6. `spans_gutter`: true if the item is clipped by the page's INNER edge (the
   binding side — for a left page that's the right edge; for a right page the
   left edge), i.e. it likely continues onto the facing page.
7. If the page has no glued/drawn visual items (handwriting only, or blank),
   return an empty `regions` array. That is a correct, common answer — do not
   invent items.

## Output (structured)

Return ONLY this object:
```json
{
  "page_id": "A_0135_L",
  "regions": [
    { "type": "postcard", "bbox": [0.06, 0.18, 0.62, 0.55], "caption": "CHENONCEAU", "keep": true, "spans_gutter": false, "rotate_cw": 90 }
  ]
}
```
`bbox` is `[x, y, w, h]` normalized 0–1. Return `regions: []` for pages with
nothing to crop.
