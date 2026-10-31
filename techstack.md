# SETU — Tech Stack

Geospatial data foundation for the Majuli (Assam) flood-demo application.
Owned by: GIS / Data / Validation Lead (Karthik)

## Runtime & Language

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| Python | CPython | 3.13 | Primary GIS processing language |
| Virtual environment | venv | — | Isolated dependency management |
| Shell | bash / zsh | — | Download scripts and pipeline orchestration |

## Core GIS Libraries (Python)

| Library | Version | Purpose |
|---------|---------|---------|
| geopandas | 1.2.0 | Vector data manipulation (GeoDataFrame, spatial joins, clipping) |
| rasterio | 1.5.2 | Raster I/O (DEM, GSW occurrence, HAND), masking, reprojection |
| shapely | — | Geometry operations (points, lines, polygons, unions, intersections) |
| pyproj | — | Coordinate reference system transformations (EPSG:4326 ↔ EPSG:32646) |
| pandas | — | Tabular data (manifest, flood sweep, scenario configs) |
| numpy | — | Array operations (raster math, flow direction, HAND computation) |
| pyogrio | — | Fast GeoPackage/GeoJSON read/write (layer inspection, feature counts) |
| matplotlib | 3.11.2 | Preview/contact sheet rendering (PNG output) |
| pypdf | — | PDF text extraction (DDMA flood contingency plan shelters) |

## System Dependencies (Homebrew)

| Package | Purpose |
|---------|---------|
| gdal | Geospatial Data Abstraction Library (raster/vector backend) |
| osmium | OSM data processing |
| poppler | PDF rendering support |

## Data Sources

| Dataset | Provider | Format | Licence | Use |
|---------|----------|--------|---------|-----|
| OpenStreetMap | OSM contributors via Overpass API | OSM JSON / GeoJSON | ODbL 1.0 | Roads, bridges, embankments, waterways, waterbodies, ferries, places, amenities, buildings, admin boundary |
| Copernicus DEM GLO-30 | ESA / Airbus (AWS Open Data) | GeoTIFF tiles | Copernicus (free, attribution) | Elevation (DSM), UTM reprojection |
| JRC Global Surface Water v1.4 | EC JRC / Google | GeoTIFF (1/4000° grid) | Copernicus (free, attribute "Source: EC JRC/Google") | Water occurrence 1984–2021, drainage network |
| DDMA Majuli Flood Contingency Plan 2026–27 | majuli.assam.gov.in | PDF | Official district document (no open licence) | Relief camp locations (23 camps) |

## Output Formats

| Format | CRS | Use |
|--------|-----|-----|
| GeoJSON | EPSG:4326 ([lng, lat]) | Per-layer vector files for frontend consumption |
| GeoPackage | EPSG:4326 | Single consolidated vector container (12 layers) |
| GeoTIFF (WGS84) | EPSG:4326 | DEM, GSW occurrence, HAND rasters |
| GeoTIFF (UTM 46N) | EPSG:32646 | DEM in metres for slope/length calculations |
| CSV | — | Shelter inventory, flood sweep table, manifest provenance |

## Coordinate Reference Systems

| CRS | Code | Use |
|-----|------|-----|
| WGS 84 | EPSG:4326 | All vector exchange, web/mobile display, raster storage |
| UTM Zone 46N | EPSG:32646 | Metric calculations (slope, length, area) |

## Version Control & Collaboration

| Tool | Purpose |
|------|---------|
| Git | Version control |
| GitHub | Remote repository, PR workflow (`github.com/Will-Herondale/The_Iynxs_C-hacks`) |
| Branch `data/karthik` | GIS data work (all geo scripts and artifacts) |
| Branch `main` | Protected production branch |
| Pull requests | Integration of geo artifacts into main |

## Frontend Contract (TypeScript / zod)

| Location | Purpose |
|----------|---------|
| `frontend/packages/contract/src/projections.ts` | GeoJSON FeatureCollection schemas (FloodExtent, RoadStatus, Settlement, Route, Shelter) |
| `frontend/packages/contract/src/events.ts` | Field event schemas (flood_report, road_blockage, road_cleared, water_level, household_registration) |

Field mapping: roadId ↔ osm_id, settlementId ↔ osm_id, shelterId ↔ shelter_id, coordinates [lng, lat].

## Data Integrity Rules

- Synthetic observations never represented as real-world observations
- No shelter locations or capacities invented
- No DEM-derived flood projection claimed as validated historical reconstruction
- Original source and licence recorded for every dataset
- CRS, resolution, extent, and processing steps documented
- Missing data and uncertainty explicitly recorded
- Raw source data kept separate from processed artifacts (`data/raw/` vs `data/output/`)
- Processing reproducible via `scripts/00_download.sh` + Python pipeline

## Output Layer Inventory

| Layer | Features | Type | Source |
|-------|----------|------|--------|
| buildings | 182,097 | Polygon | OSM |
| roads | 11,736 | LineString | OSM |
| embankments | 13 | LineString | OSM (embankment=yes) |
| bridges | 518 | LineString | OSM (bridge=yes) |
| waterways | 191 | LineString | OSM |
| waterbodies | 120 | Polygon | OSM |
| ferries | 2 | LineString | OSM |
| places | 62 | Point | OSM |
| amenities | 8 | Point | OSM |
| shelters | 23 | Point | DDMA PDF |
| majuli_boundary | 1 | Polygon | OSM admin relation |
| aoi | 1 | Polygon | Documented study box |

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/00_download.sh` | Idempotent raw downloads (DEM, GSW, OSM, admin boundaries) |
| `scripts/05_osm.py` | Overpass extract with User-Agent header (HTTP 406 fallback) |
| `scripts/10_process.py` | Clip/convert/reproject → GeoJSON + GeoPackage + GeoTIFF |
| `scripts/20_shelters.py` | Extract relief camps from DDMA contingency plan PDF |
| `scripts/40_preview.py` | PNG contact sheet of sourced layers |
| `scripts/50_validate.py` | Data-level validation (28 checks) + flood sweep table |
| `scripts/60_scenarios.py` | Synthetic scenario configs S1–S5 |
| `scripts/70_hand.py` | HAND (height above nearest drainage) raster |
| `scripts/80_demo_artifacts.py` | Observation-driven scenario artifacts |
| `scripts/90_offline_bundle.py` | Offline bundle assembler |

## Repository Structure

```
The_Iynxs_C-hacks/
├── README.md
├── LICENSE
├── .gitignore
├── geo/
│   ├── README.md
│   ├── DATASETS.md
│   ├── SCENARIOS.md
│   ├── scripts/
│   │   ├── 00_download.sh
│   │   ├── 05_osm.py
│   │   ├── 10_process.py
│   │   ├── 20_shelters.py
│   │   ├── 40_preview.py
│   │   ├── 50_validate.py
│   │   ├── 60_scenarios.py
│   │   ├── 70_hand.py
│   │   ├── 80_demo_artifacts.py
│   │   └── 90_offline_bundle.py
│   ├── data/
│   │   ├── raw/          (not committed — reproducible from downloads)
│   │   └── out/          (processed artifacts)
│   └── docs/
├── docs/
│   ├── coordination/
│   │   ├── README.md
│   │   ├── agent-status.md
│   │   ├── ownership.md
│   │   ├── integration-contract.md
│   │   └── messages/
│   │       └── agent-karthik.md
│   └── research/
│       └── majuli-gis-delivery.md
└── frontend/             (frontend/* branches — not owned by GIS lead)
```
