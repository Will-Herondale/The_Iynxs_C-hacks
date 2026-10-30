# SETU — Technical Q&A

This document contains 40 technical questions and answers about SETU, designed for the project lead and technical reviewers.

## Architecture & Design

### Q1: What is SETU's architecture?

**A**: TypeScript end-to-end architecture with three layers:
- **Core** (`packages/core/`): Event envelope, HLC, canonical JSON, sync protocol, projections (flood, network, people), routing (DAG, latest-departure, cutoff)
- **Server** (`packages/server/`): HTTP server with 6 endpoints, JSONL event log, wire→internal translation, projection fold
- **Frontend** (`frontend/`): React 19 apps (field, command centre), contract schemas, HTTP API client, mock backend

### Q2: Why TypeScript end-to-end?

**A**: Single type system across frontend, backend, and core logic. Browser cannot run Python. Type safety catches contract mismatches at compile time. Shared types between frontend and backend prevent integration errors.

### Q3: Why append-only JSONL event log?

**A**: Immutable audit trail, simple crash recovery, easy sync, deterministic fold. Every event is stored once and never modified. Projections are computed deterministically from the log.

### Q4: What is the event envelope format?

**A**: Internal envelope contains: id (ULID), origin, seq, hlc (Hybrid Logical Clock), vv (version vector), type, actor, subject, at (epoch ms), payload, hash (SHA-256), sig (ed25519). Wire format uses UUID, ISO strings, floats — translated at API boundary.

### Q5: Why no hydrodynamic solver?

**A**: Hydrodynamic solvers are too slow and require data we don't have. HAND (Height Above Nearest Drainage) is faster and works with available DEM data. HAND is experimental — not validated for flood prediction.

---

## Event System

### Q6: What is ULID and why use it?

**A**: ULID v1 is a time-ordered UUID alternative. First 48 bits are timestamp (millisecond precision), remaining 80 bits are randomness. ULIDs are sortable by creation time, which helps with event ordering and debugging.

### Q7: What is Hybrid Logical Clock (HLC)?

**A**: HLC combines physical time with logical counter to provide causal ordering without synchronized clocks. Each event carries hlc.l (physical time) and hlc.c (logical counter). When receiving an event, HLC is updated: hlc.l = max(local_time, received.hlc.l), hlc.c = max(hlc.c, received.hlc.c) + 1.

### Q8: What is a version vector?

**A**: Version vector tracks the highest sequence number per origin. Used for sync: client sends its version vector, server responds with events the client hasn't seen. Enables hole healing and duplicate detection.

### Q9: How does duplicate detection work?

**A**: Each event has clientEventId (UUID v4) as idempotency key. Server checks if clientEventId already known. Same clientEventId → duplicate, returns existing eventId without re-processing.

### Q10: What is content hash?

**A**: SHA-256 hash of canonical JSON of envelope fields (excluding hash and sig). Used for integrity verification — any tampering changes the hash.

---

## Sync Protocol

### Q11: How does sync work?

**A**: Client sends its version vector to server. Server responds with events client hasn't seen (origin.seq > client.vv[origin]). Client merges events into local log, recomputes projections.

### Q12: What is hole healing?

**A**: When events arrive out of order, missing events (holes) can be backfilled when they arrive. Version vectors track which seq per origin has been received.

### Q13: What is collision detection?

**A**: Same origin+seq already exists → conflict. Prevents duplicate processing of same event from same origin.

### Q14: What is the max event size?

**A**: 64KB max event size, 500 max events per batch. Prevents denial of service.

### Q15: How does offline-first work?

**A**: Events stored in IndexedDB before any network attempt. Sync attempted when online, deferred when offline. Cached projections available offline. Stale data warnings when sync overdue (>5 min).

---

## GIS & Routing

### Q16: What is HAND?

**A**: Height Above Nearest Drainage. For each DEM cell: elevation minus elevation of nearest downstream drainage cell. Computed via pyflwdir D8 flow direction + flow accumulation.

### Q17: Is HAND validated?

**A**: NO. HAND is EXPERIMENTAL. Copernicus GLO-30 is DSM (includes vegetation/buildings). 95% of Majuli island at HAND=0. Not used for flood extent, passability, or evacuation safety.

### Q18: How does routing work?

**A**: Time-expanded DAG. Each road node replicated per time slot. Wait arcs (zero-cost) allow waiting. Travel arcs have travel time cost. Reverse sweep computes latest safe departure. Blocked edges excluded from graph.

