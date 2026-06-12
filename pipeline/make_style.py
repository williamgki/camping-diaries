#!/usr/bin/env python3
"""Derive the quiet-atlas map style from OpenFreeMap's positron style.

Run with the upstream style at /tmp/positron_style.json (curl
https://tiles.openfreemap.org/styles/positron). Output is checked into the
repo at src/map/style.json so the app never depends on the upstream style
changing; only tiles/glyphs/sprites are fetched from OpenFreeMap at runtime.
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

PAPER_LAND = "#F2EFE7"
WATER = "#D8E2E1"
GREEN = "#E7EAE0"
ROAD = "#E8E4DA"
ROAD_CASING = "#DFDACB"
LABEL = "#8A857A"
LABEL_HALO = "rgba(246,243,236,0.85)"
BOUNDARY = "#C9C2B2"

with open("/tmp/positron_style.json") as f:
    style = json.load(f)

style["name"] = "camping-diaries-quiet-atlas"

for layer in style["layers"]:
    lid = layer["id"]
    paint = layer.setdefault("paint", {})
    if lid == "background":
        paint["background-color"] = PAPER_LAND
    elif lid in ("water",):
        paint["fill-color"] = WATER
    elif lid in ("park", "landcover_wood"):
        paint["fill-color"] = GREEN
        if lid == "landcover_wood":
            paint["fill-opacity"] = 0.5
    elif lid == "landuse_residential":
        paint["fill-color"] = "#EDEADF"
        paint["fill-opacity"] = 0.4
    elif lid == "building":
        paint["fill-color"] = "#E9E5D8"
        paint.pop("fill-outline-color", None)
    elif lid == "waterway":
        paint["line-color"] = WATER
    elif "casing" in lid and layer["type"] == "line":
        paint["line-color"] = ROAD_CASING
    elif lid.startswith(("highway_", "tunnel_", "aeroway", "road_")) and layer["type"] == "line":
        paint["line-color"] = ROAD
    elif lid.startswith("railway"):
        paint["line-color"] = "#E0DBCD"
    elif lid.startswith("boundary"):
        paint["line-color"] = BOUNDARY
    elif layer["type"] == "symbol":
        paint["text-color"] = LABEL
        paint["text-halo-color"] = LABEL_HALO
        paint["text-halo-width"] = 1.1

with open(os.path.join(ROOT, "src/map/style.json"), "w") as f:
    json.dump(style, f, indent=1)
print("wrote src/map/style.json with", len(style["layers"]), "layers")
