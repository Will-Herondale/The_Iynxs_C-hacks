# SETU: Tech Stack

# Frontend

**Language and tooling**
- TypeScript (strict) across all packages
- npm workspaces monorepo
- Vite (dev server and builds)
- ESLint

**UI**
- React 19 (Field app and Command Centre)
- `@setu/ui`: in-house design system (React components, CSS tokens, sync-status badges)
- Plain CSS, no UI framework

**Maps**
- MapLibre GL
- `@setu/geo`: bundled Majuli data, offline map style and terrain hillshade (no tile-server calls)

**Data and API**
- `@setu/contract`: zod schemas, inferred types and the `ApiClient` interface; every backend response is validated
- `@setu/api-client`: HTTP adapter against `VITE_API_URL`; SSE for live updates with polling fallback
- TanStack Query (fetching and caching in Command)
- The frontend renders what the backend returns; it computes no routes, flood extents or accessibility

**Offline (Field app)**
- PWA via `vite-plugin-pwa` (service worker and manifest; production builds only, HTTPS required)
- Dexie (IndexedDB) for the report queue and cached projections
- Idempotent `clientEventId`, retries with backoff, tab lock, `/health` connectivity probe

**Testing**
- Vitest (unit tests)
- Playwright (browser tests, including offline flows) and axe-core (accessibility)
- `@setu/api-client/testing` fake contract server and `mock-backend` test double (tests only, never used at runtime)

**Apps**
- `frontend/apps/field` (port 5173) and `frontend/apps/command` (port 5174)

**Development tools**
- Git and GitHub (branches, pull requests, issues)
- GitHub CLI (`gh`)
- Claude Code (AI-assisted development)
- Orca (runs parallel agents, one worktree each)

# Backend

**Language and tooling**
- TypeScript (strict)
- Node.js (v22 LTS)
- tsx (TypeScript execution without separate build step)
- npm

**Server**
- Native Node.js `http` server (no Express)
- SSE (Server-Sent Events) for live projection updates to frontend
- HTTP REST API: `GET /api/v1/projections`, `GET /api/v1/events`, `GET /api/v1/health`, `POST /api/v1/events:batch`
- Append-only JSONL event log
- Invalid UUID-v4 client IDs rejected before append
- Idempotent submissions (same clientEventId returns same eventId)
- Omission metadata for unsupported record types (e.g., `person.register`)

**Projection engine**
- Flood projection from obs.water events with depth > 0
- Road status projection: blocked when flood event occurs at road location
- Settlement cut-off projection: settlement is cut off when blocked roads surround it
- Route refusal projection: route unavailable when any edge is blocked
- Route refusal explanation: naming blocking roads/features with source event IDs
- Settlement cut-off reason: naming blocking road features with source event IDs

**Data model**
- `clientEventId` (UUID v4): idempotency key for deduplication
- `eventId` (ULID): server-assigned event identifier
- `sourceEventIds`: provenance mapping from road/settlement/route back to originating events
- Field events: `flood_report`, `road_blockage`, `road_cleared`, `water_level`, `household_registration`
- Legacy `person.register` records: omitted from response with `omitted` metadata

**Contract types (shared with frontend via `@setu/contract`)**
- `ProjectionSnapshot`: roads, settlements, routes, shelters, flood extent as GeoJSON FeatureCollections
- `EventRecord`: event with server state (applied/conflict/rejected) and applied version
- `RouteRefusal`: summary, blockingFeatureIds, sourceEventIds
- `SettlementCutOff`: summary, blockingFeatureIds, sourceEventIds

**Testing**
- Vitest (unit tests)
- Server restart/persistence/provenance/refusal regression tests
- Route edge-ID regression tests

**Development tools**
- Git and GitHub (branches, pull requests, issues)
- GitHub CLI (`gh`)
- Claude Code (AI-assisted development)
- Orca (runs parallel agents, one worktree each)

# Cloud Infrastructure

**Azure (Production)**
- Resource Group: `setu-demo-rg`
- App Service Plan: `setu-demo-plan` (Linux, B1 tier)
- Web App: `setu-backend-demo` (Node.js 22 LTS, Linux)
- Region: East US
- Deployment: Zip deploy via `az webapp deploy`
- Tunnel: `cloudflared tunnel --url http://localhost:18080` (ephemeral trycloudflare.com URL for demo)

Data:


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

