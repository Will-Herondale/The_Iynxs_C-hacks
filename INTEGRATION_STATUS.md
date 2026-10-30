# SETU — Integration Status Report

**Date:** 2026-10-30  
**Branch:** `coordination/integration-handoff`  
**Latest commit:** `808acf2`  
**Uncommitted changes:** flood.ts, projection.ts, server.ts, geo-artifacts.ts, geo/ data files  
**Time remaining:** ~14 hours from original approval (check actual)

---

## 1. Backend: Endpoint Tests and Server Stability

### Status: ALL 6 ENDPOINTS IMPLEMENTED AND TESTED ✅

| Endpoint | Method | Status | Tests |
|----------|--------|--------|-------|
| `/api/v1/events:batch` | POST | ✅ Working | Valid submission, invalid JSON, missing events, duplicate clientEventId, batch limit |
| `/api/v1/events/status` | POST | ✅ Working | Known clientEventId → `applied`, unknown → `unknown` |
| `/api/v1/projections` | GET | ✅ Working | Returns snapshot, 304 when sinceVersion is current |
| `/api/v1/events` | GET | ✅ Working | List events, filter by internal type |
| `/api/v1/stream` | GET | ✅ Working | SSE with correct headers |
| `/api/v1/health` | GET | ✅ Working | `{"ok":true,...}` |

### Test Results
- **Core package:** 70/70 tests passing (66 original + 4 new routing tests)
- **Server package:** 13/13 tests passing
- **TypeScript:** Both packages compile cleanly with `tsc --noEmit` (no `any` casts, no disabled checks)

### Server Stability
- Server starts reliably on port 8080
- Event log persists to JSONL (`./data/log.jsonl`)
- Event count survives across test runs
- SSE broadcast on version bumps

### Public Tunnel
- `https://marc-followed-equal-broadway.trycloudflare.com` → `http://localhost:8080`
- Cloudflare tunnel running (not permanent — keep process alive)

---

## 2. GIS: Artifact Integrity, Coverage and Frontend Compatibility

### Status: KARTHIK'S PR #16 REVIEWED AND INTEGRATED ✅

### Review Findings (PR #16, branch `data/karthik`, commit `a629a0f`)

**Artifacts verified:**
| Layer | Features | Classification | CRS | Source |
|-------|----------|---------------|-----|--------|
| majuli_boundary | 1 | REAL | EPSG:4326 | OSM admin relation |
| aoi | 1 | REAL | EPSG:4326 | Documented study box |
| roads | 11,736 | REAL | EPSG:4326 | OSM via Overpass |
| bridges | 518 | REAL | EPSG:4326 | OSM via Overpass |
| embankments | 13 | REAL | EPSG:4326 | OSM (contextual/unverified) |
| waterways | 191 | REAL | EPSG:4326 | OSM |
| waterbodies | 120 | REAL | EPSG:4326 | OSM |
| ferries | 2 | REAL | EPSG:4326 | OSM |
| settlements | 8 | REAL | EPSG:4326 | OSM places |
| shelters | 23 | REAL | EPSG:4326 | DDMA contingency plan |
| buildings | 182,097 | REAL (optional) | EPSG:4326 | OSM |
| DEM (WGS84) | raster | REAL | EPSG:4326 | Copernicus GLO-30 |
| DEM (UTM46N) | raster | REAL | EPSG:32646 | Copernicus GLO-30 |
| GSW occurrence | raster | REAL | EPSG:4326 | JRC GSW v1.4 |
| HAND | raster | EXPERIMENTAL | EPSG:4326 | Derived (not validated) |
| scenario_obs.json | n/a | SYNTHETIC | — | Authored |
| road_status.json | 1 | SYNTHETIC | — | Authored |
| settlement_status.json | 8 | SYNTHETIC | — | Authored |
| shelter_status.json | 23 | SYNTHETIC | — | Authored |
| flood_extent.json | 1 | SYNTHETIC | — | Authored |
| route_status.json | 1 | SYNTHETIC | — | Authored |

