# SETU - Backend  Frontend Integration Handoff

**Branch:** `coordination/integration-handoff`  
**Commit:** `e03fc28`  
**Purpose:** Single source of truth for backend (OpenCode)  frontend (Darsh's Claude) integration.  
**Status:** Signed-off - all endpoints implemented and tested. Frontend needs to switch from `mock` to `http`.

## 1. Communication Protocol

See existing channels table in previous version. All communication goes through the repository.

### Communication Rules
1. **Never silently modify a contract** the other agent is implementing.
2. **Fetch before integrating.** Before building against the other agent's code, `git fetch` and check their branch.
3. **Reference commit hashes** when referencing specific work.
4. **Update `agent-status.md`** when a branch lands, a package is added, or a milestone is reached.
5. **No direct messaging.** All communication goes through the repository.

---

## 2. Agent Ownership & File Disjointness

(Same as previous - Backend owns `packages/core/`, `packages/server/`, `packages/geo/`; Frontend owns `frontend/`; Both share `docs/coordination/`; Karthik owns `data/`)

---

## 3. API Contract - Stable Endpoints

### Base URLs
- **Local (same network):** `http://localhost:8080`
- **Public (any network):** `https://marc-followed-equal-broadway.trycloudflare.com`
- **CORS:** Enabled (`Access-Control-Allow-Origin: *`)
- **Content-Type:** `application/json` for all endpoints

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
- `sinceVersion` (optional, int) - return 304 if snapshot version <= sinceVersion

**Response (200):**
```json
{
  "version": 5,
  "generatedAt": "2026-10-30T10:05:00Z",
  "flood": { "type": "FeatureCollection", ... },
  "roads": { "type": "FeatureCollection", ... },
  "settlements": { "type": "FeatureCollection", ... },
  "routes": { "type": "FeatureCollection", ... },
  "shelters": { "type": "FeatureCollection", ... }
}
```

### 3.4 GET /api/v1/events

List event records (audit/feed view).

**Query params:** `sinceVersion`, `limit` (default 50), `type`

**Response (200):** `{ "events": [...] }`

### 3.5 GET /api/v1/stream

Server-Sent Events stream for projection version bumps.

**Response:** `text/event-stream`
```
data: {"type":"version","version":5}
```

### 3.6 GET /api/v1/health

**Response (200):** `{ "ok": true, "eventCount": 150, "projectionVersion": 5 }`

---

## 4. Projection Feature Formats (What Frontend Renders)

| Collection | Geometry | Key Properties |
|---|---|---|
| `flood` | Polygon | `areaId`, `depthCm`, `severity` (1-5), `method` |
| `roads` | LineString | `roadId`, `name`, `status`, `updatedAt`, `sourceEventIds`, `blockReason`, `waterLevelM`, `deckElevationM`, `synthetic` |
| `settlements` | Point | `settlementId`, `name`, `population`, `accessibility` (`accessible\|limited\|cut_off`), `households`, `needs`, `cut_off_reason`, `synthetic` |
| `routes` | LineString | `routeId`, `from`, `to`, `kind`, `status` (`active\|recalculated\|unavailable`), `etaMin`, `replacesRouteId`, `avoids`, `synthetic` |
| `shelters` | Point | `shelterId`, `name`, `capacity`, `occupancy`, `open`, `status`, `serves_auniati`, `synthetic` |

**Critical:** All `etaMin`, route geometry, and road status values are **computed by the server's routing engine**, not fixture-provided. The frontend must never hardcode these.

---

## 5. Frontend Contract (FieldEvent Types)

Same as previous - 5 event types: `flood_report`, `road_blockage`, `road_cleared`, `water_level`, `household_registration`.

**Translation rules (backend handles):**
- `clientEventId` (UUID)  internal `id` (ULID)
- `occurredAt` (ISO)  `at` (epoch ms integer)
- `lat`/`lng` (floats)  microdegrees (integers)
- `depthCm`/`levelCm` (floats)  decimetres (integers, x10)

---

## 6. Sync Semantics

(Same as previous - two-step confirmation, idempotency, conflict, rejected)

---

## 7. Integration Checklist

| Item | Backend | Frontend | Status |
|---|---|---|---|
| All 6 endpoints implemented | Done | - | Done |
| Contract sign-off | - | Review this doc | **Pending** |
| `http` adapter unblocked | Done | Switch from mock to http | **Pending** |
| Synthetic scenario loaded | Done | Render synthetic features distinctly | **Pending** |
| End-to-end integration test | Done | Verify renders correctly | **Pending** |

**Server is live.** Frontend can connect now.

---

## 8. Immediate Next Steps

| # | Action | Owner | Deadline |
|---|---|---|---|
| 1 | Review this integration contract | Both | ASAP |
| 2 | Frontend switches `VITE_API_MODE=http` | Frontend | After sign-off |
| 3 | Point API client at `https://marc-followed-equal-broadway.trycloudflare.com` | Frontend | After sign-off |
| 4 | Test: submit `flood_report`, check `/api/v1/projections` | Frontend | After HTTP switch |
| 5 | Verify synthetic features render distinctly | Frontend | Before demo |

---

**This document is the living contract.** Changes require mutual agreement via `open-questions.md`  `decisions.md`  update here.
