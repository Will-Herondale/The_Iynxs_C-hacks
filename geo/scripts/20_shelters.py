#!/usr/bin/env python
"""Extract the pre-identified relief camps from the Majuli DDMA Flood
Contingency Plan 2026-27 PDF.

This is transcription, not invention: only camps with coordinates printed in
the document are emitted. Coordinates are as published (DMS) and converted to
decimal degrees. Every row keeps the raw string so a human can re-check it.

Output: data/out/shelters.csv + data/out/geojson/shelters.geojson
"""
from __future__ import annotations

import pathlib
import re
import sys

import pandas as pd

ROOT = pathlib.Path(__file__).resolve().parents[1]
TXT = ROOT / "data/raw/shelters/plan.txt"
OUT = ROOT / "data/out"
OUT.mkdir(parents=True, exist_ok=True)
(GJ := OUT / "geojson").mkdir(exist_ok=True)

SRC_NAME = "Majuli District Flood Contingency Plan 2026-27, DDMA Majuli (majuli.assam.gov.in)"
RETRIEVED = "2026-10-30"

LAT = r"N\s*[-–]?\s*(2[67])\s*°\s*(\d{1,2})\s*['′’]\s*([\d.]+)?\s*[\"”″]?"
LON = r"E\s*[-–]?\s*(9[45])\s*°\s*(\d{1,2})\s*['′’]\s*([\d.]+)?\s*[\"”″]?"


def normalise(text: str) -> str:
    """Re-join coordinates that the PDF text layer split across lines."""
    t = text.replace("\u00a0", " ")
    # "E-\n94°..." and "N-27°\n2'..." style breaks
    t = re.sub(r"([NE])\s*[-–]?\s*\n\s*(\d{2}\s*°)", r"\1-\2", t)
    t = re.sub(r"(\d{2}\s*°)\s*\n\s*(\d{1,2}\s*['′’])", r"\1 \2", t)
    t = re.sub(r"(\d{1,2}\s*['′’])\s*\n\s*([\d.]+)\s*([\"”″])?", r"\1 \2\3", t)
    t = re.sub(r"(\d{2}\s*°)\s*\n\s*([\d.]+)", r"\1 \2", t)
    return t


def dms(deg: str, minute: str, sec: str | None) -> float:
    v = float(deg) + float(minute) / 60 + (float(sec) if sec else 0) / 3600
    return round(v, 6)


def clean_name(raw: str) -> str:
    s = re.sub(r"\s+", " ", raw).strip(" .|-")
    s = re.sub(r"^(?:(?:Yes|No)\s+)+", "", s, flags=re.I)  # facility flags leaked from prev row
    # coordinate fragments that wrapped in from the previous row
    s = re.sub(r"[NE]\s*[-–]?\s*\d{2}\s*°[^A-Za-z]*[\"”″]?", " ", s, flags=re.I)
    s = re.sub(r"\b\d+\s*(k\.?m|km)\b\.?$", "", s, flags=re.I).strip(" .|-")
    s = re.sub(r"^(\d+)\s+(?=[A-Z])", "", s)  # leading serial numbers
    s = re.sub(r"^(SL\.?\s*NO|NO)\s*$", "", s, flags=re.I)
    return s.strip(" .|-")


# Rows whose name and coordinates are separated by contact-number columns in
# the PDF, so line-adjacency extraction cannot pair them. Transcribed by hand
# from the same document; raw strings kept verbatim for checking.
MANUAL = [
    ("Ratanpur Miri H.S", "N-27°05'30.8\" E-94°23'38.2\""),
    ("Jengrai Karkichuk Mising Community hall", "N-27°02'11.0\" E-94° 15' 59.5548\""),
    ("Kathalkhuwa Kathamia LPS", "N-27° 4' 57.774\" E-94° 20' 51.0\""),
    ("Atoichuk Jyoti Mahila Samittee Rangamansa", "N-26° 57' 51.4\" E-94° 17' 13.218\""),
    ("Pitambar Dev Goswami Junior College", "N- 26° 58' 45.2928\" E- 94° 8' 48.0588\""),
    ("Garamur Sadar LPS", "N- 26° 58' 47.7516\" E- 94° 9' 23.202\""),
]


