# SETU — Codebase Guide

## Repository Layout

```
The_Iynxs_C-hacks/
├── docs/
│   ├── coordination/          # Agent coordination docs
│   ├── research/              # Research (district selection, GIS)
│   └── technical/             # Technical documentation (this directory)
├── packages/
│   ├── core/                  # Core deterministic logic (event, sync, projections, routing)
│   └── server/                # Backend HTTP server (event log, projections, API)
├── frontend/
│   ├── packages/
│   │   ├── api-client/        # HTTP API client implementation
│   │   ├── contract/          # Zod schemas for wire format
│   │   ├── mock-backend/      # In-process mock backend for dev
│   │   └── ui/                # React component kit
│   ├── apps/
│   │   ├── field/             # Field app (volunteer reporting)
│   │   └── command/           # Command centre (situational awareness)
├── geo/
│   └── data/
│       └── out/               # GIS artifacts (roads, settlements, shelters, DEM, HAND)
├── data/
│   └── majuli/                # Majuli geographic artifacts
│       ├── dem/               # DEM and HAND rasters
│       └── hand/              # HAND computation artifacts
└── offline/
    ├── idb-schema.js          # IndexedDB schema
    ├── sw.js                  # Service worker
    ├── sync.js                # Offline sync module
    └── majuli_hand_bundle.json  # Bundled HAND data for offline use
```

## Core Package (`packages/core/`)

### `src/index.ts`
Public exports for all core modules:
- Event infrastructure: ULID, HLC, canonical JSON, content hash, envelope
- Sync: Version vectors, sync state, ingest
- Projections: Network (road passability), Flood (HAND inundation), People (cross-script matching)
- Routing: DAG (time-expanded), LatestDeparture (reverse sweep), Cutoff (settlement reachability)

### `src/event/`
- **ulid.ts**: ULID v1 generation (time-ordered IDs)
- **hlc.ts**: Hybrid Logical Clock for causal ordering
- **canonical.ts**: Canonical JSON (integers only, no floats)
- **content-hash.ts**: SHA-256 over canonical JSON for content integrity
- **envelope.ts**: Envelope type, creation, validation, happensBefore, totalOrder

### `src/sync/`
- **version-vector.ts**: Version vector operations for causality tracking
- **types.ts**: SyncRequest, SyncResponse, SyncState types
- **ingest.ts**: Sync ingest with duplicate delivery, hole healing, collision detection, 64KB max event size

### `src/project/`
- **network.ts**: Road state projection with valid-time observations + disputed flag
- **flood.ts**: HAND inundation projection with depth computation
- **people.ts**: Cross-script person matching (phonetic, normalize)

### `src/route/`
- **dag.ts**: Time-expanded DAG with node waiting, earliest arrival
- **latest-departure.ts**: Reverse sweep latest-safe-departure
- **cutoff.ts**: Settlement reachability and cut-off detection

## Server Package (`packages/server/`)

### `src/server.ts`
HTTP server on port 8080 with 6 endpoints:
- `POST /api/v1/events:batch` — submit field events
- `POST /api/v1/events/status` — get event sync status
- `GET /api/v1/projections` — projection snapshot (GeoJSON)
- `GET /api/v1/events` — list event records
- `GET /api/v1/stream` — SSE version bumps
- `GET /api/v1/health` — health check

### `src/event-log.ts`
Append-only JSONL log with in-memory indices, hole healing, duplicate detection.

### `src/translation.ts`
Wire format (FieldEvent) → internal envelope (Envelope) translation. Converts:
- UUID clientEventId → stored separately for idempotency
- ISO datetime → epoch ms integer
- Float lat/lng → microdegrees integers
- Float depthCm → decimetres (integers)

### `src/projection.ts`
Deterministic projection fold combining flood, network, people, and route projections into a single ProjectionSnapshot.

### `src/geo-artifacts.ts`
Loads Karthik's Majuli GIS artifacts (roads, settlements, shelters, roads, flood reference points) and builds synthetic subgraph for demo.

### `src/synthetic-artifacts.ts`
Synthetic Majuli geo artifacts for G1 when real data unavailable.

## Frontend Package (`frontend/packages/`)

### `api-client/`
- **http.ts**: HTTP API client with full endpoint support, validation, SSE/polling subscribe
- **index.ts**: createApiClient factory, resolveApiMode helper
- **api-client.test.ts**: Tests for HTTP client

### `contract/`
- **events.ts**: Zod schemas for FieldEvent types (flood_report, road_blockage, road_cleared, water_level, household_registration), EventRecord
- **projections.ts**: Zod schemas for projection types (FloodExtent, RoadStatus, Settlement, Route, Shelter)
- **index.ts**: Public exports

### `mock-backend/`
In-process mock backend for development without server:
- **store.ts**: In-process event store
- **seed/**: Guwahati seed scenario (roads, settlements, shelters)
- **relay/**: Dev relay on port 5199 for cross-tab communication

### `ui/`
React 19 component kit with accessibility compliance:
- **components.tsx**: React components
- **components.css**: Component styling
- **tokens.css**: Design tokens

### Frontend Apps (`frontend/apps/`)
- **field/**: Field app for volunteer reporting
- **command/**: Command centre for situational awareness

## Geographic Data (`data/majuli/`, `geo/data/`)

### `data/majuli/`
- **dem/**: DEM files (clipped, fixed, mosaic)
- **hand/**: HAND artifacts (hand.bin, drain_elev.bin, recv.bin, reach_id.bin)

### `geo/data/out/`
- **demo/**: Demo artifacts (road_graph, settlements, shelters, scenario_obs, road_status, etc.)
- **geojson/**: GeoJSON layers (roads, bridges, embankments, settlements, shelters, etc.)
- **offline/**: Offline bundle (vector + raster + scenario)

## Offline Infrastructure (`offline/`)
- **manifest.json**: PWA manifest
- **sw.js**: Service worker for app shell caching
- **idb-schema.js**: IndexedDB schema for offline persistence
- **sync.js**: Offline sync module
- **majuli_hand_bundle.json**: Bundled HAND data (~5 MB)
