# Message from Karthik — geospatial data / GIS / validation

Branch: `data/karthik` (pushed to origin, PR #16 open to `main`)
Commit: `a629a0f` (plus scenario corrections pending)
Last updated: 2026-10-30

## What I've done

Inspected the repo (`main` is essentially empty; frontend on `frontend/*` branches). Read the draft API contract (`frontend/packages/contract/src/projections.ts`, `events.ts`) and frontend assumptions doc. Built the complete Majuli geo foundation and delivered an offline-capable dataset bundle.

## Sources investigated

- Copernicus GLO-30 DSM tiles N26/N27 × E093/E094 (4 tiles, EPSG:4326) — all downloaded and validated.
- JRC Global Surface Water occurrence v1.4 (1984–2021), 1/4000° grid — truncated download detected & re-downloaded with resume.
- OpenStreetMap via Overpass API (194,254 elements, 126 MB) — UA header required (HTTP 406 without it).
- DDMA Majuli Flood Contingency Plan 2026–27 PDF — 23 relief camps extracted.
- Census 2011 district boundaries (provenance only; pre-2016 creation).
- WorldPop India population (1.5 GB) — NOT downloaded due to size; documented as gap.

## QA Findings — Network-Valid Demonstration (P0)

Real road graph analysis (`data/out/demo/road_graph.geojson`) found **no network-valid scenario in real data**:

| Finding | Detail |
|---|---|
| Road graph components | 1,030 connected components |
| Largest component | 86 endpoints, 107 features (3.3% of all endpoints) |
| Fragmentation cause | 1,345 road pairs cross without shared endpoints |
| Bridge criticality | No bridge removal splits component 0 |
| Settlement-shelter overlap | No component contains both a settlement and a shelter |
| Original scenario claims | All three unsupported (Auniati cut off, MJ-SH-009 serving Auniati, 45-min ETA) |

**Corrected scenario SYN-DEMO-001:** Fully synthetic local road subgraph at (94.6000, 27.1000), 13.3 km from any real feature. Provides verifiable before/after connectivity (settlement → bridge → shelter, then bridge closure disconnects). All synthetic features carry `synthetic: true` and `classification: "SYNTHETIC"`. Real geography unaltered.

QA report: `data/out/demo/QA_REPORT.md`

## Processing completed (all green)

- `scripts/00_download.sh` — idempotent raw downloads
- `scripts/10_process.py` — clip/convert/reproject → GeoJSON + GeoTIFF + GPKG
- `scripts/20_shelters.py` — 23 camps from DDMA PDF
- `scripts/40_preview.py` — PNG contact sheet
- `scripts/50_validate.py` — 28 checks, all PASS
- `scripts/60_scenarios.py` — 5 synthetic scenario configs (S1–S5)
- `scripts/70_hand.py` — HAND raster (D8 flow + GSW streams) — EXPERIMENTAL only
- `scripts/80_demo_artifacts.py` — observation-driven demo artifacts
- `scripts/90_offline_bundle.py` — offline bundle assembler

## Verification results (P0 complete)

| Check | Result |
|---|---|
| GeoJSON validity | All 14 vector files valid |
| Geometry validity | 0 invalid geometries |
| CRS | All EPSG:4326 |
| Bridge 284824410 | Present in road_graph + bridges layer, deck elev 84.8 m |
| Settlements within island | 8 of 8 |
| Shelters within island | 23 of 23 |
| Schema vs contract | settlementId/name/population/accessibility/households/needs ✅ shelterId/name/capacity/occupancy/open ✅ roadId/name/status/updatedAt/sourceEventIds ✅ |
| Road graph components | 1030 (fragmented — OSM sparsity in Majuli, documented) |
| Settlement-shelter connectivity | No component contains both — no real route possible |

## Artifacts produced (`geo/data/out/offline/`)

**Core bundle: ~60 MB** — all loadable locally, no network required.

| Component | Size | Notes |
|---|---|---|
| `vector/` | ~12 MB | 10 REAL layers (roads, bridges, embankments, waterways, waterbodies, ferries, boundary, aoi, settlements, shelters) |
| `raster/` | ~48 MB | DEM WGS84+UTM46N, GSW native+demgrid, HAND experimental |
| `scenario/` | <1 KB | 12 SYNTHETIC scenario/impact JSONs (incl. corrected SYN-DEMO-001) |
| `manifest.json` | — | Bundle manifest: sizes, CRS, provenance, classification |
| `OFFLINE.md` | — | Offline usage documentation |
| `QA_REPORT.md` | — | QA report with connectivity findings and corrected scenario |

**Optional:** buildings (52 MB), excluded from core. Minimum viable bundle: ~33 MB.

## Classification (preserved everywhere)

| Category | Examples |
|---|---|
| REAL | Roads, bridges, embankments, waterways, waterbodies, ferries, settlements, shelters, boundary, DEM, GSW |
| SYNTHETIC | Scenario configs, road_status, settlement_status, shelter_status, flood_extent, route_status (incl. corrected SYN-DEMO-001 files) |
| EXPERIMENTAL | HAND raster (relative terrain only) |

## Key limitations (must be preserved in demo)

1. **HAND is experimental** — not for flood extent, passability, or evacuation safety. 87% AOI NoData, 95% island cells at HAND=0.
2. **Embankments unverified** — 13 OSM ways on highway ways, contextual only.
3. **Vertical reference illustrative** — DSM not bare earth, deck elevation approximated, 0.5 m offset not validated.
4. **Shelters pre-identified, not confirmed open** — `open: false`, capacity/occupancy = 0.
5. **No historical flood claim** — synthetic scenario only.
6. **No real settlement-to-shelter route exists** — synthetic subgraph required for demonstration.

## Requests for other agents

- **OpenCode:** Confirm field mapping between layers and `contract/src/projections.ts`. Review corrected scenario `SYN-DEMO-001` for integration. Road graph fragmentation (1,030 components) means routing must handle disconnected components.
- **Darsh's Claude:** Confirm expected map-layer names/symbology. Synthetic features must be rendered distinctly from real features.

## Commits and branches

- Branch `data/karthik` pushed to `origin/data/karthik`. PR #16 open to `main`. Commit `9bf9adb`.
