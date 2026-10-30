# SETU API Contract — DRAFT for backend lead review

**Status: DRAFT.** Mirrors `@setu/contract` (`frontend/packages/contract/src`) exactly. The TypeScript/zod source is authoritative for field names; this document explains semantics. Nothing here is signed off by the backend. Every URL, verb and wire shape below is labelled **PROPOSED — needs backend sign-off**; the frontend does not call any endpoint today (mock adapter is in-process, `http` adapter throws `NotImplementedError("pending API contract sign-off")`).

Apps talk to the backend only through the `ApiClient` interface.

## 1. Identifiers and idempotency

- `ClientEventId`: UUID v4 generated on the client (`newClientEventId()`), created when the report is drafted and never regenerated on retry. It is the **idempotency key**.
- `eventId`: opaque string assigned by the server on first acceptance.
- Rule: submitting the same `clientEventId` again (any number of times, any batch) must never create a second event; the server answers `duplicate` with the original `eventId`.
- Event payloads are immutable once submitted; corrections are new events (e.g. `road_cleared`).

## 2. Field events (`FieldEvent`, discriminated on `type`)

Common fields (all types):

| Field | Type | Notes |
|---|---|---|
| `clientEventId` | uuid | idempotency key |
| `type` | literal | see below |
| `occurredAt` | ISO-8601 datetime with offset | device clock time of observation |
| `reporterId` | string (min 1) | |
| `deviceId` | string (min 1) | |
| `location` | `{ lat -90..90, lng -180..180, accuracyM?: number >= 0 }` | |
| `note?` | string, max 2000 | |
| `photoRefs?` | string[] | **stub**; opaque references, upload undefined (see open questions) |

Per type:

- `flood_report`: `severity` int 1–5; `depthCm?` number >= 0; `areaId?` string.
- `road_blockage`: `roadId?` string; `blockage` `'partial' | 'full'`; `passableBy?` array of `'foot' | 'bike' | 'car' | 'truck'`.
- `road_cleared`: `roadId` string (required, min 1).
- `water_level`: `gaugeId?` string; `levelCm` number; `trend` `'rising' | 'steady' | 'falling'`.
- `household_registration`: `householdId` uuid (client generated); `headName` string (min 1); `members` int >= 1; `vulnerable` `{ elderly, children, disabled, medical }` (booleans); `settlementId?` string; `needs` string[].

Supporting types: `Location`, `VehicleClass`, `VulnerableFlags`, `FieldEventType`.

### EventRecord (incident feed item)

`{ eventId: string, event: FieldEvent, serverState: 'accepted'|'applied'|'conflict'|'rejected', receivedAt: ISO datetime, appliedAtVersion?: int >= 0 }`. `appliedAtVersion` is the projection version at which the event became visible; set once `serverState` is `applied`.

## 3. Projections

Each is a GeoJSON `FeatureCollection` with extra top-level `version` (int >= 0) and `generatedAt` (ISO datetime). Features are `{ type:'Feature', id?: string, geometry, properties }`. Coordinates are `[lng, lat, ...]`.

| Collection | Geometry | `properties` |
|---|---|---|
| `FloodExtent` | Polygon | `areaId`, `depthCm >= 0`, `severity` 1–5 |
| `RoadStatus` | LineString | `roadId`, `name`, `status` `open\|partial\|blocked\|unknown`, `updatedAt` ISO, `sourceEventIds` string[] |
| `Settlement` | Point | `settlementId`, `name`, `population`, `accessibility` `accessible\|limited\|cut_off`, `households`, `needs` string[] |
| `Route` | LineString | `routeId`, `from`, `to`, `kind` `evacuation\|supply`, `status` `active\|recalculated\|unavailable`, `etaMin >= 0`, `replacesRouteId?` |
| `Shelter` | Point | `shelterId`, `name`, `capacity`, `occupancy`, `open` boolean |

`ProjectionSnapshot = { version, generatedAt, flood, roads, settlements, routes, shelters }`.

**The frontend never computes projections, routes or accessibility.** It only renders what the API returns.

## 4. Sync types

- `SubmitAck` (one per submitted event, same order as input), discriminated on `result`:
  - `{ clientEventId, result:'accepted', eventId, acceptedAtVersion }`
  - `{ clientEventId, result:'duplicate', eventId }`
  - `{ clientEventId, result:'conflict', eventId?, reason, serverState? }`
  - `{ clientEventId, result:'rejected', errors: [{ path, message }] }`
- `EventStatus = { clientEventId, eventId?, state: 'unknown'|'accepted'|'applied'|'conflict'|'rejected', projectionVersion? }`
- `ClientSyncStatus` (frontend queue only, never sent): `queued | sending | accepted | synced | conflict | rejected | failed`.

## 5. `ApiClient`

```ts
interface ApiClient {
  submitEvents(events: FieldEvent[]): Promise<SubmitAck[]>;
  getEventStatus(clientEventIds: string[]): Promise<EventStatus[]>;
  getProjections(sinceVersion?: number): Promise<ProjectionSnapshot>;
  listEvents(params?: { sinceVersion?: number; limit?: number; type?: FieldEventType }): Promise<EventRecord[]>;
  subscribe(onChange: (snapshotVersion: number) => void): () => void; // returns unsubscribe
}
```

