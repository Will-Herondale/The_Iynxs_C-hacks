#!/usr/bin/env python
"""Download the OSM extract for the Majuli AOI from Overpass.

The plain `curl --data-urlencode` call in 00_download.sh gets HTTP 406 from
overpass-api.de: the main instance rejects requests without a descriptive
User-Agent. This script POSTs the query with proper headers, tries a few
mirrors, and refuses to write a file that does not parse as JSON with at least
one element.

Output: data/raw/osm/majuli_osm.json (raw, never edited afterwards)
"""
from __future__ import annotations

import json
import pathlib
import sys

import requests

ROOT = pathlib.Path(__file__).resolve().parents[1]
OSM = ROOT / "data/raw/osm"
OSM.mkdir(parents=True, exist_ok=True)
QUERY = OSM / "query.overpassql"
OUT = OSM / "majuli_osm.json"

# AOI plus margin: the island itself is 26.83-27.15 N / 93.70-94.60 E.
BBOX = "26.78,93.60,27.22,94.70"

QUERY_TEXT = f"""[out:json][timeout:600];
(
  way["highway"]({BBOX});
  way["waterway"]({BBOX});
  way["natural"="water"]({BBOX});
  relation["natural"="water"]({BBOX});
  way["bridge"]({BBOX});
  way["man_made"="bridge"]({BBOX});
  way["route"="ferry"]({BBOX});
  node["place"~"^(village|hamlet|town|locality|suburb)$"]({BBOX});
  way["building"]({BBOX});
  node["amenity"~"^(shelter|social_facility|school|college)$"]({BBOX});
  relation["boundary"="administrative"]["name"~"Majuli"]({BBOX});
);
out geom;"""

ENDPOINTS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://lz4.overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]

HEADERS = {
    "User-Agent": "SETU-Majuli-Geo/1.0 (flood demo data prep; contact: karth)",
}


def validate(path: pathlib.Path) -> int:
    """Return element count, or 0 if the file is not usable."""
    try:
        data = json.loads(path.read_text())
    except Exception:
        return 0
    if not isinstance(data, dict) or "elements" not in data:
        return 0
    return len(data["elements"])


def main() -> int:
    if OUT.exists() and validate(OUT) > 0:
        print(f"already present: {OUT} ({OUT.stat().st_size / 1e6:.1f} MB, {validate(OUT)} elements)")
        return 0

    QUERY.write_text(QUERY_TEXT + "\n")

    for ep in ENDPOINTS:
        print(f"POST {ep} ...", flush=True)
        try:
            r = requests.post(ep, data={"data": QUERY_TEXT}, headers=HEADERS, timeout=700)
        except Exception as e:
            print("  failed:", type(e).__name__, str(e)[:160])
            continue
        if r.status_code != 200:
            print(f"  HTTP {r.status_code}: {r.text[:200]}")
            continue
        tmp = OUT.with_suffix(".part")
        tmp.write_bytes(r.content)
        n = validate(tmp)
        if n == 0:
            print(f"  {len(r.content)/1e6:.1f} MB but not valid Overpass JSON; discarded")
            tmp.unlink(missing_ok=True)
            continue
        tmp.replace(OUT)
        print(f"  ok: {OUT.stat().st_size / 1e6:.1f} MB, {n} elements")
        return 0

    print("all Overpass endpoints failed", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
