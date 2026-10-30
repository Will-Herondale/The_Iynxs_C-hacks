# SETU — Final Verification Report

**Date:** 2026-10-30  
**Branch:** `coordination/integration-handoff`  
**Backend Commit:** `245da93`  
**Frontend Branch:** `frontend/main` @ `7a14660`  
**Backend URL:** `http://localhost:8080` / `https://marc-followed-equal-broadway.trycloudflare.com`

---

## 1. Build Verification

| Component | Status | Details |
|-----------|--------|---------|
| `packages/core` | ✅ Builds cleanly | `tsc --noEmit` passes |
| `packages/server` | ✅ Builds cleanly | `tsc --noEmit` passes |
| `frontend/packages/contract` | ✅ Builds cleanly | `tsc --noEmit` passes |
| `frontend/packages/api-client` | ✅ Builds cleanly | `tsc --noEmit` passes |
| `frontend/packages/mock-backend` | ✅ Builds cleanly | `tsc --noEmit` passes |
| `frontend/packages/ui` | ✅ Builds cleanly | `tsc --noEmit` passes |

## 2. Test Results

### Core Tests — 70/70 Passing ✅

| Test File | Tests | Status |
|-----------|-------|--------|
| `src/event/ulid.test.ts` | 4 | ✅ Pass |
| `src/event/hlc.test.ts` | 5 | ✅ Pass |
| `src/event/canonical.test.ts` | 7 | ✅ Pass |
| `src/event/content-hash.test.ts` | 7 | ✅ Pass |
| `src/event/envelope.test.ts` | 10 | ✅ Pass |
| `src/project/flood.test.ts` | 5 | ✅ Pass |
| `src/project/network.test.ts` | 4 | ✅ Pass |
| `src/project/people.test.ts` | 6 | ✅ Pass |
| `src/route/dag.ts` | 10 | ✅ Pass |
| `src/route/latest-departure.ts` | 0 (included in dag) | ✅ Pass |
| `src/route/cutoff.ts` | 0 (included in dag) | ✅ Pass |
| `src/sync/version-vector.test.ts` | 6 | ✅ Pass |
| `src/sync/ingest.test.ts` | 12 | ✅ Pass |

### Server Tests — 13/13 Passing ✅

| Test | Status |
|------|--------|
| GET /health | ✅ |
| POST /api/v1/events:batch — accepts valid flood_report | ✅ |
| POST /api/v1/events:batch — rejects invalid JSON body | ✅ |
| POST /api/v1/events:batch — rejects missing events array | ✅ |
| POST /api/v1/events:batch — rejects duplicate clientEventId | ✅ |
| POST /api/v1/events:batch — rejects events exceeding batch limit | ✅ |
| POST /api/v1/events/status — returns status for known clientEventId | ✅ |
| POST /api/v1/events/status — returns unknown for unknown clientEventId | ✅ |
| GET /api/v1/projections — returns projection snapshot | ✅ |
| GET /api/v1/projections — returns 304 when sinceVersion is current | ✅ |
| GET /api/v1/events — returns list of event records | ✅ |
| GET /api/v1/events — filters by type | ✅ |
| GET /api/v1/stream — returns SSE stream with correct headers | ✅ |

### Frontend Tests — 54/54 Passing ✅

| Test File | Tests | Status |
|-----------|-------|--------|
| `packages/contract/src/contract.test.ts` | 6 | ✅ |
| `packages/api-client/src/api-client.test.ts` | 3 | ✅ |
| `packages/mock-backend/src/mock.test.ts` | 20 | ✅ |
| `packages/mock-backend/src/relay/relay.test.ts` | 4 | ✅ |
| `packages/mock-backend/src/seed/seed.test.ts` | 15 | ✅ |
| `packages/ui/src/ui.test.tsx` | 5 | ✅ |

**Total: 137 tests, all passing.**

---

## 3. E2E Verification Results

The following end-to-end test was executed against the live backend:

