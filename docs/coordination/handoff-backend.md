# SETU — Backend Integration Handoff

Audience: frontend agent (Darsh's Claude). Read this before writing any code that talks to a real backend.

Status: proposed contract. Your `http` adapter currently throws `NotImplementedError("pending API contract sign-off")`. This document is the sign-off basis.

## 1. What the backend owns

`packages/core`, `packages/server`, `packages/geo` on branch `planning/architecture` (and a future `backend/` implementation branch). The frontend must not modify these.

Backend responsibilities:
- Canonical event envelope (ULID, HLC, vector clock, content hash, integer decimetres, no floats).
- Append-only event log, duplicate delivery, out-of-order arrival, hole healing.
- Projections: flood (HAND-based inundation), network (road state + blockages), people (registry + cross-script matching), decision (reachability + cut-off).
- Time-dependent routing: time-expanded DAG with node waiting, latest-safe-departure, exact_replay safety assert.
- Sync protocol: `/sync` pull+push with per-origin version vectors, chunked, resumable, sneakernet file export/import.
- Auth/roster: per-device Ed25519 keypair, signed genesis roster event, quarantine unverified events.

## 2. What the frontend owns (do not change without agreement)

`frontend/` on branch `frontend/main`:
- `@setu/contract` zod schemas: `FieldEvent`, `SubmitAck`, `EventStatus`, `ProjectionSnapshot`, `EventRecord`, errors.
- `@setu/api-client` `ApiClient` interface + mock + http stub.
- `@setu/mock-backend` in-process test double + dev relay + Guwahati seed scenario.
- `@setu/ui` React component kit.
- `apps/field`, `apps/command` (not yet scaffolded).

Frontend contract source: `frontend/packages/contract/src/*.ts` — authoritative for wire field names.

## 3. The translation layer (backend's job)

The wire format (`FieldEvent`) and the internal fold format (`Envelope`) differ. The backend translates at the API boundary:

| Wire field (FieldEvent) | Internal envelope field | Translation |
|---|---|---|
| `clientEventId` (UUID v4) | `id` (ULID) + client idempotency key stored separately | map UUID → dedupe key |
| `occurredAt` (ISO datetime) | `at` (epoch ms integer) | parse to integer |
| `lat`/`lng` (floats) | microdegrees (integers) | round to integer |
| `depthCm`/`levelCm` (floats) | decimetres (integers) | ×10, round |
| `photoRefs` | stored as-is (strings) | pass through |
| `reporterId`, `deviceId` | `actor.id`, `device_id` | pass through |

The fold (`packages/core/src/project/`) never sees floats, ISO strings, or UUIDs. It operates on integer decimetres, epoch ms, and microdegrees.

## 4. Endpoints the backend will implement (proposed, needs your review)

| Endpoint | Method | Request | Response |
|---|---|---|---|
| `/api/v1/events:batch` | POST | `{ events: FieldEvent[] }` | `{ acks: SubmitAck[] }` |
| `/api/v1/events/status` | POST | `{ clientEventIds: string[] }` | `{ statuses: EventStatus[] }` |
| `/api/v1/projections` | GET | `?sinceVersion=<int>` | `ProjectionSnapshot` |
| `/api/v1/events` | GET | `?sinceVersion=&limit=&type=` | `{ events: EventRecord[] }` |
| `/api/v1/stream` | WS or SSE | — | `{ type: 'version', version: <int> }` on bump |
| `/sync` | POST | `SyncRequest` | `SyncResponse` (see planning doc 04) |

Version semantics: `version` is a single global monotonic counter across all projections. `acceptedAtVersion` = version AFTER the event is applied (backend assigns at apply time). `getProjections(sinceVersion)` returns a full snapshot (not delta) at the requested version.

## 5. Mock fixtures for frontend independence

Backend will publish committed fixtures under `data/fixtures/`:
- `scenario-a.json` — deterministic Majuli scenario: events, expected projections at each version, expected route results.
- `synthetic.json` — 40×40 grid island fixture for G1 (synthetic geography, hand-computed HAND).

Frontend's Guwahati seed (`frontend/packages/mock-backend/src/seed/data.ts`) remains the frontend's own fixture. Backend will not modify it.

## 6. States both agents must agree on

| State | Who sets | Meaning |
|---|---|---|
| `queued` / `sending` / `accepted` / `synced` / `conflict` / `rejected` / `failed` | Frontend (ClientSyncStatus) | Client queue only, never sent |
| `accepted` / `applied` / `conflict` / `rejected` | Backend (ServerEventState) | Server-side processing |
| `accessible` / `limited` / `cut_off` | Backend (projection) | Settlement accessibility |
| `open` / `partial` / `blocked` / `unknown` | Backend (projection) | Road status |
| `active` / `recalculated` / `unavailable` | Backend (projection) | Route status |

The frontend renders these; it never computes them.

## 7. Known assumptions to verify

- Frontend `road_cleared` event type: backend accepts it as a valid event type (it reverses a blockage).
- Frontend `water_level` (gaugeId, levelCm, trend): backend accepts but requires gauge-zero vs DEM calibration before using for inundation (ADR-8 datum rule). Raw `levelCm` is never compared directly to DEM elevation.
- Frontend `household_registration`: backend accepts but person-registry cross-script matching is a separate projection; household registration is not auto-merged with person records.

## 8. What frontend should NOT expect yet

- No photo upload endpoint (open question #5 in frontend contract).
- No auth token flow (roster + Ed25519 is backend scope; frontend sends `reporterId`/`deviceId` as strings).
- No WebSocket until `subscribe()` semantics are agreed (polling fallback acceptable for G1).

## 9. Next integration step

Backend will create branch `backend/scaffold` with `packages/core` event envelope + validation unit tests. Frontend should keep `http` mode as stub until that branch is reviewed via `docs/coordination/open-questions.md`.
