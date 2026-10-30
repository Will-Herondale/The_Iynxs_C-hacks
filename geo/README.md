# SETU Majuli — geo foundation

Reproducible pipeline that turns public sources into layers the demo app can consume.

```
DATASETS.md      catalogue: source, resolution, coverage, licence, limitations (task 1–2)
SCENARIOS.md     the 5 synthetic scenarios + validation checklist (task 4–5)
scripts/
  00_download.sh raw downloads (idempotent)
  05_osm.py      Overpass extract (needs a User-Agent; plain curl gets HTTP 406)
  10_process.py  clip / convert / reproject -> GeoJSON + GeoPackage + GeoTIFF
  20_shelters.py extract relief camps from the DDMA contingency plan PDF
  40_preview.py  PNG contact sheet of the sourced layers (no flood extent)
  50_validate.py data-level checks + the S3 water-level sweep table
  60_scenarios.py author S1–S5 configs with real feature ids
data/raw/        untouched downloads (never edited)
data/out/        deliverables + manifest.csv
```

## Run

```sh
scripts/00_download.sh                  # DEM, GSW, OSM via Overpass, admin boundaries
.venv/bin/python scripts/20_shelters.py # camps from the DDMA PDF
.venv/bin/python scripts/10_process.py  # all vector + raster outputs
.venv/bin/python scripts/40_preview.py  # preview PNG
.venv/bin/python scripts/50_validate.py # checks + flood_sweep.csv
```

## Outputs

| File | Content | CRS |
|---|---|---|
| `data/out/majuli.gpkg` | `shelters, majuli_boundary, roads, bridges, waterways, waterbodies, ferries, places, amenities, buildings` | EPSG:4326 |
| `data/out/geojson/*.geojson` | same layers, one file each (roads/bridges/waterways/ferries carry `length_m`, polygons `area_m2`) | EPSG:4326 |
| `data/out/majuli_dem_30m_wgs84.tif` | Copernicus GLO-30 clipped to AOI | EPSG:4326 |
| `data/out/majuli_dem_30m_utm46n.tif` | same, metres, for slope/length maths | EPSG:32646 |
| `data/out/majuli_water_occurrence_30m.tif` | JRC GSW occurrence 1984–2021, native 1/4000° grid | EPSG:4326 |
| `data/out/majuli_water_occurrence_30m_demgrid.tif` | same, resampled to the DEM grid so the two stack pixel-for-pixel | EPSG:4326 |
| `data/out/shelters.csv` | DDMA camps, coordinates only where published | EPSG:4326 |
| `data/out/flood_sweep.csv` | **synthetic** road/camp/building counts per hypothetical water level | — |
| `data/out/scenarios/S{1..5}_*.json` | **synthetic** scenario configs, fixed seeds, real feature ids | — |
| `data/out/validation_report.json` | pass/fail per check + which checks need the router | — |
| `data/out/preview/majuli_layers.png` | visual contact sheet of sourced layers | — |
| `data/out/manifest.csv` | provenance row per output | — |

Note the two water rasters differ in grid: GSW is 1/4000° (~27.8 m) and the DEM is 1/3600° (~30.9 m). Use the `_demgrid` copy for any per-pixel comparison with elevation.

Provenance fields on every row/file: `source, source_url, licence, retrieved, resolution, synthetic`.

## Source licences

- **OpenStreetMap** — ODbL 1.0. Attribution “© OpenStreetMap contributors”; derivative databases must stay ODbL. Do not mix OSM geometry into a proprietary tileset without checking share-alike.
- **Copernicus DEM GLO-30** — free, attribution required (ESA/Airbus).
- **JRC Global Surface Water** — Copernicus, free; attribute “Source: EC JRC/Google”.
- **DDMA flood contingency plan** — official district document, no explicit open licence; used as reference with attribution, coordinates transcribed as published.
- **Census of India 2011** — Government Open Data Licence – India.

## Known gaps (be explicit in the demo)

1. OSM coverage of Majuli roads/bridges/buildings is sparse and uneven — absence of a feature is **not** evidence it does not exist.
2. 30 m DSM error is comparable to the island’s relief; flood depth must come from a stated scenario level, not from terrain analysis alone.
3. No authoritative open georeferenced shelter layer exists; the DDMA list is partial, “likely to be set up”, and must be shown as unvalidated.
4. Census 2011 village coordinates are not published with the tables; village → point matching needs manual review.
5. District boundary layer is Census 2011 (pre-2016 district creation), so Majuli sits inside Jorhat there. The working AOI is therefore the **documented study box** (93.60–94.70 E, 26.78–27.22 N) and the OSM administrative outline is exported separately as `majuli_boundary.geojson` (~798 km² including river and sandbars, vs 483 km² of dry land). Rasters are clipped to the box, not to the outline, so the Brahmaputra channels stay in frame.
6. The AOI box also takes in mainland Assam (Jorhat, Sivasagar, Dhemaji margins) and foothills to the north-west, so heights run to ~1,567 m and many bridges in `bridges.geojson` are not Majuli crossings. Mask with `majuli_boundary.geojson`, or filter on `length_m` (only 202 of 518 bridges are ≥30 m; the rest are culverts on tracks). Scenario selection applies the island mask explicitly; `50_validate.py` fails if any scenario target sits outside the island.
7. The Majuli–Jorhat bridge is tagged `highway=construction` in OSM, so S1 excludes it and exercises only crossings that are already open.
8. `places.geojson` mixes settlement points (6 villages, 2 towns) with 3 localities, some of which are river labels. Anything population-facing must filter to `village/hamlet/town` — S4 does.