def main() -> int:
    if not TXT.exists():
        print("missing", TXT, "- run the PDF text extraction first", file=sys.stderr)
        return 1
    lines = normalise(TXT.read_text()).splitlines()

    rows = []
    for i, line in enumerate(lines):
        mlat, mlon = re.search(LAT, line), re.search(LON, line)
        if not (mlat and mlon):
            continue
        lat = dms(mlat.group(1), mlat.group(2), mlat.group(3))
        lon = dms(mlon.group(1), mlon.group(2), mlon.group(3))
        if not (26.5 < lat < 27.6 and 93.5 < lon < 95.0):
            continue
        name = clean_name(line[: mlat.start()])
        if len(name) < 4:  # name wrapped onto previous lines
            back = [clean_name(x) for x in lines[max(0, i - 3): i] if x.strip()]
            back = [b for b in back if len(b) > 3][-2:]
            name = " ".join(back + ([name] if name else []))
        if len(name) < 4:
            continue
        rows.append(dict(
            name=name,
            lat=lat,
            lon=lon,
            raw_coord=f"{mlat.group(0)} {mlon.group(0)}".replace("\n", " "),
            source=SRC_NAME,
            source_url="https://majuli.assam.gov.in/sites/default/files/public_utility/Flood%20Contingency%20Plan%202026-27_compressed.pdf",
            retrieved=RETRIEVED,
            coord_source="as published (DMS -> decimal)",
            status="pre-identified camp, not confirmed open",
            synthetic="false",
        ))

    df = pd.DataFrame(rows).drop_duplicates(subset=["name", "lat", "lon"])

    for name, raw in MANUAL:
        mlat, mlon = re.search(LAT, raw), re.search(LON, raw)
        if not (mlat and mlon):
            print("manual row unparsed:", name, file=sys.stderr)
            continue
        df.loc[len(df)] = dict(
            name=name,
            lat=dms(mlat.group(1), mlat.group(2), mlat.group(3)),
            lon=dms(mlon.group(1), mlon.group(2), mlon.group(3)),
            raw_coord=raw,
            source=SRC_NAME,
            source_url="https://majuli.assam.gov.in/sites/default/files/public_utility/Flood%20Contingency%20Plan%202026-27_compressed.pdf",
            retrieved=RETRIEVED,
            coord_source="as published (DMS -> decimal), transcribed from multi-line table",
            status="pre-identified camp, not confirmed open",
            synthetic="false",
        )

    # same camp printed in more than one table
    df["_key"] = df.lat.round(4).astype(str) + "," + df.lon.round(4).astype(str)
    df = df.drop_duplicates(subset="_key", keep="first").drop(columns="_key")
    df = df.reset_index(drop=True)
    df.insert(0, "shelter_id", [f"MJ-SH-{i+1:03d}" for i in range(len(df))])

    # flag suspected copy-paste coordinates shared by different camps
    dup = df.groupby(["lat", "lon"])["name"].transform("count") > 1
    df["needs_review"] = dup.map({True: "shared coordinate with another camp", False: ""})

    df.to_csv(OUT / "shelters.csv", index=False)

    try:
        import geopandas as gpd
        from shapely.geometry import Point
        gdf = gpd.GeoDataFrame(df, geometry=[Point(x, y) for x, y in zip(df.lon, df.lat)],
                               crs="EPSG:4326")
        gdf.to_file(GJ / "shelters.geojson", driver="GeoJSON")
        gdf.to_file(OUT / "majuli.gpkg", layer="shelters", driver="GPKG")
    except Exception as e:  # geopandas optional for this step
        print("vector export skipped:", e, file=sys.stderr)

    print(f"{len(df)} camps with published coordinates -> data/out/shelters.csv")
    print(df[["shelter_id", "name", "lat", "lon", "needs_review"]].head(15).to_string(index=False))
    print("flagged for review:", int((df.needs_review != "").sum()))
    return 0


if __name__ == "__main__":
    sys.exit(main())
