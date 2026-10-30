#!/usr/bin/env bash
# Download raw source data for the SETU Majuli demo. Idempotent.
set -uo pipefail
cd "$(dirname "$0")/.."
RAW=data/raw
mkdir -p "$RAW" "$RAW/osm" data/out logs

DEM=https://copernicus-dem-30m.s3.amazonaws.com
# AOI is 93.60-94.70 E, so the 93E tiles are needed as well as 94E.
for t in N26_00_E093_00 N26_00_E094_00 N27_00_E093_00 N27_00_E094_00; do
  f="Copernicus_DSM_COG_10_${t}_DEM"
  [ -s "$RAW/dem/$f.tif" ] || { mkdir -p "$RAW/dem"; curl -fL --retry 3 -o "$RAW/dem/$f.tif" "$DEM/$f/$f.tif"; }
done

# GSW tiles are 10x10 degree and named <west_lon>E_<north_lat>N (bounds are SW=90E,10N
# for the "90E_20N" file), so the AOI at 27N sits in the 30N tile.
GSW=https://storage.googleapis.com/global-surface-water/downloads2021
[ -s "$RAW/gsw/occurrence_90E_30Nv1_4_2021.tif" ] || {
  mkdir -p "$RAW/gsw"
  curl -fL --retry 3 -o "$RAW/gsw/occurrence_90E_30Nv1_4_2021.tif" \
    "$GSW/occurrence/occurrence_90E_30Nv1_4_2021.tif"
}

BASE=https://raw.githubusercontent.com/datameet/maps/master/Districts/Census_2011
for ext in shp dbf shx prj; do
  [ -s "$RAW/admin/2011_Dist.$ext" ] || { mkdir -p "$RAW/admin"; curl -fL --retry 3 -o "$RAW/admin/2011_Dist.$ext" "$BASE/2011_Dist.$ext"; }
done

# OSM: Overpass rejects header-less curl with HTTP 406, so POST from Python.
[ -s "$RAW/osm/majuli_osm.json" ] || .venv/bin/python scripts/05_osm.py

echo "--- sizes ---"
du -sh "$RAW"/* 2>/dev/null
