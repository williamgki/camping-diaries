#!/usr/bin/env python3
"""S1 - Render every PDF page (a two-page spread) to a JPEG at 200 DPI.

Idempotent: skips spreads whose output file already exists and is non-empty.
PyMuPDF applies the stored /Rotate 90 automatically, so output is landscape.
"""
import json
import os
import sys

import fitz  # PyMuPDF

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DPI = 200
JPEG_QUALITY = 88

with open(os.path.join(ROOT, "pipeline/sources.json")) as f:
    sources = json.load(f)["sources"]

for src in sources:
    if src["status"] != "ok":
        print(f"skipping volume {src['volume']}: {src['status']}", file=sys.stderr)
        continue
    vol = src["volume"]
    outdir = os.path.join(ROOT, f"scans/vol{vol}/spreads")
    os.makedirs(outdir, exist_ok=True)
    doc = fitz.open(src["path"])
    rendered = skipped = 0
    for i, page in enumerate(doc):
        n = i + 1
        out = os.path.join(outdir, f"{vol}_{n:04d}.jpg")
        if os.path.exists(out) and os.path.getsize(out) > 0:
            skipped += 1
            continue
        pix = page.get_pixmap(matrix=fitz.Matrix(DPI / 72, DPI / 72), colorspace=fitz.csRGB)
        pix.save(out, jpg_quality=JPEG_QUALITY)
        rendered += 1
        if rendered % 25 == 0:
            print(f"vol {vol}: {rendered + skipped}/{doc.page_count}", flush=True)
    print(f"vol {vol}: done — rendered {rendered}, skipped {skipped}, total {doc.page_count}", flush=True)
    doc.close()
