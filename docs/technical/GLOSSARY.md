# SETU — Glossary

## Core Concepts

### ADR (Architecture Decision Record)
A document that records an architectural decision, its rationale, alternatives considered, and trade-offs. SETU has 15 ADRs (D-01 to D-15) covering decisions from district selection to batch limits.

### Envelope
The internal data structure used by SETU's core fold. Contains id (ULID), origin, seq, hlc, vv, type, actor, subject, at, payload, hash, sig. Never sees floats or ISO strings — all integers.

### Envelope Input
The input to envelope creation. Same as Envelope but without id, hash, sig, v (filled in during creation).

### FieldEvent
The wire format event submitted by the frontend. Contains clientEventId (UUID), occurredAt (ISO datetime), reporterId, deviceId, location (floats), and event-specific fields (depthCm, roadId, etc.).

### FieldEvent Schema
Zod schema validating wire-format events. Discriminated union of flood_report, road_blockage, road_cleared, water_level, household_registration.

### HAND (Height Above Nearest Drainage)
Height of each DEM cell above the nearest drainage cell. Computed via pyflwdir D8 flow direction + flow accumulation. EXPERIMENTAL — not validated for flood prediction.

### HLC (Hybrid Logical Clock)
Timestamp mechanism combining physical time with logical counter. Provides causal ordering without synchronized clocks. Each event carries hlc.l (physical time) and hlc.c (logical counter).

### JSONL (JSON Lines)
Append-only file format where each line is a valid JSON object. SETU uses JSONL for the event log — append-only, deterministic, crash-resistant.

### JSONL Export/Import
Decentralized event exchange format. Each line is a wire-format FieldEvent. Devices can export their events, transfer physically to another device, import, validate, deduplicate, merge, recompute projections, and sync with central server later.

### Projection
Deterministic computation of flood, roads, settlements, routes, shelters from the event log. Same inputs always produce same output.

### Projection Snapshot
GeoJSON FeatureCollection containing flood, roads, settlements, routes, shelters. Versioned — each accepted event bumps the version.

### ULID (Universally Unique Lexicographically Sortable Identifier)
Identifier format: 48-bit timestamp + 80-bit randomness. Sortable by creation time. Used for event IDs — never trusted for ordering (HLC handles ordering).

### Wire Format
The format used for communication between frontend and backend. Uses UUIDs, ISO datetime strings, floats. Translated to internal envelope at API boundary.

## GIS Terms

### DEM (Digital Elevation Model)
Raster grid of elevation values. SETU uses Copernicus GLO-30 DEM (30m resolution, EPSG:4326).

### D8 Flow Direction
Flow direction algorithm where each cell drains to one of 8 neighbors. Used by pyflwdir to compute flow direction.

### Flow Accumulation
Count of upstream cells draining through each cell. Used to identify stream channels (cells with high accumulation).

### HAND (Height Above Nearest Drainage)
See above.

### Stream Channel
Cell where flow accumulation exceeds threshold (5,556 cells ≈ 5 km²). Identified as drainage for HAND computation.

### Stream Reach
Connected segment of stream channel. Labeled with reach ID.

### DSM (Digital Surface Model)
Elevation model including vegetation and buildings. Copernicus GLO-30 is a DSM.

### DTM (Digital Terrain Model)
Elevation model of bare earth (no vegetation/buildings). Copernicus GLO-30 is DSM, not DTM — this affects HAND accuracy.

## Routing Terms

### DAG (Directed Acyclic Graph)
Graph with directed edges and no cycles. SETU uses time-expanded DAG for routing — each node replicated for each time slot.

### Time-Expanded DAG
DAG where each node is replicated for each time slot. Wait arcs (zero-cost) allow waiting. Travel arcs have travel time cost. Enables time-varying passability.

### Route Expansion
Process of creating time-expanded graph from road network + passability. Each road edge becomes travel arcs for each time slot.

### Reverse Sweep
Algorithm computing latest safe departure from each node to reach destination by deadline. Processes arcs in reverse time slot order.

### Node Waiting
Ability to wait at a node (zero-cost self-loop) until conditions improve. Enables waiting for road to clear before proceeding.

### Passability
Whether a road edge can be traversed. Based on flood observations, road observations, valid-time observations.

## Communication Terms

### Wire Format
Format used for frontend↔backend communication. Uses UUIDs, ISO datetime strings, floats. Translated to internal envelope at API boundary.

### Internal Envelope
Internal format used by core fold. Uses ULIDs, HLC epoch ms, integers (microdegrees, decimetres). No floats.

### Translation Layer
Code at API boundary translating wire format ↔ internal envelope. Converts UUID→ULID (stored separately), ISO→epoch ms, floats→integers.

### SSE (Server-Sent Events)
HTTP streaming protocol for real-time updates. Server sends version bumps to clients. Frontend uses polling fallback when SSE unavailable.

### Version Vector
Map of origin→highest seq. Used for sync: client sends its version vector, server responds with missing events.

### Hole Healing
Backfilling missing events when they arrive out of order. Version vectors track which seq per origin received.

### Duplicate Delivery
Same event delivered multiple times. Deduplicated by clientEventId.

### Collision Detection
Same origin+seq already exists → conflict. Prevents duplicate processing.

## Team Terms

### OpenCode
Backend orchestrator agent. Responsible for core, server, integration, event semantics, sync logic, architecture coordination.

### Darsh's Claude
Frontend agent. Responsible for React/Vite frontend, PWA, IndexedDB, offline UI, map rendering, field/command centre experience.

### Karthik's Claude
Data/QA agent. Responsible for GIS processing, geographic datasets, map artifacts, scenario fixtures, data provenance, QA.

### OQ (Open Question)
Unresolved item requiring agreement between agents. Format: OQ-NN — title — owner — status — notes.

### D (Decision)
Resolved decision. Format: D-NN — title — date — owner — decision — rationale — status.
