#!/usr/bin/env python3
"""S2 - Split rendered spreads into left/right page images + LLM-sized derivatives.

Gutter detection: darkest smoothed vertical valley in the central 44-56% band of
column-mean luminance. Because glued-in photos produce false valleys, detection
is two-pass: pass 1 collects confident valleys per volume; the per-volume median
becomes the consensus gutter. Pass 2 uses a spread's own valley only when it is
confident AND within 6% of the consensus; otherwise the consensus position is
used (method "volume_median"). All decisions land in split_manifest.json.

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
OVERLAP_FRAC = 0.04
LLM_MAX_PIXELS = 1_150_000
CONFIDENCE_THRESHOLD = 1.6
BAND = (0.44, 0.56)
CONSENSUS_TOLERANCE = 0.06


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
    band = range(int(480 * BAND[0]), int(480 * BAND[1]))
    valley_x = min(band, key=lambda i: smooth[i])
    valley_v = smooth[valley_x]
    band_vals = [smooth[i] for i in band]
    band_median = sorted(band_vals)[len(band_vals) // 2]
    overall_std = math.sqrt(sum((v - sum(smooth) / 480) ** 2 for v in smooth) / 480)
    confidence = (band_median - valley_v) / (overall_std + 1e-6)
    return valley_x / 480, round(confidence, 2)


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

        # Pass 1: measure valleys on every spread; consensus = median of confident ones.
        measures = {}
        for name in names:
            im = Image.open(os.path.join(sdir, name))
            measures[name] = (find_gutter(im), im.size)
        confident = sorted(
            frac for (frac, conf), _ in measures.values() if conf >= CONFIDENCE_THRESHOLD
        )
        consensus = confident[len(confident) // 2] if confident else 0.5
        print(f"vol {vol}: consensus gutter at {consensus:.4f} from {len(confident)} confident valleys", flush=True)

        # Pass 2: split, trusting a spread's own valley only when it agrees with consensus.
        for idx, name in enumerate(names):
            spread_id = name[:-4]
            (frac, conf), (w, h) = measures[name]
            if conf >= CONFIDENCE_THRESHOLD and abs(frac - consensus) <= CONSENSUS_TOLERANCE:
                method = "valley"
            else:
                frac, method = consensus, "volume_median"
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
            outs = [
                os.path.join(pdir, f"{spread_id}_L.jpg"),
                os.path.join(pdir, f"{spread_id}_R.jpg"),
                os.path.join(ldir, f"{spread_id}_L.jpg"),
                os.path.join(ldir, f"{spread_id}_R.jpg"),
            ]
            if all(os.path.exists(o) and os.path.getsize(o) > 0 for o in outs):
                continue
            im = Image.open(os.path.join(sdir, name))
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
    fallbacks = [m for m in manifest if m["method"] == "volume_median"]
    print(f"manifest: {len(manifest)} spreads, {len(fallbacks)} volume-median splits ({100 * len(fallbacks) / max(1, len(manifest)):.1f}%)")


if __name__ == "__main__":
    main()
