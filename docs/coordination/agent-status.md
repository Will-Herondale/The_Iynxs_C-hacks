# Agent status — Karthik (geospatial data / GIS / validation)

Branch: `data/karthik` (pushed to origin, PR #16 open to `main`).
Last updated: 2026-10-30

## Sources investigated
- Copernicus GLO-30 DSM (1°×1° tiles, EPSG:4326): N26/N27 × E094/E093 — all four tiles downloaded and validated (no truncated headers).
- JRC Global Surface Water occurrence v1.4 1984–2021, 1/4000° grid (`occurrence_90E_30Nv1_4_2021.tif`) — truncated at first attempt (30/68 MB), re-downloaded with resume and validated.
- OpenStreetMap via Overpass API (194,254 elements; 126 MB raw JSON). Overpass returns HTTP 406 without a User-Agent, so the pipeline posts via Python with a UA header and falls back to a mirror.
- Majuli District Flood Contingency Plan 2026–27, DDMA Majuli (majuli.assam.gov.in PDF) — 23 relief camps extracted with raw DMS strings preserved for checking.
- Census 2011 district admin boundaries (pre-2016 district creation; Majuli sits inside Jorhat there) — kept as provenance, not used as the working boundary.
- WorldPop India population (`ind_ppp_2020_UNadj.tif`, 1.5 GB) — **not downloaded** due to size; documented as a gap.

## Processing completed
Full pipeline green:
- `scripts/00_download.sh` — idempotent raw downloads (DEM, GSW, OSM, admin).
- `scripts/05_osm.py` — Overpass extract with UA header (HTTP 406 without it).
- `scripts/10_process.py` — clip / convert / reproject → GeoPackage + per-layer GeoJSON + GeoTIFFs. Now hardens against truncated GeoTIFFs, coerces closed-ring highway polygons (`as_line()`), extracts `embankment=yes` ways into a separate layer.
- `scripts/20_shelters.py` — 23 camps from DDMA PDF; coordinates only where published; status "pre-identified camp, not confirmed open".
- `scripts/40_preview.py` — PNG contact sheet of sourced layers (incl. embankments).
- `scripts/50_validate.py` — 28 checks, all PASS. Produces `flood_sweep.csv` and `validation_report.json`. Includes HAND raster checks and scenario-target island validation.
- `scripts/60_scenarios.py` — 5 synthetic scenario configs (S1–S5), fixed seeds 101–105, `synthetic: true`, real feature ids.
- `scripts/70_hand.py` — HAND (height above nearest drainage) raster from DEM + GSW via D8 flow direction + reverse flow tracing.
- `scripts/80_demo_artifacts.py` — observation-driven demo artifacts: road graph, settlements, shelters, synthetic scenario S1_obs_driven.
- `scripts/90_offline_bundle.py` — offline bundle assembler: self-contained Majuli dataset for app bundling, no network required.

## Artifacts produced (`geo/data/out/`)
| Artifact | Size | Notes |
|---|---|---|
| `majuli.gpkg` | 48 MB | 12 vector layers, EPSG:4326 |
| `majuli_dem_30m_wgs84.tif` | 21 MB | Copernicus GLO-30 clipped to AOI, EPSG:4326 |
| `majuli_dem_30m_utm46n.tif` | 23 MB | same, EPSG:32646 |
| `majuli_hand_30m_wgs84.tif` | — | **derived** HAND = height above nearest GSW-mapped drainage (D8 flow, GSW >25% = stream). Experimental — relative terrain only, not flood extent. |
| `majuli_water_occurrence_30m.tif` | 1.4 MB | JRC GSW native grid, EPSG:4326 |
| `majuli_water_occurrence_30m_demgrid.tif` | 1.2 MB | GSW resampled onto DEM grid |
| `shelters.csv` | 12 KB | 23 camps, raw DMS preserved |
| `flood_sweep.csv` | — | Synthetic levels 78–92 m, island + AOI columns |
| `validation_report.json` | — | 28 checks, all pass |
| `manifest.csv` | — | Provenance, 14 rows |
| `scenarios/S{1..5}_*.json` | — | Synthetic scenario configs |
| `preview/majuli_layers.png` | 1.3 MB | Sourced layers only |
| `offline/OFFLINE.md` | — | Offline bundle documentation |
| `offline/manifest.json` | — | Bundle manifest: sizes, CRS, classification |
| `offline/vector/*.geojson` | ~12 MB core | Roads, bridges, embankments, waterways, waterbodies, ferries, settlements, shelters, boundary, aoi (+ buildings optional) |
| `offline/raster/*.tif` | ~48 MB core | DEM WGS84 + UTM46N, GSW native + demgrid, HAND experimental |
| `offline/scenario/*.json` | <1 MB core | Synthetic scenario + impact JSONs |
| `geojson/*.geojson` | — | Per-layer GeoJSON (working copies) |

Core offline bundle: **60 MB** total (~12 MB vector + ~48 MB raster + <1 MB scenario).
Optional buildings layer: **52 MB** (excluded from core).

Layer counts: buildings 182,097; roads 11,736; embankments 13; bridges 518 (202 ≥30 m); waterways 191; waterbodies 120; places 62; amenities 8; ferries 2; shelters 23; boundary 1.

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
- HAND: 895,429 cells reach mapped drainage (max 619.3 m); 5,378,795 cells drain off-raster/to sinks → nodata (honest data-quality signal, not invented). Within island boundary: 95% of cells at HAND=0 (Majuli is almost entirely at river level).

## Missing information / open items
- Output format not yet confirmed by the team lead (provisional: EPSG:4326 GeoJSON + GeoPackage + UTM DEM copy).
- Backend contract fields mapped in `docs/coordination/integration-contract.md` — needs OpenCode sign-off.
- Shelter capacities/occupancies: not published in DDMA plan; do not invent.
- Population: WorldPop `ind_ppp_2020_UNadj.tif` (1.5 GB) not downloaded due to size; documented as a gap.

## Requests for other agents
- OpenCode: confirm the field mapping between my layers and `contract/src/projections.ts` (roadId, settlementId, shelterId, capacity, occupancy) before I treat formats as final.
- Darsh's Claude: confirm expected map-layer names / symbology for roads, shelters, settlements, flood extent, routes.

## Validation results
- `50_validate.py`: 28 checks, 28 pass, `"ok": true`.
- Flood sweep island totals at 92 m: 745.1 km of 893 km road flooded (83.4%), 14 of 23 camps, 11,661 island buildings.
- Demo artifacts (`80_demo_artifacts.py`): road graph (1671 features), settlements (8), shelters (23), scenario S1_obs_driven — all generate cleanly, real vs synthetic clearly flagged.
- Offline bundle (`90_offline_bundle.py`): 60 MB core bundle, all layers loadable locally, no network services required. Manifest at `geo/data/out/offline/manifest.json`.

## Offline readiness (P0)
- **No live Overpass:** All OSM data is pre-extracted to local GeoJSON.
- **No tile servers:** All rasters are local GeoTIFFs (DEM, GSW occurrence).
- **No external geocoding:** All coordinates are pre-resolved in GeoJSON.
- **Bounded extent:** All data clipped to AOI box (93.60–94.70 E, 26.78–27.22 N) or island boundary.
- **Feature distinction:** REAL vs SYNTHETIC vs EXPERIMENTAL classified in manifest.json and `synthetic: true` fields.
- **Minimum viable bundle:** ~33 MB (excludes buildings, UTM DEM, HAND).

## Commits and branches
- Branch `data/karthik` pushed to `origin/data/karthik`. PR #16 open to `main`.
