#!/usr/bin/env python3
"""Tile density: how many aircraft/positions a day's adsb.lol archive has per
zoom-4 (z/x/y) tile, worldwide -- an input to narrowing CLAUDE.md 3節's long list.

Walks traces/ under an extracted globe_history day (traces/<subdir>/trace_full_<icao>.json[.gz],
per wiedehopf/readsb's globe_history "trace jsons" format: trace points are arrays
[seconds_since_file_timestamp, lat, lon, alt, gs, track, flags, vrate, ...]).

Reading+decompressing ~83k trace files dominates the cost; bucketing each point into
its z4 tile (standard XYZ/Web Mercator, verified against CLAUDE.md's six known tile
bounds) is essentially free in the same pass. So this reports on *all* tiles that saw
traffic, not just a preselected six -- dropping a candidate tile doesn't save any real
computation, and the global picture is more useful for narrowing than a fixed list.

    python3 scripts/tile-density.py data/extracted/2026.09.18
    python3 scripts/tile-density.py data/extracted/2026.09.18 --sample 200
    python3 scripts/tile-density.py data/extracted/2026.09.18 --top 40
"""
import argparse
import gzip
import json
import math
import sys
from collections import defaultdict
from pathlib import Path

ZOOM = 4
N = 2 ** ZOOM
GRID_N = 16  # sub-tile grid per side, for the within-tile empty-cell gap proxy

# long-list tiles from README.md / CLAUDE.md 3節, for labeling only -- (x, y) at z=4
LONGLIST = {
    (14, 5): "Hokkaido, Sakhalin, Kurils",
    (14, 6): "eastern Honshu, Tokyo area",
    (13, 6): "Korea, eastern China, Taiwan, Kyushu",
    (9, 4): "southern Finland, Baltic states",
    (9, 6): "Greece, Turkey, Cyprus, Levant, Egypt",
    (7, 7): "West African coast incl. Sierra Leone",
}

# regions of interest, tracked regardless of density-ranking position (DECISIONS.md D4:
# thinness itself can be the point -- density is a precondition to interpret results by,
# not a filter for whether to look) -- (x, y) at z=4, from a representative interior point
WATCHLIST = {
    (14, 8): "Papua New Guinea",
    (8, 7): "Togo",
    (12, 7): "Laos",
}


def read_json(path: Path):
    raw = path.read_bytes()
    if raw[:2] == b"\x1f\x8b":  # gzip magic, regardless of extension
        raw = gzip.decompress(raw)
    return json.loads(raw)


def iter_trace_files(traces_dir: Path):
    yield from traces_dir.rglob("trace_full_*.json*")


def tile_and_frac(lat, lon):
    """z4 tile (x, y) for (lat, lon), plus fractional position within that tile
    (0..1 each axis), via the standard XYZ/Web Mercator slippy-map formula.
    Matches CLAUDE.md's six known tile bounds exactly (checked by hand for 4/14/6)."""
    lat = max(-85.0511, min(85.0511, lat))  # avoid the mercator pole singularity
    fx = (lon + 180.0) / 360.0 * N
    lat_rad = math.radians(lat)
    fy = (1.0 - math.log(math.tan(lat_rad) + 1.0 / math.cos(lat_rad)) / math.pi) / 2.0 * N
    x, y = int(fx), int(fy)
    x = max(0, min(N - 1, x))
    y = max(0, min(N - 1, y))
    return x, y, fx - x, fy - y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("extracted_dir", type=Path, help="e.g. data/extracted/2026.09.18")
    ap.add_argument("--sample", type=int, default=None,
                     help="only read the first N trace files (quick sanity check)")
    ap.add_argument("--top", type=int, default=25, help="how many top tiles to print")
    ap.add_argument("--json-out", type=Path, default=None,
                     help="write full per-tile stats (all non-empty z4 tiles) as JSON, "
                          "for the Open MCT/MapLibre viz")
    args = ap.parse_args()

    traces_dir = args.extracted_dir / "traces"
    if not traces_dir.is_dir():
        sys.exit(f"no traces/ under {args.extracted_dir}")

    aircraft = defaultdict(set)   # (x,y) -> set of icao
    points = defaultdict(int)     # (x,y) -> point count
    cells = defaultdict(set)      # (x,y) -> set of occupied (gx, gy) sub-cells
    files_seen = 0
    files_bad = 0

    for i, path in enumerate(iter_trace_files(traces_dir)):
        if args.sample and i >= args.sample:
            break
        files_seen += 1
        try:
            doc = read_json(path)
        except Exception as e:
            files_bad += 1
            if files_bad <= 5:
                print(f"  ! skip {path.name}: {e}", file=sys.stderr)
            continue
        icao = doc.get("icao", path.stem)
        for p in doc.get("trace", []):
            lat, lon = p[1], p[2]
            if lat is None or lon is None:
                continue
            x, y, frx, fry = tile_and_frac(lat, lon)
            key = (x, y)
            aircraft[key].add(icao)
            points[key] += 1
            gx, gy = min(int(frx * GRID_N), GRID_N - 1), min(int(fry * GRID_N), GRID_N - 1)
            cells[key].add((gx, gy))

    print(f"trace files read: {files_seen} (unreadable: {files_bad})")
    total_cells = GRID_N * GRID_N

    ranked = sorted(aircraft, key=lambda k: -len(aircraft[k]))
    print()
    print(f"## top {args.top} tiles worldwide by aircraft count")
    print()
    print("| tile | aircraft | points | empty% | note |")
    print("|---|---|---|---|---|")
    for key in ranked[:args.top]:
        x, y = key
        occ = len(cells[key])
        empty_pct = (1 - occ / total_cells) * 100
        note = LONGLIST.get(key, "")
        print(f"| 4/{x}/{y} | {len(aircraft[key])} | {points[key]} | {empty_pct:.0f}% | {note} |")

    def print_table(title, tiles):
        print()
        print(f"## {title}")
        print()
        print("| tile | aircraft | points | empty% | note |")
        print("|---|---|---|---|---|")
        for key, note in tiles.items():
            x, y = key
            occ = len(cells[key])
            empty_pct = (1 - occ / total_cells) * 100
            print(f"| 4/{x}/{y} | {len(aircraft[key])} | {points[key]} | {empty_pct:.0f}% | {note} |")

    print_table("long-list tiles (CLAUDE.md 3節), for reference", LONGLIST)
    print_table("watchlist (regions of interest, tracked regardless of rank -- DECISIONS.md D4)",
                 WATCHLIST)

    if args.json_out:
        tiles_out = {}
        for key in aircraft:
            x, y = key
            occ = len(cells[key])
            tiles_out[f"{x},{y}"] = {
                "x": x, "y": y,
                "aircraft": len(aircraft[key]),
                "points": points[key],
                "empty_pct": round((1 - occ / total_cells) * 100, 1),
                "longlist": LONGLIST.get(key),
                "watchlist": WATCHLIST.get(key),
            }
        doc = {
            "date": args.extracted_dir.name,
            "zoom": ZOOM,
            "grid_n": GRID_N,
            "files_read": files_seen,
            "tiles": tiles_out,
        }
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(doc, ensure_ascii=False, indent=1))
        print(f"\nwrote {len(tiles_out)} tiles to {args.json_out}", file=sys.stderr)


if __name__ == "__main__":
    main()
