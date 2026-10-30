# SETU — Important Files Walkthrough

This document walks through the most important source files in the SETU codebase. For each file, we explain what it does, why it exists, its main exports, and what would break if changed incorrectly.

## packages/core/src/event/envelope.ts

**Purpose**: Defines the internal event envelope — the canonical internal format used by the fold and sync protocol.

**Key Exports**:
- `Envelope` interface — The internal event format
- `EnvelopeInput` — Input type for creating envelopes
- `createEnvelope()` — Creates a new envelope with ULID, content hash
- `envelopeIsValid()` — Validates envelope integrity
- `envelopeEqual()` — Compares envelopes
- `happensBefore()` — Causal ordering based on version vectors
- `totalOrder()` — Total ordering for deterministic folding

**Why Important**: The envelope is the core data structure. Every event in the system is stored as an envelope. Changing this format breaks sync, fold, and all projections.

**Called By**: Server translation layer, sync ingest, projection fold

**Critical**: Do not change field names or types without updating translation layer and all projections.

## packages/core/src/event/hlc.ts

**Purpose**: Hybrid Logical Clock implementation for causal ordering without synchronized clocks.

**Key Exports**:
- `hlcNow()` — Create initial HLC
- `hlcUpdate()` — Update HLC on event receipt
- `hlcCompare()` — Compare two HLCs
- `hlcInitial()` — Initial HLC state
- `HLC`, `HLCState` types

**Called By**: Event creation, sync ingest, version vector operations

**Critical**: Changing HLC format breaks causality tracking and conflict detection.

## packages/core/src/event/content-hash.ts

**Purpose**: Canonical JSON serialization and SHA-256 content hashing.

**Key Exports**:
- `canonicalJson()` — Canonical JSON serialization (integers only, no floats)
- `validateNoFloats()` — Validate no floats in object
- `contentHash()` — SHA-256 hash of canonical JSON

**Called By**: Envelope creation, sync integrity verification

**Critical**: Changing hash algorithm breaks sync integrity verification and content deduplication.

## packages/core/src/event/ulid.ts

**Purpose**: ULID v1 generation for event IDs.

**Key Exports**:
- `ulid()` — Generate ULID v1 ID
- `ulidTimestamp()` — Extract timestamp from ULID
- `ulidIsValid()` — Validate ULID format

**Called By**: Envelope creation, event ID generation

**Critical**: Changing ID format breaks sync identity and idempotency detection.

## packages/core/src/sync/version-vector.ts

**Purpose**: Version vector operations for causality tracking and sync.

**Key Exports**:
- `vvEmpty()`, `vvGet()`, `vvSet()`, `vvMerge()`, `vvEqual()`, `vvClone()`, `vvToSortedEntries()`
- `VersionVector` type

**Called By**: Sync ingest, hole healing, collision detection

**Critical**: Changing version vector format breaks sync compatibility between devices.

## packages/core/src/sync/ingest.ts

**Purpose**: Sync ingest with duplicate delivery, hole healing, collision detection.

**Key Exports**:
- `ingest()` — Process incoming sync request
- 64KB max event size limit

**Called By**: Server sync endpoint (not yet implemented)

**Critical**: Changing ingest logic breaks sync compatibility and duplicate detection.

## packages/core/src/project/network.ts

**Purpose**: Road state projection — converts road observations into passability states.

**Key Exports**:
- `projectNetwork()` — Project road passability from events
- `selectRoadState()` — Select winning observation for edge at time t
- `RoadState`, `EdgePassability` types

**Called By**: Projection fold, routing engine

**Critical**: Changing road state logic changes which roads are considered blocked/open.

## packages/core/src/project/flood.ts

**Purpose**: HAND inundation projection — computes flood cells from water observations.

**Key Exports**:
- `projectFlood()` — Project flood cells from water observations
- `projectFlood()` parameters: cells, observations, reference point, asOf time, cellSize
- `computeHydraulicDepth()` — Compute hydraulic depth from observation
- `FloodPoint`, `WaterObservation`, `InundationCell`, `FloodProjection` types

**Called By**: Projection fold

**Critical**: Changing flood projection changes inundation area calculations.

**Important**: HAND is EXPERIMENTAL — not validated for flood extent decisions.

## packages/core/src/route/dag.ts

**Purpose**: Time-expanded DAG routing with node waiting.

**Key Exports**:
- `buildExpandedGraph()` — Build time-expanded DAG from road edges and passability
- `earliestArrivalFrom()` — Compute earliest arrival from source
- `findFastestPath()` — Find fastest path from source to destination
- `RouteEdge`, `Passability`, `ExpandedNode`, `ExpandedArc`, `RouteResult` types

**Called By**: Routing engine, latest-departure, cutoff