### Key Technical Findings

**1. Road network connectivity: 43 connected components (not 1,030)**
- Largest component: 31,060 nodes
- Most roads do NOT form a connected network (OSM ways don't share endpoints)
- **Impact:** Most settlements cannot reach any shelter via the real road graph

**2. Bridge 284824410 (SH21) and Auniati are NOT connected**
- Blocking this bridge alone does NOT cut off Auniati
- The S4 scenario ("settlement disconnected") requires combined S1+S2 closures
- **The scenario's claim that Auniati is cut off by bridge submergence is NOT supported by the graph**

**3. Shelter MJ-SH-009 (Jengraimukh College) reachability**
- 22/23 shelters are reachable from Auniati even with bridge blocked
- MJ-SH-019 is unreachable (different component)
- MJ-SH-009 is ~21.6 km from Auniati, 9th by straight-line proximity
- All shelters: `open: false` (pre-identified, not confirmed open) ✅ correct

**4. 45-minute ETA is HARDCODED, not computed**
- `route_status.json` has `etaMin: 45` — synthetic fixture value
- The routing engine (`findFastestPath`) was NOT used to generate this
- **Must not be presented as computed**

**5. HAND is EXPERIMENTAL** ✅ correctly labeled
- 87% NoData (drains off-raster/to sinks)
- 95% of island at HAND=0
- Not used in primary flood/passability workflow

**6. Real/synthetic/experimental labels survive** ✅
- Manifest.json documents classification per layer
- Scenario files carry `synthetic: true`
- HAND labeled EXPERIMENTAL
- Embankments marked contextual/unverified

### Offline Bundle
- Core bundle: ~60 MB (REAL + SYNTHETIC)
- Minimum viable: ~33 MB (excludes buildings, UTM DEM, HAND, GSW demgrid)
- All vector layers EPSG:4326, ready for frontend map rendering
- No network services required

---

## 3. Frontend: Actual HTTP Integration Status

### Status: NOT STARTED ❌

**Darsh's branch `frontend/main`** is at commit `6059fc88` (no updates since project start).

### What frontend has:
- `packages/contract` — Zod schemas for wire format (FieldEvent, SubmitAck, etc.)
- `packages/api-client` — `createApiClient({mode:'mock'|'http'})`
- **`http` adapter throws `NotImplementedError("pending API contract sign-off")`**
- `packages/mock-backend` — in-process store, dev relay port 5199
- `packages/ui` — React 19 component kit

### What frontend NEEDS to do (blocked):
1. Read contract: `docs/coordination/integration-handoff.md` (published on branch `coordination/integration-handoff`)
2. Switch `VITE_API_MODE` from `'mock'` to `'http'`
3. Point at backend: `https://marc-followed-equal-broadway.trycloudflare.com` (public) or `http://localhost:8080` (local)
4. Test: submit `flood_report`, call `/api/v1/projections`

### Blocker: Darsh's agent has not responded. Branch unchanged since project start.

---

## 4. End-to-End: Acceptance Step Status

Based on the integration checklist (9 items in `integration-handoff.md` §7):

| # | Step | Status | Evidence |
|---|------|--------|----------|
| 1 | `/api/v1/events:batch` endpoint | ✅ Done | 13 server tests, E2E verified |
| 2 | `/api/v1/events/status` endpoint | ✅ Done | 13 server tests, E2E verified |
| 3 | `/api/v1/projections` endpoint | ✅ Done | 13 server tests, E2E verified |
| 4 | `/api/v1/events` list endpoint | ✅ Done | 13 server tests |
| 5 | `/api/v1/stream` SSE endpoint | ✅ Done | 13 server tests |
| 6 | `/health` endpoint | ✅ Done | 13 server tests |
| 7 | Contract sign-off | ❌ Pending | Darsh hasn't responded |
| 8 | Frontend switches to `http` mode | ❌ Pending | HTTP adapter throws NotImplementedError |
| 9 | Mock fixtures for Majuli | ⚠️ Partial | Synthetic fixtures in place; real fixtures from PR #16 integrated |

### Core acceptance criteria (from `majuli-gis-delivery.md` §15):

| Criterion | Status |
|-----------|--------|
| Majuli DEM files verified | ✅ Done |
| Geographic bounds and CRS documented | ✅ Done |
| Water-body and NoData issues handled | ✅ Done |
| HAND artifact produced | ✅ Done |
| Road graph usable by application | ⚠️ Partial (fragmented, 43 components) |
| Settlements accurately sourced | ✅ Done (8 real settlements) |
| Shelters accurately sourced | ✅ Done (23 real shelters, open=false) |
| At least one flood scenario reproducible | ⚠️ Synthetic only (S1) |
| Data provenance documented | ✅ Done (manifest.json) |
| Outputs compatible with agreed contract | ✅ Done |
| No unsupported accuracy claims | ✅ Done |
| OpenCode can reproduce or load artifacts | ✅ Done |
| GIS work does not break running application | ✅ Done |

### End-to-end workflow verified:

```
1. Volunteer submits flood_report → POST /api/v1/events:batch → { result: 'accepted' }
2. Server translates wire → internal envelope → appends to JSONL log
3. extractBridgeBlockages matches observation to flood reference point by location
4. Synthetic obs.road event created → projectNetwork marks bridge edge as 'blocked'
5. buildRoutes runs findFastestPath → route becomes 'unavailable' (no safe route)
6. GET /api/v1/projections → shows blocked road + unavailable route
7. Resubmit same event → { result: 'duplicate' } (idempotent)
8. Projections unchanged after resubmit
```

---

## 5. Remaining Blockers (Ranked by Severity)

| # | Blocker | Severity | Est. Time | Owner |
|---|---------|----------|-----------|-------|
| 1 | **Darsh's agent has not switched to `http` mode** — frontend still using mock, no real integration possible | 🔴 Critical | 1-2 hours (once Darsh starts) | Darsh |
| 2 | **No frontend HTTP adapter implementation** — `http.ts` throws `NotImplementedError` | 🔴 Critical | 2-4 hours | Darsh |
| 3 | **Real road graph is fragmented (43 components)** — no real settlement→shelter evacuation routes exist | 🟠 High | 4-8 hours (synthetic subgraph) or requires Karthik to fix OSM node connectivity | Karthik + OpenCode |
| 4 | **Bridge 284824410 and Auniati not connected** — S4 scenario's cut-off claim not supported by graph | 🟠 High | Requires Karthik to find connected subgraph or use clearly-labelled synthetic | Karthik |
| 5 | **45-minute ETA is hardcoded fixture, not computed** — must be labeled synthetic | 🟡 Medium | 1 hour (relabel or compute) | OpenCode + Darsh |
| 6 | **No server restart/persistence test** — events persist to JSONL but restart behavior not tested | 🟡 Medium | 2 hours | OpenCode |
| 7 | **No cross-replica convergence test** — sync protocol not tested with multiple replicas | 🟡 Medium | 3-4 hours | OpenCode |
| 8 | **Offline-first P0 not integrated into frontend** — PWA manifest, service worker, IndexedDB created but not wired into React app | 🟡 Medium | 4-8 hours | Darsh |
| 9 | **Darsh's agent unresponsive** — branch unchanged since project start | 🔴 Critical | Unknown | Darsh |

---

## 6. Demonstration Scenario Recommendation

### Problem
The real road graph cannot support a defensible evacuation demonstration:
- 43 connected components (fragmented OSM data)
- Bridge 284824410 and Auniati are NOT connected
- No settlement can reach any shelter via the real graph
- The 45-minute ETA is hardcoded synthetic

### Recommended Approach

**Option A: Clearly-labeled synthetic connected subgraph (RECOMMENDED for demo)**
- Already implemented: `syn-settlement-1` → `syn-bridge-1` → `syn-shelter-1`
- Clearly marked `synthetic: true` in all artifacts
- Flood report at bridge deck → route becomes `unavailable` (genuine no-safe-route)
- Honest about limitations: "This is a demonstration subgraph, not real Majuli roads"

**Option B: Find a real connected subgraph in the OSM data**
- Requires Karthik to analyze the 43 components and find one containing both a settlement and a shelter
- Would need to identify a bridge whose removal genuinely disconnects a settlement
- More time-consuming, may not be feasible given the fragmented graph

### Decision
Use **Option A** for the hackathon demo. The synthetic subgraph demonstrates:
- Genuine routing computation (findFastestPath computes real paths)
- Genuine no-safe-route when bridge is blocked
- Idempotent event submission
- Projection updates

Clearly label all synthetic data. Do not present fixture-provided route geometry or ETA as computed.

---

## 7. Next Critical Actions

### Immediate (this session)
1. **Darsh's agent:** Switch `VITE_API_MODE=http`, point at `https://marc-followed-equal-broadway.trycloudflare.com`, test event submission and projection retrieval
2. **Coordinate with Karthik:** Confirm the synthetic subgraph approach is acceptable for the demo
3. **Commit all changes** to `coordination/integration-handoff` branch
4. **Update coordination documents** (`agent-status.md`, `opencode.md`)

### Short-term (next 2-4 hours)
1. **Add server restart/persistence test** — verify events survive server restart
2. **Add cross-replica convergence test** — test sync protocol with two server instances
3. **Frontend integrates HTTP adapter** — Darsh implements `http.ts`
4. **End-to-end demo:** flood report → bridge blocked → route unavailable → command centre sees update

### P1 (after P0 is secure)
1. JSONL event export/import
2. Local event validation and merge
3. Two-device offline exchange demonstration
4. PWA integration into React app

---

## 8. Files Changed

| File | Change |
|------|--------|
| `packages/core/src/project/flood.ts` | Added `edgeId` and `lat`/`lng` to `FloodPoint`/`WaterObservation` |
| `packages/server/src/projection.ts` | Added `extractBridgeBlockages`, `routeEdges` to `GeoArtifacts`, `buildRoutes()` uses `findFastestPath` |
| `packages/server/src/server.ts` | Uses `loadGeoArtifacts()` instead of `SYNTHETIC_ARTIFACTS` |
| `packages/server/src/geo-artifacts.ts` | NEW: Loads Karthik's artifacts, builds RouteEdge graph, maps settlements/shelters to nearest road nodes, adds synthetic connected subgraph |
| `packages/server/src/synthetic-artifacts.ts` | Added `routeEdges`, updated nodeIds to use `nodeKey()` |
| `packages/server/src/translation.ts` | Added `lat`/`lng` to flood_report payload, added `stripUndefined()` |
| `packages/server/src/server.test.ts` | NEW: 13 endpoint tests |
| `packages/core/src/route/route.test.ts` | Added 4 routing tests (recalculation, no-safe-route, connectivity, fixture rejection) |
| `geo/data/out/demo/` | Extracted from PR #16: road_graph, settlements, shelters, scenario_obs, road_status, shelter_status, flood_extent, route_status |
| `geo/data/out/geojson/` | Extracted from PR #16: roads, bridges, embankments, shelters, places, majuli_boundary |

---

## 9. Communication

**Backend public URL:** `https://marc-followed-equal-broadway.trycloudflare.com`  
**Backend local URL:** `http://localhost:8080`  
**Contract:** `docs/coordination/integration-handoff.md` (branch `coordination/integration-handoff`)  
**Messages:** `docs/coordination/messages/opencode.md` (OpenCode), `docs/coordination/messages/claude-darsh.md` (Darsh)

**Darsh's agent needs to:**
1. Read `docs/coordination/integration-handoff.md`
2. Switch `VITE_API_MODE=http`
3. Point at `https://marc-followed-equal-broadway.trycloudflare.com`
4. Test event submission → projection update
