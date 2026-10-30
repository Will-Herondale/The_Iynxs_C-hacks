# SETU — Frontend Integration Handoff

Audience: backend orchestrator. Summarizes the frontend agent's current work (branch `frontend/main`) and what the backend must support.

## 1. Frontend state (as of commit 6059fc88)

Branch: `frontend/main` (merged `frontend/team-platform`). No commits on `main` beyond initial.

```
frontend/
  packages/
    contract/       @setu/contract   zod schemas + ApiClient interface + errors
    api-client/     @setu/api-client createApiClient({mode:'mock'|'http'})
    mock-backend/   @setu/mock-backend in-process test double + dev relay + Guwahati seed
    ui/             @setu/ui         React 19 component kit + CSS tokens
  apps/             field + command (not yet scaffolded)
  docs/
    API_CONTRACT.md   DRAFT wire contract for backend review
    TEST_IDS.md       data-testid contract for QA + dev ports
```

## 2. Contract the frontend already depends on

`frontend/packages/contract/src/` is authoritative:

- `events.ts` — `FieldEvent` discriminated union: `flood_report`, `road_blockage`, `road_cleared`, `water_level`, `household_registration`. Common fields: `clientEventId` (UUID v4), `occurredAt` (ISO datetime), `reporterId`, `deviceId`, `location` (lat/lng floats), `note?`, `photoRefs?`.
- `sync.ts` — `SubmitAck` (accepted/duplicate/conflict/rejected), `EventStatus`, `ClientSyncStatus` (queued/sending/accepted/synced/conflict/rejected/failed).
- `projections.ts` — `ProjectionSnapshot` with GeoJSON `FeatureCollection`s: flood (Polygon), roads (LineString), settlements (Point), routes (LineString), shelters (Point). Each has `version` + `generatedAt`.
- `api.ts` — `ApiClient` interface: `submitEvents`, `getEventStatus`, `getProjections`, `listEvents`, `subscribe`.
- `errors.ts` — `NetworkError`, `ServerError`, `TimeoutError`, `NotImplementedError` (all with `retryable` flag).

## 3. What the frontend expects from the backend (PROPOSED, needs sign-off)

From `frontend/docs/API_CONTRACT.md` §9:

| Endpoint | Method | Shape |
|---|---|---|
| `/api/v1/events:batch` | POST | `{ events: FieldEvent[] }` → `{ acks: SubmitAck[] }` |
| `/api/v1/events/status` | POST | `{ clientEventIds: string[] }` → `{ statuses: EventStatus[] }` |
| `/api/v1/projections` | GET | `?sinceVersion=<int>` → `ProjectionSnapshot` |
| `/api/v1/events` | GET | `?sinceVersion=&limit=&type=` → `{ events: EventRecord[] }` |
| `/api/v1/stream` | WS or SSE | `{ type: 'version', version: <int> }` on bump |

The `http` adapter in `frontend/packages/api-client/src/http.ts` throws `NotImplementedError("pending API contract sign-off")` — the frontend is blocked on backend sign-off before it can switch from mock to real backend.

## 4. Seed scenario the frontend already has

`frontend/packages/mock-backend/src/seed/data.ts` — Guwahati, Assam (~26.14N, 91.73E), hand-drawn geometries:
- Flood areas A1, A2 (depthCm 60/35, severity 3/2)
- Roads R1–R10 (Bharalu Embankment Road, Beltola-Basistha Road, etc.)
- Settlements S1–S6 (Bharalumukh, Beltola, Kahilipara, Garchuk, etc.)
- Shelters SH1–SH3
- Routes EVAC-1/2/3
- Scripted rules: R7 full → S3 cut_off, EVAC-2 unavailable, EVAC-2b recalculated; R4 full → S1 cut_off, EVAC-1 replaced by EVAC-1b; etc.

This is the frontend's demo scenario. It is NOT Majuli. Backend should not modify it.

## 5. Dev ports and mock behavior

| App | Port |
|---|---|
| apps/field | 5173 |
| apps/command | 5174 |
| mock relay | 5199 |

Mock failure toggles via URL `?mock=offline`, `?mock=latency:800,5xx:0.3,timeout:0.2,conflict,reject,delay:3000`, `?mock=off`. Cross-tab sync via `BroadcastChannel('setu-mock')` or dev relay on port 5199.

Mock applies accepted events to projections after `applyDelayMs` (default 1500ms). `accepted` ≠ `synced`: synced only when feed version >= `acceptedAtVersion`.

## 6. What the frontend will NOT compute (per its own contract)

- No flood/routing/accessibility computation. It renders projections.
- No event fold or merge logic client-side (beyond local queue state).
- No projection version computation.

## 7. Integration assumptions backend should verify

1. **`road_cleared` event type** — frontend submits it; backend must accept it as a valid type that reverses a blockage.
2. **`water_level` (gaugeId, levelCm, trend)** — frontend submits it; backend datum rule (ADR-8) says raw levelCm must not be compared directly to DEM elevation without gauge-zero calibration.
3. **`household_registration`** — frontend submits it; backend person-registry/cross-script matching is separate; household registration is not auto-merged with person records.
4. **UUID clientEventId** — frontend generates UUID v4; backend internal envelope uses ULID. Translation at API boundary.
5. **Float coordinates/depths** — frontend sends floats (lat/lng/depthCm/levelCm); backend fold uses integers (microdegrees, decimetres). Translation at API boundary.

## 8. Frontend test IDs (for QA)

`frontend/docs/TEST_IDS.md` — `online-indicator`, `pending-count`, `last-synced`, `sync-now`, `report-submit`, `household-submit`, `queue-item[data-status]`, `map[data-projection-version]`, `road-row-<roadId>`, `settlement-row-<settlementId>`, `route-row-<routeId>`, `shelter-row-<shelterId>`, `incident-feed`, `stat-cut-off`, etc.

## 9. What frontend needs from backend next

- Sign-off on the proposed REST/WS shapes (or a compatible counter-proposal).
- Agreement on version semantics (`acceptedAtVersion` before/after apply; global vs per-projection counter).
- Agreement on conflict rules (`road_blockage` vs `road_cleared` on same road).
- A test fixture the frontend can point `http` mode at (even a lightweight one) so `VITE_API_MODE=http` stops throwing.

## 10. Files frontend owns — do not modify

All of `frontend/`. Backend changes to contract schemas must go through `docs/coordination/open-questions.md` and a PR, not a direct push to `frontend/main`.
