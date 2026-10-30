# SETU — Presentation Guide

This document provides everything needed to present SETU confidently, from a 30-second elevator pitch to a full 5-minute technical demonstration.

---

## 30-Second Explanation

"SETU is an offline-capable disaster response system for Majuli, Assam. When a volunteer reports 'water is 1.1 meters over the bridge deck,' SETU automatically computes which roads are flooded, which villages are cut off, and which evacuation routes are still safe — all without typing anything in. The volunteer reports what they see; SETU computes what it means."

**Key points:**
- Volunteer reports → system computes (not types in)
- Flood-only, one district (Majuli, Assam)
- Offline-first: works without internet
- No hydrodynamic solver — uses HAND (Height Above Nearest Drainage)

---

## 2-Minute Explanation

SETU takes a volunteer's field observation and turns it into actionable intelligence:

1. **Volunteer reports**: "Water is 0.5m over the bridge deck on SH21 near Auniati"
2. **System computes**: Which roads are blocked, which settlements are cut off, which evacuation routes are still safe
3. **Command centre sees**: Updated flood map, blocked roads, cut-off settlements, available evacuation routes
4. **Offline-first**: Works without internet — events persist locally and sync when connectivity returns

**Key architectural decisions:**
- Flood-only, one district (Majuli, Assam) — keeps scope manageable
- HAND (Height Above Nearest Drainage) — fast flood projection without hydrodynamic solver
- Offline-first — IndexedDB storage, service worker, JSONL export/import
- Synthetic demonstration geography — clearly labeled, not confused with real data

---

## 5-Minute Technical Explanation

### Architecture

SETU has three layers:

**Backend (TypeScript)**: HTTP server with 6 endpoints, append-only JSONL event log, deterministic projection fold.

**Core Library (TypeScript)**: Event envelope (ULID, HLC, canonical JSON), sync protocol (version vectors), projections (flood, network, people), routing (time-expanded DAG).

**Frontend (TypeScript)**: Field app and command centre with PWA support, IndexedDB persistence, HTTP API client.

### Event Flow

1. Volunteer submits flood report via field app
2. Frontend validates against Zod schemas
3. Backend translates wire format (UUID, ISO strings, floats) to internal envelope (ULID, HLC epoch ms, integers, decimetres)
4. Event appended to JSONL log with SHA-256 content hash
5. Projection fold recomputes flood, roads, settlements, routes
6. SSE notifies frontend of version bump
7. Frontend re-renders command centre

### Routing Algorithm

Time-expanded DAG:
- Each road node replicated for each time slot
- Wait arcs (zero-cost) allow waiting at nodes
- Travel arcs have travel time cost
- Reverse sweep computes latest safe departure from each node

### GIS Data

- Copernicus GLO-30 DEM (30m resolution)
- HAND computation via pyflwdir (EXPERIMENTAL — not used for flood extent)
- OSM roads, settlements, shelters
- Offline bundle ~60 MB

---

## Demo Script (5 Minutes)

### Setup

1. Open command centre at `http://localhost:8080` (or public tunnel URL)
2. Show initial state: all roads accessible, all settlements accessible, evacuation routes active
3. Explain: "This is Majuli, Assam. We're looking at the current situation before any flood reports."

### Step 1: Volunteer Reports Flood

Open field app. Submit flood report:
- Type: flood_report
- Location: bridge deck on SH21 near Auniati
- Depth: 0.5m over deck
- Severity: 3

Submit the event.

### Step 2: Watch Projections Update

Watch command centre:
- Bridge road SH21 changes to "blocked"
- Settlement Auniati changes to "cut_off"
- Evacuation route changes to "unavailable" with reason
- Flood polygon appears around bridge area

**Say**: "One volunteer report triggered automatic inundation projection, road closure, settlement cut-off detection, and route recalculation — all computed, not typed in."

### Step 3: Show Audit Trail

Open event list:
- Show the flood report event with clientEventId, timestamp, server state
- Show that event version bumped projections

### Step 4: Show Idempotency

Resubmit the same event:
- Shows "duplicate" with same eventId
- Projections unchanged

**Say**: "Duplicate reports are handled gracefully — no double-counting."

### Step 5: Show Offline Capability