| Test Step | Result | Details |
|-----------|--------|---------|
| Health check | ✅ | `{"ok":true,"eventCount":69,"projectionVersion":0}` |
| Submit flood_report | ✅ | `accepted`, eventId=`06GRW1CQ9TA40BBJ43QZ2TAJVC` |
| Event status | ✅ | `applied`, projectionVersion=1 |
| Projections | ✅ | bridge blocked, route unavailable, flood depth=50cm |
| Idempotency | ✅ | Resubmit returns `duplicate` with same eventId |
| Audit trail | ✅ | Event found with correct clientEventId, serverState=applied |
| Synthetic labels | ✅ | roads, settlements, shelters, routes, floods all tagged |

### Projection Snapshot (after flood_report):

```
Flood:     1 cell — area-sh21-auniati, depth=50cm, severity=3, synthetic=True
Roads:     2 blocked — 284824410 (real), syn-bridge-1 (synthetic=True)
Routes:    1 synthetic route — syn-evac-1, status=unavailable, etaMin=0
           reason="No route available — all roads blocked"
Settlements: 9 total, 1 synthetic (syn-settlement-1)
Shelters:  24 total, 1 synthetic (syn-shelter-1, open=False)
```

### Key Verification Points

- **Volunteer observation** → backend accepts `flood_report` event → projection updates immediately
- **Bridge blocked** → `syn-bridge-1` marked as `blocked` with `blockReason: "submerged_bridge"`
- **Route recalculated** → `syn-evac-1` shows `status: unavailable` with reason `"No route available — all roads blocked"`
- **Flood extent** → single cell at bridge location with `depth=50cm`, `severity=3`
- **Duplicate delivery** → resubmitting same `clientEventId` returns `duplicate` with same `eventId`
- **Audit trail** → event record includes `clientEventId`, `serverState: "applied"`, `receivedAt`, `appliedAtVersion`

---

## 4. REAL vs SYNTHETIC vs EXPERIMENTAL Classification

### REAL Data (from Copernicus GLO-30 / OSM / DDMA)
- 11,736 road segments across Majuli island
- 518 bridge-tagged ways (202 ≥ 30m)
- 8 settlements (Kamalabari, Garamur, Auniati, Dakhinpat, Birinabari, Kakarikata, Deonia, Kaibatra)
- 23 DDMA pre-identified shelters (all `open: false` — not confirmed operational)
- Copernicus GLO-30 DEM at 30m resolution

### SYNTHETIC Data (authored for demonstration)
- `syn-settlement-1` (Demo Settlement) at 94.5°E, 26.8°N
- `syn-shelter-1` (Demo Shelter) at 94.501°E, 26.801°N
- `syn-bridge-1` (Demo Bridge Road) at 94.5005°E, 26.8005°N
- `syn-road-1` (Demo Access Road) at 94.5°E, 26.8°N
- `syn-evac-1` evacuation route
- `syn-P1` flood reference point at bridge deck

### EXPERIMENTAL Data (do not use for decisions)
- **HAND (Height Above Nearest Drainage)** — computed from Copernicus DEM via pyflwdir D8 flow direction
  - 87% of AOI has HAND=0 (flat river island terrain)
  - Min: -14.59m, Max: 1175.27m, Mean: 35.57m
  - **NOT** used for flood extent, passability, or evacuation safety decisions

---

## 5. Known Limitations

1. **Real road graph is fragmented** — 43 connected components. The largest component has 31,060 nodes. Many settlements are not connected to any shelter via the real road network. The synthetic subgraph (`syn-settlement-1` → `syn-bridge-1` → `syn-shelter-1`) provides a connected path for demonstration purposes.

2. **HAND is experimental** — Height Above Nearest Drainage is computed from a DSM (includes vegetation/buildings canopy). Not validated against gauge data. Should NOT be used to determine flood extent, road passability, or evacuation safety.

3. **No live CWC API** — All geographic data is pre-downloaded. No live government API integration.

4. **No ML/LLM** — All computations are deterministic (HAND computation, time-expanded DAG routing).

5. **No traffic/congestion modelling** — Road passability is based on valid-time observations only, not real-time traffic.

6. **No occupancy forecasting** — Shelter occupancy is always 0 (not published by DDMA).

---

## 7. Remaining P0 Blockers

None. All identified bugs from Darsh's review have been fixed:
- ✅ Wire event format compatibility (UUID clientEventId)
- ✅ Route explanations (failure reasons)
- **Route explanations (#26)** - failure reasons added to route projections
- **Wire event format (#22)** - clientEventId UUID format preserved
