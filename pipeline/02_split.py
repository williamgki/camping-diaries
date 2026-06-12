#!/usr/bin/env python3
"""S2 - Split rendered spreads into left/right page images + LLM-sized derivatives.

Gutter detection: darkest smoothed vertical valley in the central 35-65% band of
column-mean luminance. Low-confidence valleys fall back to the exact middle and
are flagged in split_manifest.json for spot-checking.

Outputs per spread (e.g. A_0001):
  scans/volA/pages/A_0001_L.jpg  - full-res left page (3% overlap into gutter)
  scans/volA/pages/A_0001_R.jpg  - full-res right page
  scans/volA/llm/A_0001_L.jpg    - <=1.15 MP derivative for vision-LLM agents
  scans/volA/llm/A_0001_R.jpg
  data/work/split_manifest.json  - one record per spread: split x, confidence, method

Idempotent: skips spreads whose four outputs already exist (manifest is always
rebuilt from scratch on a full run over existing files, so it stays consistent).
"""
import json
import math
import os

from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OVERLAP_FRAC = 0.03
LLM_MAX_PIXELS = 1_150_000
CONFIDENCE_THRESHOLD = 1.6


def find_gutter(im: Image.Image):
    """Return (split_frac, confidence, method) for a landscape spread."""
    g = im.convert("L")
    # Downsample for speed; ignore top/bottom 12% (binding shadows, page edges).
    w, h = g.size
    g = g.resize((480, 160))
    px = list(g.getdata())
    cols = [0.0] * 480
    rows_used = range(20, 140)
    for x in range(480):
        s = 0
        for y in rows_used:
            s += px[y * 480 + x]
        cols[x] = s / len(rows_used)
    # Smooth with a small box filter.
    k = 5
    smooth = [sum(cols[max(0, i - k) : i + k + 1]) / len(cols[max(0, i - k) : i + k + 1]) for i in range(480)]
    band = range(int(480 * 0.35), int(480 * 0.65))
    valley_x = min(band, key=lambda i: smooth[i])
    valley_v = smooth[valley_x]
    band_vals = [smooth[i] for i in band]
    band_median = sorted(band_vals)[len(band_vals) // 2]
    overall_std = math.sqrt(sum((v - sum(smooth) / 480) ** 2 for v in smooth) / 480)
    confidence = (band_median - valley_v) / (overall_std + 1e-6)
    if confidence >= CONFIDENCE_THRESHOLD:
        return valley_x / 480, round(confidence, 2), "valley"
    return 0.5, round(confidence, 2), "fallback_middle"


def save_llm(im: Image.Image, path: str):
    w, h = im.size
    if w * h > LLM_MAX_PIXELS:
        scale = math.sqrt(LLM_MAX_PIXELS / (w * h))
        im = im.resize((int(w * scale), int(h * scale)), Image.LANCZOS)
    im.save(path, "JPEG", quality=85)


def main():
    manifest = []
    for vol in ("A", "B"):
        sdir = os.path.join(ROOT, f"scans/vol{vol}/spreads")
        pdir = os.path.join(ROOT, f"scans/vol{vol}/pages")
        ldir = os.path.join(ROOT, f"scans/vol{vol}/llm")
        os.makedirs(pdir, exist_ok=True)
        os.makedirs(ldir, exist_ok=True)
        if not os.path.isdir(sdir):
            continue
        names = sorted(n for n in os.listdir(sdir) if n.endswith(".jpg"))
        for idx, name in enumerate(names):
            spread_id = name[:-4]
            outs = [
                os.path.join(pdir, f"{spread_id}_L.jpg"),
                os.path.join(pdir, f"{spread_id}_R.jpg"),
                os.path.join(ldir, f"{spread_id}_L.jpg"),
                os.path.join(ldir, f"{spread_id}_R.jpg"),
            ]
            im = Image.open(os.path.join(sdir, name))
            w, h = im.size
            frac, conf, method = find_gutter(im)
            manifest.append(
                {
                    "spread_id": spread_id,
                    "volume": vol,
                    "pdf_page": int(spread_id.split("_")[1]),
                    "width": w,
                    "height": h,
                    "split_frac": round(frac, 4),
                    "confidence": conf,
                    "method": method,
                }
            )
            if all(os.path.exists(o) and os.path.getsize(o) > 0 for o in outs):
                continue
            x = int(w * frac)
            ov = int(w * OVERLAP_FRAC)
            left = im.crop((0, 0, min(x + ov, w), h))
            right = im.crop((max(x - ov, 0), 0, w, h))
            left.save(outs[0], "JPEG", quality=88)
            right.save(outs[1], "JPEG", quality=88)
            save_llm(left, outs[2])
            save_llm(right, outs[3])
            if (idx + 1) % 50 == 0:
                print(f"vol {vol}: {idx + 1}/{len(names)}", flush=True)
        print(f"vol {vol}: split {len(names)} spreads", flush=True)

    os.makedirs(os.path.join(ROOT, "data/work"), exist_ok=True)
    with open(os.path.join(ROOT, "data/work/split_manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1)
    fallbacks = [m for m in manifest if m["method"] == "fallback_middle"]
    print(f"manifest: {len(manifest)} spreads, {len(fallbacks)} middle-fallbacks ({100 * len(fallbacks) / max(1, len(manifest)):.1f}%)")


if __name__ == "__main__":
    main()