Explain (don't demonstrate unless network is actually down):
- Events persist locally in IndexedDB
- Sync happens automatically when connectivity returns
- Cached projections available offline
- Stale data warnings shown when sync is overdue

---

## What to Emphasize

✅ **DO emphasize:**
- Computed, not typed in — volunteer reports observation, system computes impact
- Offline-first — works without internet
- Synthetic data clearly labeled — not confused with real data
- Deterministic fold — same inputs always produce same output
- Audit trail — every event traceable to source
- Flood-only, one district — focused scope

❌ **DO NOT claim:**
- Real-time government data (we don't have live CWC API)
- Hydrodynamic solver (we use HAND, which is experimental)
- ML/LLM (we don't use either)
- General all-hazard platform (we're flood-only, one district)
- Real Majuli road connectivity (the real graph is fragmented — we use synthetic subgraph for demo)
- Full peer-to-peer networking (we have JSONL export/import, not P2P)

---

## Common Questions & Answers

**Q: Why Majuli, Assam?**
A: River island — "cut off" is literal. Verified DEM data available. Small enough to compute on laptop.

**Q: Why not use hydrodynamic solver?**
A: Too slow, needs data we don't have. HAND (Height Above Nearest Drainage) is faster and works with available data — but it's experimental, not validated.

**Q: Why synthetic data?**
A: Real Majuli road graph is fragmented (43 connected components). Synthetic subgraph demonstrates the concept without misleading about real connectivity.

**Q: How does offline work?**
- Events stored in IndexedDB
- Sync when connectivity returns
- Duplicate detection prevents double-counting
- Cached projections available offline

**Q: What if two volunteers report different things?**
- Conflicting reports preserved with "disputed" flag
- Never silently overwritten
- Human review needed

**Q: How accurate is the flood projection?**
- HAND is experimental relative terrain — not validated for flood prediction
- Observations are local depth over reference point, not calibrated gauge stages
- System computes inundation from observations, not predicts flooding

---

## Questions I Should Be Able to Answer Without Looking at Code

1. **What does SETU do?** Flood response coordination for Majuli, Assam — volunteer reports become flood projections and evacuation decisions.

2. **How does it work offline?** Events stored in IndexedDB, sync when connectivity returns, cached projections available offline.

3. **How is flood computed?** HAND (Height Above Nearest Drainage) from DEM + volunteer observations. Experimental — not validated.

4. **How is routing done?** Time-expanded DAG with node waiting, reverse sweep latest-safe-departure.

5. **What data is real vs synthetic?** Real: OSM roads, settlements, shelters, Copernicus DEM. Synthetic: demo scenario, demonstration geography.

6. **How are duplicates handled?** clientEventId UUID — same ID = same event, deduplicated.

7. **How are conflicts handled?** road_blockage on cleared road = conflict. Other conflicts resolved by valid-time observation ranking.

8. **How is sync done?** Version vectors, hole healing, duplicate detection, JSONL export/import.

9. **What's the scope?** Flood-only, one district (Majuli, Assam). No hydrodynamic solver, no live API, no ML/LLM.

10. **Who owns what?** OpenCode = backend/core/integration. Darsh = frontend. Karthik = GIS/data.

---

## Live Code Walkthrough Points

If asked to show code:
- `packages/server/src/server.ts` — 6 endpoints
- `packages/server/src/translation.ts` — Wire → internal envelope translation
- `packages/server/src/projection.ts` — Deterministic projection fold
- `packages/core/src/project/flood.ts` — HAND inundation
- `packages/core/src/route/dag.ts` — Time-expanded DAG routing
- `frontend/packages/api-client/src/http.ts` — HTTP client implementation
- `frontend/packages/contract/src/events.ts` — Wire format schemas
- `frontend/packages/contract/src/projections.ts` — Projection schemas

## What NOT to Say

- "This uses real Majuli road data for routing" — Real graph is fragmented (43 components)
- "This uses live government data" — All data is pre-downloaded
- "This uses ML/AI" — All deterministic, no ML
- "This is a general all-hazards platform" — Flood-only, one district
- "This is peer-to-peer" — JSONL export/import is not P2P networking
- "HAND predicts flooding" — HAND is experimental relative terrain, not flood prediction