**Critical**: Changing graph construction changes route results.

## packages/core/src/route/latest-departure.ts

**Purpose**: Reverse sweep latest-safe-departure computation.

**Key Exports**:
- `latestSafeDeparture()` — Compute latest departure from each node to reach destination by deadline
- `LatestDepartureResult` type

**Called By**: Routing engine, evacuation planning

**Critical**: Changing departure computation changes evacuation timing recommendations.

## packages/core/src/route/cutoff.ts

**Purpose**: Settlement reachability and cut-off detection.

**Key Exports**:
- `projectReachability()` — Project settlement reachability to shelters
- `SettlementReachability`, `CutoffResult` types

**Called By**: Projection fold, evacuation planning

**Critical**: Changing reachability changes which settlements are marked cut-off.

## packages/server/src/server.ts

**Purpose**: HTTP server with all 6 endpoints.

**Key Exports**:
- `startServer()` — Start HTTP server
- `stopServer()` — Stop HTTP server
- `PORT` — Default port 8080

**Endpoints**:
- `POST /api/v1/events:batch` — Submit field events
- `POST /api/v1/events/status` — Get event sync status
- `GET /api/v1/projections` — Get projection snapshot
- `GET /api/v1/events` — List event records
- `GET /api/v1/stream` — SSE version bumps
- `GET /api/v1/health` — Health check

**Called By**: Frontend API client

**Critical**: Changing endpoints breaks frontend integration.

## packages/server/src/translation.ts

**Purpose**: Wire format ↔ internal envelope translation.

**Key Exports**:
- `translateEvent()` — Wire → internal envelope
- `translateEventToWire()` — Internal envelope → wire format
- `toEpochMs()` — ISO datetime → epoch ms
- `locationToMicrodegrees()` — Float degrees → microdegrees integers

**Called By**: Server request handlers

**Critical**: Changing translation breaks wire format compatibility.

## packages/server/src/projection.ts

**Purpose**: Deterministic projection fold — combines flood, network, people, and route projections.

**Key Exports**:
- `projectSnapshot()` — Main fold function
- `GeoArtifacts` interface — Geographic artifacts interface
- `projectSnapshot()` parameters: events, artifacts, asOf, version

**Called By**: Server projections endpoint

**Critical**: Changing projection fold changes all computed outputs (flood, roads, settlements, routes).

## packages/server/src/event-log.ts

**Purpose**: Append-only JSONL event log with in-memory indices.

**Key Exports**:
- `EventLog` class — Append-only event log
- `append()` — Append event to log
- `getAllEvents()` — Get all events
- `getEventByOriginSeq()` — Get event by origin+seq
- `getVersionVector()` — Get version vector
- `count` — Event count

**Called By**: Server request handlers

**Critical**: Changing event log format breaks persistence and sync.

## packages/server/src/contract-types.ts

**Purpose**: Contract type definitions shared between server and frontend.

**Key Exports**:
- `FieldEvent`, `FieldEventType` — Wire format event types
- `FieldEventType` — Union of event types
- `SubmitAck`, `SubmitAckAccepted`, etc. — Submission acknowledgments
- `EventStatus`, `EventStatusState` — Event sync status
- `EventRecord` — Event record with server metadata
- `ProjectionSnapshot`, `FloodExtent`, `RoadStatus`, `Settlement`, `Route`, `Shelter` — Projection types
- `GeoArtifacts` — Geographic artifacts interface

**Called By**: Server translation, server server.ts, frontend api-client

**Critical**: Changing contract types breaks frontend/backend compatibility.

## packages/server/src/geo-artifacts.ts

**Purpose**: Load Majuli geographic artifacts and build synthetic subgraph.

**Key Exports**:
- `loadGeoArtifacts()` — Load all geographic artifacts
- `GeoArtifacts` interface — Defined in projection.ts

**Called By**: Server startup

**Critical**: Changing artifact loading breaks geographic data availability.

## packages/server/src/synthetic-artifacts.ts

**Purpose**: Synthetic Majuli geo artifacts for G1 demo.

**Key Exports**:
- `SYNTHETIC_ARTIFACTS` — Synthetic roads, settlements, shelters, flood reference points, routes

**Called By**: Server startup (fallback when real artifacts unavailable)

**Critical**: Changing synthetic artifacts changes demo scenario.

## packages/core/src/index.ts

**Purpose**: Public exports for core module.

**Key Exports**: All core module exports (event, sync, project, route)

**Called By**: Server, frontend (indirectly via server)

**Critical**: Changing exports breaks imports.

## packages/server/src/index.ts

**Purpose**: Public exports for server package.

**Key Exports**: `startServer()`, `stopServer()`, `GeoArtifacts` type

