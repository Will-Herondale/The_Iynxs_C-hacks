# SETU — System Overview

## Overview

SETU is an offline-capable disaster-response system built for Majuli, Assam — a flood-prone river island district in India. The system transforms a volunteer's field observation of water under a bridge into a complete flood response: flooded roads, blocked routes, cut-off villages, and evacuation deadlines — all computed, not typed in.

## Core Architecture

SETU uses a **TypeScript end-to-end** architecture with two main applications:

### Backend (`packages/server/`)
- **Event Log**: Append-only JSONL event store with in-memory indices
- **Event Translation**: Wire format (FieldEvent with floats, ISO strings, UUIDs) translated to internal envelope (ULIDs, HLC timestamps, integers, decimetres)
- **Projection Fold**: Deterministic fold that computes flood inundation, road passability, settlement accessibility, evacuation routes, and shelter status from the event log
- **HTTP Server**: Six REST endpoints plus SSE stream for real-time updates
- **Geo Artifacts**: Loads Karthik's Majuli GIS data (roads, settlements, shelters, bridges, flood reference points)

### Core Library (`packages/core/`)
- **Event Envelope**: ULID v1 IDs, Hybrid Logical Clocks, canonical JSON, SHA-256 content hashing
- **Sync Protocol**: Version vectors, hole healing, duplicate detection, collision handling
- **Projections**: Flood inundation (HAND-based), road network passability, people matching, routing DAG, latest-safe-departure, settlement cut-off
- **Routing**: Time-expanded DAG with node waiting, reverse sweep latest-safe-departure

### Frontend (`frontend/packages/`)
- **Contract**: Zod schemas for all wire formats (FieldEvent, ProjectionSnapshot, EventRecord, etc.)
- **API Client**: HTTP adapter with full sync semantics (polling fallback, SSE, retry)
- **Mock Backend**: In-process store with dev relay port 5199, Guwahati seed scenario
- **UI**: React 19 component kit with accessibility audit compliance

### Geographic Data (`data/majuli/`, `geo/data/`)
- **DEM**: Copernicus GLO-30 tiles mosaiced and clipped to Majuli extent (94.0–94.6°E, 26.5–27.2°N)
- **HAND**: Height Above Nearest Drainage computed via pyflwdir (EXPERIMENTAL — not used for flood extent decisions)
- **Roads/Settlements/Shelters**: OSM and DDMA data for Majuli district
- **Offline Bundle**: ~60 MB core bundle for offline application use

## Key Architectural Decisions

| Decision | Rationale |
|----------|-----------|
| TypeScript end-to-end | Single type system across frontend, backend, and core logic |
| Append-only JSONL event log | Immutable audit trail, simple crash recovery, easy sync |
| Wire format = floats/ISO/UUIDs; Internal = integers/HLC/ULID | Frontend-friendly wire format, deterministic internal processing |
| HAND for flood projection | Fast, data-light alternative to hydrodynamic solvers |
| Time-expanded DAG routing | Handles time-varying road passability, node waiting |
| Polling fallback for subscribe | Works without WebSocket infrastructure |
| Offline-first with IndexedDB | Field reporting works without internet |

## Event-to-Decision Pipeline

1. **Volunteer reports** "water 0.5m over bridge deck" via field app
2. **Frontend validates** against Zod schemas, submits to backend
3. **Backend translates** wire format → internal envelope (ULID, HLC, integers, decimetres)
4. **Event appended** to JSONL log with content hash, version vector
5. **Projection fold** recomputes: flood extent, road passability, settlement cut-off, evacuation routes
6. **Frontend receives** updated projections via SSE or polling
7. **Command centre** displays updated situation with audit trail

## Key Design Constraints

- **No hydrodynamic solver**: Uses HAND (Height Above Nearest Drainage) instead
- **No live CWC API**: All data is pre-downloaded and bundled
- **No ML/LLM**: All computations are deterministic and deterministic
- **No satellite ingestion**: Uses Copernicus GLO-30 DEM and OSM data
- **No traffic modelling**: Simple time-expanded DAG routing
- **Flood-only, one district**: Majuli, Assam only

## Key Files

| File | Purpose |
|------|---------|
| `packages/server/src/server.ts` | HTTP server with all 6 endpoints |
| `packages/server/src/translation.ts` | Wire format ↔ internal envelope translation |
| `packages/server/src/projection.ts` | Deterministic projection fold |
| `packages/server/src/geo-artifacts.ts` | Loads Majuli geographic artifacts |
| `packages/core/src/event/envelope.ts` | Envelope type, HLC, content hash |
| `packages/core/src/project/flood.ts` | HAND inundation projection |
| `packages/core/src/project/network.ts` | Road passability projection |
| `packages/core/src/route/dag.ts` | Time-expanded DAG routing |
| `packages/core/src/route/latest-departure.ts` | Reverse sweep latest-safe-departure |
| `frontend/packages/api-client/src/http.ts` | HTTP client implementation |
| `frontend/packages/contract/src/events.ts` | Wire format Zod schemas |
| `frontend/packages/contract/src/projections.ts` | Projection Zod schemas |
