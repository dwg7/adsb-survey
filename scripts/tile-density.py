#!/usr/bin/env python3
"""Tile density: how many aircraft/positions a day's adsb.lol archive has per
long-list tile (CLAUDE.md 3節), as one input to narrowing the six candidates.

Walks traces/ under an extracted globe_history day (traces/<subdir>/trace_full_<icao>.json[.gz],
per wiedehopf/readsb's globe_history "trace jsons" format: trace points are arrays
[seconds_since_file_timestamp, lat, lon, alt, gs, track, flags, vrate, ...]).
Counts, per tile: aircraft with >=1 position inside, total position points inside,
and a coarse-grid empty-cell fraction as a rough proxy for coverage gaps.

Not yet verified against real adsb.lol files (written while the first day's archive
was still downloading) -- run --sample first and sanity-check before trusting the
full-day numbers. Record any format surprises in DECISIONS.md, not here.

    python3 scripts/tile-density.py data/extracted/2026.09.18
    python3 scripts/tile-density.py data/extracted/2026.09.18 --sample 200
"""
import argparse
import gzip
import json
import sys
from collections import defaultdict
from pathlib import Path

# tile -> (lon_min, lon_max, lat_min, lat_max), from README.md / CLAUDE.md 3節
TILES = {
    "4/14/5": (135.0, 157.5, 41.0, 55.8),   # Hokkaido, Sakhalin, Kurils
    "4/14/6": (135.0, 157.5, 21.9, 41.0),   # eastern Honshu, Tokyo area
    "4/13/6": (112.5, 135.0, 21.9, 41.0),   # Korea, eastern China, Taiwan, Kyushu
    "4/9/4": (22.5, 45.0, 55.8, 66.5),      # southern Finland, Baltic states
    "4/9/6": (22.5, 45.0, 21.9, 41.0),      # Greece, Turkey, Cyprus, Levant, Egypt
    "4/7/7": (-22.5, 0.0, 0.0, 21.9),       # West African coast incl. Sierra Leone
}
GRID_N = 16  # coarse grid per tile side, for the empty-cell gap proxy


def read_json(path: Path):
    raw = path.read_bytes()
    if raw[:2] == b"\x1f\x8b":  # gzip magic, regardless of extension
        raw = gzip.decompress(raw)
    return json.loads(raw)


def iter_trace_files(traces_dir: Path):
    yield from traces_dir.rglob("trace_full_*.json*")


def tile_for_point(lat, lon):
    hits = []
    for tile, (lon_min, lon_max, lat_min, lat_max) in TILES.items():
        if lon_min <= lon < lon_max and lat_min <= lat < lat_max:
            hits.append(tile)
    return hits


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("extracted_dir", type=Path, help="e.g. data/extracted/2026.09.18")
    ap.add_argument("--sample", type=int, default=None,
                     help="only read the first N trace files (quick sanity check)")
    args = ap.parse_args()

    traces_dir = args.extracted_dir / "traces"
    if not traces_dir.is_dir():
        sys.exit(f"no traces/ under {args.extracted_dir}")

    aircraft = defaultdict(set)          # tile -> set of icao
    points = defaultdict(int)            # tile -> point count
    cells = defaultdict(set)             # tile -> set of (gx, gy) occupied
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
            for tile in tile_for_point(lat, lon):
                lon_min, lon_max, lat_min, lat_max = TILES[tile]
                aircraft[tile].add(icao)
                points[tile] += 1
                gx = int((lon - lon_min) / (lon_max - lon_min) * GRID_N)
                gy = int((lat - lat_min) / (lat_max - lat_min) * GRID_N)
                cells[tile].add((min(gx, GRID_N - 1), min(gy, GRID_N - 1)))

    print(f"trace files read: {files_seen} (unreadable: {files_bad})")
    print()
    print("| tile | aircraft | points | grid occupied | empty% |")
    print("|---|---|---|---|---|")
    total_cells = GRID_N * GRID_N
    for tile in TILES:
        occ = len(cells[tile])
        empty_pct = (1 - occ / total_cells) * 100
        print(f"| {tile} | {len(aircraft[tile])} | {points[tile]} | "
              f"{occ}/{total_cells} | {empty_pct:.0f}% |")


if __name__ == "__main__":
    main()