**Called By**: Server entry point (`run.ts`)

**Critical**: Changing exports breaks server startup.

## frontend/packages/contract/src/

### events.ts
Wire format Zod schemas for field events.

### projections.ts
Zod schemas for projection types.

### index.ts
Public exports for contract package.

**Called By**: Frontend api-client, server translation (shared types)

**Critical**: Changing schemas breaks frontend validation and server translation.

## frontend/packages/api-client/src/http.ts

**Purpose**: HTTP API client implementation.

**Key Exports**:
- `createHttpApiClient()` — Create HTTP API client
- `DEFAULT_BASE_URL` — Default backend URL
- `HttpApiClientOptions` — Client options

**Called By**: Frontend applications (field app, command centre)

**Critical**: Changing API client breaks frontend-backend communication.

## frontend/packages/api-client/src/index.ts

**Purpose**: Public exports for api-client package.

**Key Exports**:
- `createApiClient()` — Factory function
- `ApiClient` type
- `ApiMode` type
- `CreateApiClientOptions` type

**Called By**: Frontend applications

**Critical**: Changing exports breaks frontend imports.

## frontend/packages/api-client/src/api-client.test.ts

**Purpose**: Tests for HTTP API client.

**Key Tests**:
- `http` mode returns working ApiClient
- `mock` mode returns injected adapter
- `resolveApiMode()` defaults to mock

**Called By**: Test suite

**Critical**: Changing tests changes test coverage.

## frontend/packages/mock-backend/src/

### `src/store.ts`
In-process event store for mock backend.

### `src/store.ts`
In-memory event store with sync semantics.

### `src/seed/`
Seed scenarios (Guwahati) for development.

### `src/relay/`
Dev relay on port 5199 for cross-tab communication.

**Called By**: Frontend development (without backend server)

**Critical**: Changing mock backend changes development experience.

## frontend/packages/ui/src/

### `src/components.tsx`
React 19 component kit.

### `src/components.css`
Component styling.

### `src/tokens.css`
Design tokens.

**Called By**: Frontend applications (field app, command centre)

**Critical**: Changing UI components changes frontend appearance.

## data/majuli/

### `dem/`
DEM files:
- `majuli_dem_clipped.tif` — Clipped DEM
- `majuli_dem_fixed.tif` — Fixed DEM (water bodies repaired)
- `majuli_dem_mosaic.tif` — Mosaicked DEM

### `hand/`
HAND artifacts:
- `hand.bin` — HAND grid (uint16, decimetres)
- `drain_elev.bin` — Drainage elevation (int16, decimetres)
- `recv.bin` — D8 receiver indices (int32)
- `reach_id.bin` — Stream reach IDs (uint16)

### `manifest.json`
DEM and HAND metadata.

**Called By**: Backend server startup (loadGeoArtifacts)

**Critical**: Changing DEM data changes flood projection results.

## geo/data/out/

### `demo/`
Demo artifacts:
- `road_graph.geojson` — Road network (1,673 features)
- `settlements.geojson` — 8 settlements
- `shelters.geojson` — 23 shelters
- `scenario_obs.json` — Observation scenario
- `road_status.json` — Road status
- `settlement_status.json` — Settlement status
- `shelter_status.json` — Shelter status
- `flood_extent.json` — Flood extent
- `route_status.json` — Route status

### `geojson/`
Raw GeoJSON layers:
- `roads.geojson` — 11,736 roads
- `bridges.geojson` — 518 bridges
- `embankments.geojson` — 13 embankments
- `settlements.geojson` — 8 settlements
- `shelters.geojson` — 23 shelters
- `waterways.geojson` — 191 waterways
- `waterbodies.geojson` — 120 waterbodies
- `ferries.geojson` — 2 ferries
- `majuli_boundary.geojson` — District boundary
- `places.geojson` — Places
- `amenities.geojson` — Amenities
- `buildings.geojson` — 182,097 buildings

### `offline/`
Offline bundle:
- `vector/` — Vector GeoJSON layers
- `raster/` — Raster GeoTIFFs
- `scenario/` — Scenario JSONs
- `manifest.json` — Bundle manifest (~60 MB core)

**Called By**: Backend server (loadGeoArtifacts), frontend (map rendering)

**Critical**: Changing geographic data changes map display and routing results.

## offline/

### `manifest.json`
PWA manifest for installable application.

### `sw.js`
Service worker for app shell caching.

### `idb-schema.js`
IndexedDB schema for offline persistence.

### `sync.js`
Offline sync module.

### `majuli_hand_bundle.json`
Bundled HAND data (~5 MB) for offline use.

**Called By**: Frontend PWA

**Critical**: Changing offline artifacts changes offline capability.
