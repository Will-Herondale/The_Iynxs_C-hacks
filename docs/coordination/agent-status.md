# Agent status — Karthik (geospatial data / GIS / validation)

Branch: `data/karthik` (PR to `main` pending review).
Last updated: 2026-10-30

## Sources investigated
- Copernicus GLO-30 DSM (1°×1° tiles, EPSG:4326): N26/N27 × E094/E093 — all four tiles downloaded and validated (no truncated headers).
- JRC Global Surface Water occurrence v1.4 1984–2021, 1/4000° grid (`occurrence_90E_30Nv1_4_2021.tif`) — truncated at first attempt (30/68 MB), re-downloaded with resume and validated.
- OpenStreetMap via Overpass API (194,254 elements; 126 MB raw JSON). Overpass returns HTTP 406 without a User-Agent, so the pipeline posts via Python with a UA header and falls back to a mirror.
- Majuli District Flood Contingency Plan 2026–27, DDMA Majuli (majuli.assam.gov.in PDF) — 23 relief camps extracted with raw DMS strings preserved for checking.
- Census 2011 district admin boundaries (pre-2016 district creation; Majuli sits inside Jorhat there) — kept as provenance, not used as the working boundary.

## Datasets obtained
See `geo/DATASETS.md` for the full catalogue (source, resolution, coverage, licence, limitations) and `geo/data/out/manifest.csv` (13 rows).

## Processing completed
Full pipeline green:
- `scripts/10_process.py` — clip / convert / reproject → GeoPackage + per-layer GeoJSON + GeoTIFFs. Now hardens against truncated GeoTIFFs (reads last row, fails loudly) and reports AOI nodata fraction. Coerces closed-ring highway polygons (roundabouts) to lines via `as_line()`.
- `scripts/20_shelters.py` — 23 camps from DDMA PDF; coordinates only where published; status "pre-identified camp, not confirmed open".
- `scripts/40_preview.py` — PNG contact sheet of sourced layers only (no flood extent).
- `scripts/50_validate.py` — 24 checks, all PASS. Produces `flood_sweep.csv` and `validation_report.json`. New check: every scenario target `osm_id` resolves in a delivered layer AND lies on the island (regresses the two bad picks found earlier).
- `scripts/60_scenarios.py` — 5 synthetic scenario configs (S1–S5), fixed seeds 101–105, `synthetic: true`, real feature ids, deterministic selection rules that fail loudly rather than invent features.

## Artifacts produced (`geo/data/out/`)
| Artifact | Size | Notes |
|---|---|---|
| `majuli.gpkg` | 48 MB | 11 vector layers, EPSG:4326 |
| `majuli_dem_30m_wgs84.tif` | 21 MB | Copernicus GLO-30 clipped to AOI, EPSG:4326 |
| `majuli_dem_30m_utm46n.tif` | 23 MB | same, EPSG:32646, for slope/length maths |
| `majuli_water_occurrence_30m.tif` | 1.4 MB | JRC GSW native grid, EPSG:4326 |
| `majuli_water_occurrence_30m_demgrid.tif` | 1.2 MB | GSW resampled (nearest) onto DEM grid, stacks pixel-for-pixel |
| `shelters.csv` | 12 KB | 23 camps, raw DMS preserved |
| `flood_sweep.csv` | — | Synthetic levels 78–92 m, island + AOI columns |
| `validation_report.json` | — | All checks pass |
| `manifest.csv` | — | Provenance, 13 rows |
| `scenarios/S{1..5}_*.json` | — | Synthetic scenario configs |
| `preview/majuli_layers.png` | 1.3 MB | Sourced layers only |
| `geojson/*.geojson` | — | Per-layer GeoJSON (buildings.geojson excluded from commit, 56 M, regenerable from GPKG) |

Layer counts: buildings 182,097; roads 11,736; bridges 518 (202 ≥30 m); waterways 191; waterbodies 120; places 62; amenities 8; ferries 2; shelters 23; boundary 1.

## Data-quality findings
- DEM nodata inside AOI: 0.06%. GSW nodata inside AOI: 0.09%.
- Island interior elevation: min 77.1 m, median 86.0 m, max 111.4 m. AOI-wide max 1,567 m (mainland/foothills in box).
- Two bad scenario picks found and fixed (see `geo/SCENARIOS.md`):
  - S1 had chosen a 179 m **mainland** trunk bridge at 94.58 E (outside island). Now `284824410`, 139.4 m primary bridge on island, deck ≈ 84.8 m → level 85.3 m.
  - S4 had chosen "Bulldozer Point" (74.5 m, a river label below the island floor). Now **Auniati** (village, 82.3 m) → level 83.8 m.
- Validator rejects any scenario target that resolves outside the island or is missing from a layer.
- The Majuli–Jorhat bridge is tagged `highway=construction` in OSM, so S1 excludes it; scenarios exercise only open crossings.
- `places.geojson` mixes settlements (6 villages, 2 towns) with 3 localities, some river labels. Population-facing features must filter to `village/hamlet/town` — S4 does.
- Only 1 of 62 places has a published population; shelter `capacity`/`occupancy` are not in the DDMA PDF and must remain unset (not invented).

## Missing information / open items
- Output format not yet confirmed by the team lead (provisional: EPSG:4326 GeoJSON + GeoPackage + UTM DEM copy).
- No HAND / drainage-region rasters produced yet (DEM prep done; flow-direction needed for HAND).
- Backend contract fields not yet mapped to my layer schemas (roadId vs osm_id, settlement population, shelter capacity/occupancy).
- Shelter capacities/occupancies: not published in DDMA plan; do not invent.

## Requests for other agents
- OpenCode: confirm the field mapping between my layers and `contract/src/projections.ts` (roadId, settlementId, shelterId, capacity, occupancy) before I treat formats as final.
- Darsh's Claude: confirm expected map-layer names / symbology for roads, shelters, settlements, flood extent, routes.

## Validation results
- `50_validate.py`: 24 checks, 24 pass, `"ok": true`.
- Flood sweep island totals at 92 m: 745.1 km of 893 km road flooded (83.4%), 14 of 23 camps, 11,661 island buildings.

## Commits and branches
- Branch `data/karthik` created from `main`. Nothing pushed yet (first push pending).