Created via `createApiClient({ mode: 'mock' | 'http' })`; apps read `VITE_API_MODE` (default `mock`).

## 6. Ack semantics

| Ack `result` | Meaning | Client queue transition |
|---|---|---|
| `accepted` | Durably stored, `eventId` and `acceptedAtVersion` assigned. **Not yet visible in projections.** | `sending → accepted` |
| `duplicate` | `clientEventId` already known; `eventId` is the original. Safe, idempotent. | treated like `accepted` (then confirmed by status/feed) |
| `conflict` | Contradicts server state; `reason` human-readable, `serverState` optional opaque detail. Not retried automatically. | `conflict` (needs human review) |
| `rejected` | Validation failure; `errors[].path` is a field path. Not retried. | `rejected` |

## 7. Two-step confirmation: accepted ≠ synced

HTTP success, and even an `accepted` ack, does **not** mean the report is globally synced. The UI shows `synced` only after step 2:

1. **Ack**: `submitEvents` returns `accepted` with `acceptedAtVersion = V`.
2. **Confirmation**: the event is `synced` once it appears in the event feed (`listEvents`) or projection feed with version `>= V`; i.e. `getEventStatus` reports `applied`, or a subscribed/polled feed version `>= V` includes it. (`isConfirmedSynced(acceptedAtVersion, feedVersion)` in the contract implements the version check.)

`getEventStatus(ids)` is the pull path; `subscribe(cb)` signals feed version bumps so the client can re-check pending ids. Between steps the badge shows "Awaiting confirmation" (`accepted`), visually distinct from `queued`, `synced` and `conflict`. `getEventStatus` may later report `conflict` or `rejected` for an already-accepted event; the client must handle that transition.

## 8. Error taxonomy

Thrown (Promise rejection) for transport-level failure; per-item business outcomes are acks, not errors.

| Error | `retryable` | Notes |
|---|---|---|
| `NetworkError` | true | no connectivity / offline |
| `ServerError` | true | has `status` (5xx) |
| `TimeoutError` | true | |
| `NotImplementedError` | false | http adapter stub |

`isRetryable(err)` tests the flag. On retryable errors the client sets `failed`, keeps the same `clientEventId`, and retries with backoff; idempotency makes this safe even if the first attempt actually succeeded.

## 9. Proposed REST/WS shapes

All of this is **PROPOSED — needs backend sign-off**. Base path and versioning undecided.

- **PROPOSED — needs backend sign-off:** `POST /api/v1/events:batch` — body `{ events: FieldEvent[] }`, `200` response `{ acks: SubmitAck[] }` (per-item outcomes; whole-request errors use 4xx/5xx).
- **PROPOSED — needs backend sign-off:** `POST /api/v1/events/status` — body `{ clientEventIds: string[] }`, response `{ statuses: EventStatus[] }`.
- **PROPOSED — needs backend sign-off:** `GET /api/v1/projections?sinceVersion=<int>` — response `ProjectionSnapshot`.
- **PROPOSED — needs backend sign-off:** `GET /api/v1/events?sinceVersion=&limit=&type=` — response `{ events: EventRecord[] }`.
- **PROPOSED — needs backend sign-off:** `WS /api/v1/stream` (or SSE) — server pushes `{ "type": "version", "version": <int> }` on each projection/feed version bump; client then pulls.

## 10. Open questions for backend

1. **Event id format**: are `eventId`s opaque strings, ULIDs, or sequential? Are they stable across replays? Will the server accept our client UUID as the primary key?
2. **Version semantics**: is `version` one global monotonic counter across all projections? Is `acceptedAtVersion` the version *before* or *after* the event is applied? Does `getProjections(sinceVersion)` return a full snapshot or a delta?
3. **Conflict rules**: which combinations conflict (e.g. blockage on a road already reported cleared)? Is last-writer-wins by `occurredAt` or by arrival? What goes in `conflict.serverState`, and how does a human resolve it (resubmit as new event?).
4. **Auth**: how do reporters and the command centre authenticate offline-first? Token lifetime, device registration, how `reporterId`/`deviceId` are validated.
5. **Photo upload**: separate upload endpoint returning a reference for `photoRefs`? Size limits, resumable upload, behaviour when offline.
6. **Pagination**: cursor vs `sinceVersion`+`limit` for `listEvents`; max page size; ordering guarantees.
7. **Push vs poll**: WebSocket, SSE, or polling for `subscribe`? Expected latency, reconnect/resume semantics, and whether pushes carry the new version only.
8. **Batch size limits**: max events per `submitEvents`, max body size, rate limits.
9. **Clock skew**: devices may be offline for days with wrong clocks; is `occurredAt` trusted, clamped, or supplemented with a server timestamp (`receivedAt`) for ordering?
10. **Event types**: is `road_cleared` (added by the frontend to support un-blocking) acceptable, and what other event types are needed?
11. **Retention / replay**: how long are `duplicate` lookups guaranteed to resolve for a given `clientEventId`?
