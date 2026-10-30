# SETU — Integration Contract

Stable contract between the frontend agent (`frontend/`, branch `frontend/main`) and the backend (`packages/core`/`packages/server`, branch `planning/architecture`).

This document supersedes `docs/07-api-contract.md` and `frontend/docs/API_CONTRACT.md` where they conflict. The TypeScript/zod source in `frontend/packages/contract/src` is authoritative for field names; this document explains semantics, versioning, and the translation layer.

Status: proposed for review. Backend sign-off required before `packages/server` implements the HTTP adapter. Frontend's `http` adapter throws `NotImplementedError("pending API contract sign-off")`.

## 1. Principle

The frontend owns the client-side contract (`@setu/contract`). The backend implements a server that speaks the same wire format. Internally the backend may use a different envelope (ULID, HLC, vector clock, integer decimetres) — translation happens at the API boundary, not in the client.

The frontend never computes projections, routes, or accessibility. It renders what the API returns.

## 2. Wire format (authoritative: `frontend/packages/contract/src`)

### 2.1 Field events — submitted by the client

Common fields (all types):

| Field | Type | Notes |
|---|---|---|
| `clientEventId` | UUID v4 string | Client-generated idempotency key; never regenerated on retry |
| `type` | literal | `flood_report \| road_blockage \| road_cleared \| water_level \| household_registration` |
| `occurredAt` | ISO-8601 datetime with offset | Device clock time of observation (untrusted; see §7) |
| `reporterId` | string, min 1 | |
| `deviceId` | string, min 1 | |
| `location` | `{ lat: -90..90, lng: -180..180, accuracyM?: number >= 0 }` | floats |
| `note?` | string, max 2000 | |
| `photoRefs?` | string[] | stub; upload undefined (open question) |

Per type:

- `flood_report`: `severity` int 1–5; `depthCm?` number >= 0; `areaId?` string.
- `road_blockage`: `roadId?` string; `blockage` `'partial' | 'full'`; `passableBy?` array of `'foot' | 'bike' | 'car' | 'truck'`.
- `road_cleared`: `roadId` string (required, min 1).
- `water_level`: `gaugeId?` string; `levelCm` number; `trend` `'rising' | 'steady' | 'falling'`.
- `household_registration`: `householdId` uuid; `headName` string (min 1); `members` int >= 1; `vulnerable` `{ elderly, children, disabled, medical }`; `settlementId?` string; `needs` string[].

### 2.2 Server responses

`SubmitAck` (one per submitted event, same order), discriminated on `result`:
- `{ clientEventId, result:'accepted', eventId, acceptedAtVersion }`
- `{ clientEventId, result:'duplicate', eventId }`
- `{ clientEventId, result:'conflict', eventId?, reason, serverState? }`
- `{ clientEventId, result:'rejected', errors: [{ path, message }] }`

`EventStatus = { clientEventId, eventId?, state: 'unknown'|'accepted'|'applied'|'conflict'|'rejected', projectionVersion? }`

`EventRecord = { eventId, event: FieldEvent, serverState, receivedAt, appliedAtVersion? }`

`ProjectionSnapshot = { version, generatedAt, flood: FloodExtent, roads: RoadStatus, settlements: Settlement, routes: Route, shelters: Shelter }` where each is a GeoJSON `FeatureCollection` with top-level `version` and `generatedAt`.

### 2.3 Internal backend envelope (not on the wire)

Backend internal `Envelope` uses: `id` (ULID), `origin`, `seq`, `hlc {l, c}`, `vv` (vector clock), `type`, `actor`, `subject`, `at` (epoch ms), `payload` (no floats), `hash` (sha256), `sig?`. Translation layer maps wire → internal at `packages/server`.

## 3. Translation layer (backend implements)

| Wire field | Internal field | Translation |
|---|---|---|
| `clientEventId` (UUID) | `id` (ULID) + separate client idempotency key | map UUID → dedupe key |
| `occurredAt` (ISO) | `at` (epoch ms integer) | parse to integer |
| `lat`/`lng` (floats) | microdegrees (integers) | round to integer |
| `depthCm`/`levelCm` (floats) | decimetres (integers) | ×10, round |
| `photoRefs` | pass through | strings |
| `reporterId`, `deviceId` | `actor.id`, `device_id` | pass through |

The fold never sees floats, ISO strings, or UUIDs. It operates on integer decimetres, epoch ms, and microdegrees.

## 4. Endpoints (proposed)

| Endpoint | Method | Request | Response |
|---|---|---|---|
| `/api/v1/events:batch` | POST | `{ events: FieldEvent[] }` | `{ acks: SubmitAck[] }` |
| `/api/v1/events/status` | POST | `{ clientEventIds: string[] }` | `{ statuses: EventStatus[] }` |
| `/api/v1/projections` | GET | `?sinceVersion=<int>` | `ProjectionSnapshot` |
| `/api/v1/events` | GET | `?sinceVersion=&limit=&type=` | `{ events: EventRecord[] }` |
| `/api/v1/stream` | WS or SSE | — | `{ type: 'version', version: <int> }` on bump |
| `/sync` | POST | `SyncRequest` | `SyncResponse` (planning doc 04) |

Version semantics: `version` is a single global monotonic counter across all projections. `acceptedAtVersion` = version AFTER the event is applied. `getProjections(sinceVersion)` returns a full snapshot (not delta).

## 5. Ack semantics → client queue transitions

| Ack result | Meaning | Client queue transition |
|---|---|---|
| `accepted` | Durably stored, eventId assigned, not yet visible | `sending → accepted` |
| `duplicate` | clientEventId already known, original eventId returned | treated like accepted |
| `conflict` | Contradicts server state; needs human review | `conflict` |
| `rejected` | Validation failure | `rejected` |

`accepted` ≠ `synced`. Synced only when feed/projection version >= `acceptedAtVersion` (checked via `getEventStatus` or `subscribe`).

## 6. States both agents agree on

| State | Set by | Scope |
|---|---|---|
| `queued`/`sending`/`accepted`/`synced`/`conflict`/`rejected`/`failed` | Frontend | Client queue only |
| `accepted`/`applied`/`conflict`/`rejected` | Backend | Server-side |
| `accessible`/`limited`/`cut_off` | Backend | Settlement accessibility |
| `open`/`partial`/`blocked`/`unknown` | Backend | Road status |
| `active`/`recalculated`/`unavailable` | Backend | Route status |

## 7. Assumptions requiring verification

- `road_cleared` is a valid event type that reverses a blockage.
- `water_level` accepted but requires gauge-zero vs DEM calibration before inundation use (datum rule ADR-8).
- `household_registration` accepted; person-registry matching is separate, not auto-merged.
- UUID clientEventId → ULID internal mapping at API boundary.
- Float coordinates/depths → integer microdegrees/decimetres at API boundary.

## 8. What frontend must NOT expect yet

- No photo upload endpoint.
- No auth token flow (frontend sends reporterId/deviceId as strings).
- No WebSocket until subscribe() semantics agreed (polling acceptable for G1).

## 9. Amendment process

Changes require: (1) issue in `docs/coordination/open-questions.md`, (2) resolution in `docs/coordination/decisions.md`, (3) update here, (4) PR review by both agents. Never silently modify a contract the other agent is implementing.
