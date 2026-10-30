# SETU — Backend ↔ Frontend Integration Handoff

**Branch:** `coordination/integration-handoff`  
**Purpose:** Single source of truth for backend (OpenCode) ↔ frontend (Darsh's Claude) integration.  
**Status:** Proposed — awaiting review by both agents.

## 1. Communication Protocol

### How the two agents communicate

| Channel | Purpose | Owner |
|---|---|---|
| `docs/coordination/integration-handoff.md` | This file — stable API contracts, data schemas, integration boundaries | Both agents (edit via PR) |
| `docs/coordination/agent-status.md` | Who is working on what, branch state, work progress | Backend orchestrator updates |
| `docs/coordination/messages/opencode.md` | Backend agent round-trip notes | Backend orchestrator |
| `docs/coordination/messages/claude-darsh.md` | Frontend agent round-trip notes | Frontend agent (Darsh's Claude) |
| `docs/coordination/open-questions.md` | Unresolved items needing agreement | Both agents |
| `docs/coordination/decisions.md` | Resolved decisions (OQ → D mapping) | Both agents |
| GitHub Issues | Actionable requests, bug reports, feature requests | Both agents |
| GitHub PRs | Code review for cross-agent changes | Both agents |

### Communication Rules

1. **Never silently modify a contract** the other agent is implementing. Propose changes in `open-questions.md`, resolve in `decisions.md`, then update this document.
2. **Fetch before integrating.** Before building against the other agent's code, `git fetch` and check their branch.
3. **Reference commit hashes** when referencing specific work.
4. **Update `agent-status.md`** when a branch lands, a package is added, or a milestone is reached.
5. **No direct messaging.** All communication goes through the repository.

---

## 2. Agent Ownership & File Disjointness

| Directory | Owner | Other Agent May Touch? | Conditions |
|---|---|---|---|
| `packages/core/` | Backend (OpenCode) | Read-only | Event envelope, HLC, sync, projections, routing |
| `packages/server/` | Backend (OpenCode) | Read-only | HTTP API, event log, projection fold |
| `packages/geo/` | Backend (OpenCode) + Karthik | Read-only for frontend | DEM → HAND artifact builder (Python) |
| `frontend/` | Frontend (Darsh's Claude) | Read-only for backend | Field app, command centre, UI, mock backend |
| `docs/coordination/` | Both | Yes — via PR/comment | Shared communication channel |
| `docs/00–11/` | Backend (OpenCode) | Read-only for frontend | Planning docs |
| `data/` | Karthik | Read-only for both | Geographic artifacts, fixtures |
| `tests/e2e/` | Karthik | Read-only for both | End-to-end tests |

---

## 3. API Contract — Stable Endpoints

The frontend's `http` adapter currently throws `NotImplementedError("pending API contract sign-off")`. This section is the sign-off basis.

### Base URL
```
http://localhost:8080
```
Content-Type: `application/json` for all endpoints.

### 3.1 POST /api/v1/events:batch

Submit one or more field events. Returns per-item acknowledgments.

**Request:**
```json
{
  "events": [
    {
      "clientEventId": "uuid-v4",
      "type": "flood_report",
      "occurredAt": "2026-10-30T10:00:00Z",
      "reporterId": "volunteer-1",
      "deviceId": "device-abc",
      "location": { "lat": 26.95, "lng": 94.2, "accuracyM": 10 },
      "note": "Water 1.1m over bridge deck",
      "photoRefs": [],
      "severity": 3,
      "depthCm": 110,
      "areaId": "A1"
    }
  ]
}
```

**Response (200):**
```json
{
  "acks": [
    {
      "clientEventId": "uuid-v4",
      "result": "accepted",
      "eventId": "evt_abc123",
      "acceptedAtVersion": 5
    }
  ]
}
```

**Ack result values:** `accepted`, `duplicate`, `conflict`, `rejected`

### 3.2 POST /api/v1/events/status

Check sync status of submitted events.

**Request:**
```json
{
  "clientEventIds": ["uuid-v4", "uuid-v5"]
}
```

**Response (200):**
```json
{
  "statuses": [
    {
      "clientEventId": "uuid-v4",
      "eventId": "evt_abc123",
      "state": "applied",
      "projectionVersion": 5
    }
  ]
}
```

**State values:** `unknown`, `accepted`, `applied`, `conflict`, `rejected`

### 3.3 GET /api/v1/projections

Get the current projection snapshot. Full snapshot (not delta).

**Query params:**
- `sinceVersion` (optional, int) — return 304 if snapshot version <= sinceVersion

**Response (200):**
```json
{
  "version": 5,
  "generatedAt": "2026-10-30T10:05:00Z",
  "flood": {
    "type": "FeatureCollection",
    "version": 5,
    "generatedAt": "2026-10-30T10:05:00Z",
    "features": [
      {
        "type": "Feature",
        "id": "flood-0",
        "geometry": { "type": "Polygon", "coordinates": [[...]] },
        "properties": { "areaId": "A1", "depthCm": 110, "severity": 3 }
      }
    ]
  },
  "roads": {
    "type": "FeatureCollection",
    "version": 5,
    "generatedAt": "2026-10-30T10:05:00Z",
    "features": [
      {
        "type": "Feature",
        "id": "road-0",
        "geometry": { "type": "LineString", "coordinates": [[...]] },
        "properties": {
          "roadId": "R7",
          "name": "Beltola-Basistha Road",
          "status": "blocked",
          "updatedAt": "2026-10-30T10:00:00Z",
          "sourceEventIds": ["evt_abc123"]
        }
      }
    ]
  },
  "settlements": {
    "type": "FeatureCollection",
    "version": 5,
    "generatedAt": "2026-10-30T10:05:00Z",
    "features": [
      {
        "type": "Feature",
        "id": "settlement-0",
        "geometry": { "type": "Point", "coordinates": [94.2, 26.95] },
        "properties": {
          "settlementId": "S3",
          "name": "Beltola",
          "population": 5200,
          "accessibility": "cut_off",
          "households": 1180,
          "needs": ["food", "drinking_water"]
        }
      }
    ]
  },
  "routes": {
    "type": "FeatureCollection",
    "version": 5,
    "generatedAt": "2026-10-30T10:05:00Z",
    "features": [
      {
        "type": "Feature",
        "id": "route-0",
        "geometry": { "type": "LineString", "coordinates": [[...]] },
        "properties": {
          "routeId": "EVAC-2",
          "from": "S3",
          "to": "SH2",
          "kind": "evacuation",
          "status": "recalculated",
          "etaMin": 24,
          "replacesRouteId": null
        }
      }
    ]
  },
  "shelters": {
    "type": "FeatureCollection",
    "version": 5,
    "generatedAt": "2026-10-30T10:05:00Z",
    "features": [
      {
        "type": "Feature",
        "id": "shelter-0",
        "geometry": { "type": "Point", "coordinates": [94.248, 26.117] },
        "properties": {
          "shelterId": "SH2",
          "name": "Basistha Community Hall",
          "capacity": 450,
          "occupancy": 25,
          "open": true
        }
      }
    ]
  }
}
```

### 3.4 GET /api/v1/events

List event records (audit/feed view).

**Query params:**
- `sinceVersion` (optional, int)
- `limit` (optional, int, default 50)
- `type` (optional, `flood_report\|road_blockage\|road_cleared\|water_level\|household_registration`)

**Response (200):**
```json
{
  "events": [
    {
      "eventId": "evt_abc123",
      "event": { ...FieldEvent... },
      "serverState": "applied",
      "receivedAt": "2026-10-30T10:00:00Z",
      "appliedAtVersion": 5
    }
  ]
}
```

### 3.5 GET /api/v1/stream

Server-Sent Events stream for projection version bumps.

**Response:** `text/event-stream`

```
data: {"type":"version","version":5}

```

Client should reconnect on disconnect. No auth required.

### 3.6 GET /api/v1/health

Health check.

**Response (200):**
```json
{
  "ok": true,
  "eventCount": 150,
  "projectionVersion": 5
}
```

---

## 4. Frontend Contract (What Backend Expects from Frontend)

The frontend submits `FieldEvent` objects. The backend translates them to internal envelopes. Field types:

| Type | Required Fields | Optional Fields |
|---|---|---|
| `flood_report` | `clientEventId`, `type`, `occurredAt`, `reporterId`, `deviceId`, `location`, `severity` | `depthCm`, `areaId`, `note`, `photoRefs` |
| `road_blockage` | `clientEventId`, `type`, `occurredAt`, `reporterId`, `deviceId`, `location`, `blockage` | `roadId`, `passableBy`, `note`, `photoRefs` |
| `road_cleared` | `clientEventId`, `type`, `occurredAt`, `reporterId`, `deviceId`, `location`, `roadId` | `note`, `photoRefs` |
| `water_level` | `clientEventId`, `type`, `occurredAt`, `reporterId`, `deviceId`, `location`, `levelCm`, `trend` | `gaugeId`, `note`, `photoRefs` |
| `household_registration` | `clientEventId`, `type`, `occurredAt`, `reporterId`, `deviceId`, `location`, `householdId`, `headName`, `members`, `vulnerable`, `needs` | `settlementId`, `note`, `photoRefs` |

**Translation rules (backend handles):**
- `clientEventId` (UUID) → internal `id` (ULID), client idempotency key stored separately
- `occurredAt` (ISO datetime) → `at` (epoch ms integer)
- `lat`/`lng` (floats) → microdegrees (integers)
- `depthCm`/`levelCm` (floats) → decimetres (integers, ×10)
- `photoRefs` → pass through (strings)

---

## 5. Projection Feature Formats (What Frontend Renders)

The frontend **never computes** projections, routes, or accessibility. It renders what the API returns.

| Collection | Geometry | Key Properties |
|---|---|---|
| `flood` | Polygon | `areaId`, `depthCm` (>=0), `severity` (1-5) |
| `roads` | LineString | `roadId`, `name`, `status` (`open\|partial\|blocked\|unknown`), `updatedAt`, `sourceEventIds` |
| `settlements` | Point | `settlementId`, `name`, `population`, `accessibility` (`accessible\|limited\|cut_off`), `households`, `needs` |
| `routes` | LineString | `routeId`, `from`, `to`, `kind` (`evacuation\|supply`), `status` (`active\|recalculated\|unavailable`), `etaMin` (>=0), `replacesRouteId` |
| `shelters` | Point | `shelterId`, `name`, `capacity`, `occupancy`, `open` |

**Test IDs (for QA):** See `frontend/docs/TEST_IDS.md` — `online-indicator`, `pending-count`, `last-synced`, `sync-now`, `road-row-<roadId>`, `settlement-row-<settlementId>`, `route-row-<routeId>`, `shelter-row-<shelterId>`, `incident-feed`, `stat-cut-off`, etc.

---

## 6. Sync Semantics (Frontend Must Understand)

1. **`accepted` ≠ `synced`**: HTTP success and even an `accepted` ack does not mean the report is globally synced.
2. **Two-step confirmation:**
   - Step 1: `submitEvents` returns `accepted` with `acceptedAtVersion = V`
   - Step 2: The event is `synced` once it appears in the event feed or projection feed with version >= V
   - Use `getEventStatus(ids)` or `subscribe(cb)` to check
3. **Idempotency:** Submitting the same `clientEventId` again returns `duplicate` with the original `eventId`. Safe to retry.
4. **Conflict:** A `road_blockage` on a road already reported `road_cleared` returns `conflict`. Needs human review.
5. **Rejected:** Validation failure with `errors[].path`. Not retried automatically.

---

## 7. Mock API (Frontend Can Work Independently)

The frontend's `@setu/mock-backend` provides an in-process test double. The frontend does **not** need the backend to be running to develop and test.

**Mock behavior:**
- `submitEvents` returns `accepted` immediately
- Events are applied to projections after `applyDelayMs` (default 1500ms)
- Failure toggles via URL: `?mock=offline`, `?mock=latency:800`, `?mock=5xx:0.3`, `?mock=conflict`, `?mock=reject`, `?mock=delay:3000`
- Cross-tab sync via `BroadcastChannel('setu-mock')` or dev relay on port 5199

**Seed scenario (Guwahati, Assam):**
- Roads R1–R10, settlements S1–S6, shelters SH1–SH3, routes EVAC-1/2/3
- Scripted rules: R7 full → S3 cut_off, EVAC-2 unavailable → EVAC-2b recalculated
- R4 full → S1 cut_off, EVAC-1 replaced by EVAC-1b

**Frontend should NOT modify the seed scenario.** Backend will publish Majuli fixtures under `data/fixtures/` when ready.

---

## 7. Integration Checklist

| Item | Backend (OpenCode) | Frontend (Darsh's Claude) | Status |
|---|---|---|---|
| `/api/v1/events:batch` endpoint | ✅ Implemented | — | Done |
| `/api/v1/events/status` endpoint | ✅ Implemented | — | Done |
| `/api/v1/projections` endpoint | ✅ Implemented | — | Done |
| `/api/v1/events` list endpoint | ✅ Implemented | — | Done |
| `/api/v1/stream` SSE endpoint | ✅ Implemented | — | Done |
| `/health` endpoint | ✅ Implemented | — | Done |
| Contract sign-off | — | Review this document | Pending |
| `http` adapter unblocked | Backend sign-off | Switch from mock to http | Pending |
| Mock fixtures for Majuli | Publish `data/fixtures/` | Use for testing | Pending |
| Cross-replica convergence test | Run fuzz harness | Observe results | Pending |
| End-to-end demo scenario | Build scenario-a.json | Verify renders correctly | Pending |

---

## 8. How to Request Changes

1. **Frontend needs a backend change:** Create issue in `docs/coordination/open-questions.md` with tag `[backend-request]`
2. **Backend needs a frontend change:** Create issue in `docs/coordination/open-questions.md` with tag `[frontend-request]`
3. **Both agree:** Move resolution to `docs/coordination/decisions.md`, update this document
4. **Implement:** Make changes on respective branches, submit PR for cross-agent review
5. **Merge:** Only merge after both agents approve

---

## 9. Immediate Next Steps

| # | Action | Owner | Deadline |
|---|---|---|---|
| 1 | Review this integration contract | Both agents | ASAP |
| 2 | Resolve OQ-01 (wire format translation) | Both agents | Before integration |
| 3 | Resolve OQ-07 (subscribe mechanism) | Both agents | Before frontend switches to http |
| 4 | Frontend switches `VITE_API_MODE=http` | Frontend agent | After contract sign-off |
| 5 | Backend publishes Majuli mock fixtures | Backend | After district confirmed |
| 6 | End-to-end integration test | Both agents | Before demo |

---

**This document is the living contract.** Both agents should read it before writing code that crosses the frontend/backend boundary. Changes require mutual agreement via `open-questions.md` → `decisions.md` → update here.