### Q19: Why is real road graph fragmented?

**A**: OSM data has 43 connected components. Largest has 31,060 nodes. Many roads don't connect. Settlements may not reach shelters via real road graph.

### Q20: Why synthetic subgraph?

**Real road graph is fragmented — no settlement-to-shelter path in many cases. Synthetic subgraph demonstrates routing concept clearly, labeled synthetic.**

### Q21: What is the synthetic scenario?

SYN-DEMO-001: Syn-settlement-1 (94.5°E, 26.8°N), syn-bridge-1 (94.5005°E, 26.8005°N), syn-shelter-1 (94.501°E, 26.801°N). Clearly labeled synthetic — never confused with real data.

### Q22: Why no live CWC API?

**A**: 48-hour hackathon constraint. No live government API dependency. All data pre-downloaded and bundled.

---

## Frontend

### Q23: What does frontend do?

**A**: Field app (volunteer reporting) and command centre (situational awareness). React 19, PWA, IndexedDB persistence, HTTP API client, mock backend for development.

### Q24: How does frontend validate events?

**A**: Zod schemas in @setu/contract. Validates before sending to backend. Invalid events rejected client-side.

### Q25: How does frontend handle sync?

**A**: HTTP API client with polling fallback for subscribe. SSE when available, polling fallback. Cached projections available offline.

---

## Security & Privacy

### Q26: Is data authenticated?

**A**: Partially. reporterId/deviceId are self-reported strings. No auth/roster in v1. Per-device Ed25519 keypair planned but deferred.

### Q27: Is personal data protected?

**A**: reporterId/deviceId are strings, not real identities. No photo storage. Household registration separate from person registry. No display of sensitive personal info on public map.

### Q28: Is data integrity verified?

**A**: SHA-256 content hash on each envelope. Any tampering changes hash. Invalid hashes rejected.

---

## Limitations & Known Issues

### Q29: What are the main limitations?

**A**:
- Flood-only, one district (Majuli, Assam)
- Real road graph fragmented (43 components)
- HAND experimental, not validated
- No live government data
- No ML/LLM
- No photo storage
- No auth/roster (self-reported IDs)
- Synthetic demonstration geography

### Q30: What is NOT implemented?

**A**:
- Hydrodynamic solver
- Live CWC API
- ML/LLM chatbot
- Satellite ingestion
- Traffic/congestion modelling
- Photo storage
- Truck-specific thresholds
- Occupancy forecasting
- Peer-to-peer networking
- Auth/roster enforcement

---

## Development & Testing

### Q31: How to run backend?

**Answer**:
```bash
cd packages/server
npm install
npx tsx src/run.ts
# Server starts on port 8080
```

### Q32: How to run frontend?

**Answer**:
```bash
cd frontend
npm install
npm run dev
# Field app and command centre
```

### Q33: How to run tests?

**Answer**:
```bash
# Core tests
cd packages/core && npx vitest run

# Server tests
cd packages/server && npx vitest run

# Frontend tests
cd frontend && npm test
```

### Q34: What test coverage exists?

**Answer**:
- Core: 70 tests (event, sync, projections, routing)
- Server: 13 tests (all 6 endpoints)
- Frontend: 54 tests (contract, api-client, mock-backend, ui)

### Q35: How is code quality ensured?

**Answer**:
- TypeScript strict mode
- ESLint
- Vitest unit tests
- Zod schema validation at API boundary
- Deterministic fold (same inputs = same output)

---

## Presentation Talking Points

### Q36: What is SETU's elevator pitch?

**A**: "SETU turns a volunteer's field observation — 'water is 0.5m over the bridge deck' — into actionable intelligence: flooded roads, blocked routes, cut-off villages, and evacuation deadlines — computed, not typed in."

### Q37: Why Majuli, Assam?

**A**: River island — "cut off" is literal. Verified DEM data available. Small enough to compute on laptop. Weighted audit score 2.90 (highest among candidates).

### Q38: Why no hydrodynamic solver?

**A**: Too slow, needs data we don't have. HAND is faster and works with available DEM data. HAND is experimental — clearly labeled.

### Q39: Why synthetic geography?

**A**: Real Majuli road graph is fragmented (43 connected components). Synthetic subgraph demonstrates routing concept clearly, clearly labeled synthetic.

### Q40: What's next after hackathon?

**A**: Real Majuli road graph integration, live CWC API, auth/roster, photo storage, additional hazard types, peer-to-peer event exchange.
