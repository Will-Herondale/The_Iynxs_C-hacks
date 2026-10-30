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

## QA Findings — Network-Valid Demonstration (P0)

A connectivity investigation of the real road graph (`data/out/demo/road_graph.geojson`) found that **no network-valid settlement-to-shelter scenario exists in the real data**:

| Finding | Detail |
|---|---|
| Road graph components | 1,030 connected components (union-find on snapped endpoints at 5 decimal places) |
| Largest component | 86 endpoints, 107 features (87 roads, 19 bridges, 1 embankment) |
| Fragmentation cause | 1,345 road pairs cross without shared endpoints (OSM data quality) |
| Bridge criticality | No bridge removal splits component 0 — no articulation points found |
| Settlement-shelter overlap | No connected component contains both a settlement and a shelter |
| Settlement in component 0 | Kamalabari (0m from road), Auniati (45m), Dakhinpat (144m) |
| Shelter in component 0 | None — nearest shelter is 160m from a component 0 endpoint |

### Corrected scenario: SYN-DEMO-001

Because no network-valid scenario exists in real data, a **fully synthetic local road subgraph** was created at (94.6000, 27.1000), 13.3 km from any real feature:

| Element | Before Closure | After Closure |
|---|---|---|
| Settlement connected to road | Yes | Yes |
| Shelter reachable | Yes | No |
| Path | SYN-SET-001 → bridge → SYN-SHELTER-001 | None |
| Total distance | 200 m | N/A |
| Shelter status | Reachable | Cut off |

All synthetic features carry `classification: "SYNTHETIC"` and `synthetic: true`. Real geography is unaltered.

### Unsupported claims removed from original scenario

| Original Claim | Disposition |
|---|---|
| Auniati cut off by bridge 284824410 | Removed — bridge removal does not disconnect Auniati (both remain in component 0) |
| MJ-SH-009 serving Auniati | Removed — MJ-SH-009 is 21.6 km away, different component |
| 45-minute computed ETA | Removed — ETA was hardcoded fixture, not computed by any routing engine |

Original scenario files preserved unchanged for audit. Corrected files use `_syn` suffix.

