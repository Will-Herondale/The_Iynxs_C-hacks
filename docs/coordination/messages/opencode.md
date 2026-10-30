# SETU — Agent Message: OpenCode (backend orchestrator)

Use this file to post round-trip notes from the OpenCode backend agent. Other agents read this to catch up on what changed since their last session.

## Latest update

| Item | Value |
|---|---|
| Branch | `coordination/team-handoff` (from `planning/architecture`) |
| Last commit | `711f863` coordination: add allowImportingTsExtensions to core tsconfig |
| Previous commit | `e2b8c40` backend: add packages/server HTTP adapter |

## Work completed

- Created `docs/coordination/` with 9 documents: README, agent-status, ownership, integration-contract, open-questions, decisions, handoff-frontend, handoff-backend, messages/*.
- Inspected Darsh's frontend branch `frontend/main` — contract schemas, api-client, mock-backend, ui packages all present; `http` adapter stub throws `NotImplementedError("pending API contract sign-off")`.
- Created `packages/core` package with:
  - `src/event/ulid.ts` — ULID v1 generation (26-char Crockford Base32, 6-byte timestamp + 10-byte randomness).
  - `src/event/hlc.ts` — Hybrid Logical Clock (l, c) with monotonic physical time + logical counter.
  - `src/event/canonical.ts` — Canonical JSON serialization (sorted keys, integers only, no floats).
  - `src/event/content-hash.ts` — SHA-256 over canonical JSON envelope fields.
  - `src/event/envelope.ts` — Envelope type, creation, validation, happensBefore, totalOrder.
  - `src/sync/version-vector.ts` — Version vector operations (empty, get, set, merge, equal, clone).
  - `src/sync/types.ts` — SyncRequest/SyncResponse/SyncState types.
  - `src/sync/ingest.ts` — Sync ingest algorithm (duplicate delivery, hole healing, hash collision rejection, max-event-size, idempotent).
  - `src/project/network.ts` — Road state projection with valid-time observation selection and disputed flag.
  - `src/project/flood.ts` — HAND inundation projection with hydraulic depth computation.
  - `src/project/people.ts` — Cross-script person matching with phonetic keys and basis-point scoring.
  - `src/route/dag.ts` — Time-expanded DAG for routing with node waiting.
  - `src/route/latest-departure.ts` — Reverse sweep latest-safe-departure.
  - `src/route/cutoff.ts` — Settlement reachability and cut-off computation.
  - `src/index.ts` — Public exports for all modules.
- Unit tests: 66 tests across 11 test files — all passing.

- Created `packages/server` package with:
  - `src/server.ts` — HTTP adapter for `/api/v1/*` endpoints: `/api/v1/events:batch` (POST), `/api/v1/events/status` (POST), `/api/v1/projections` (GET), `/api/v1/events` (GET), `/api/v1/stream` (SSE), `/health` (GET).
  - `src/event-log.ts` — Append-only JSONL event log with in-memory indices, hole healing, duplicate detection, per-origin hwm.
  - `src/translation.ts` — Wire format (FieldEvent) → internal envelope (Envelope) translation layer.
  - `src/projection.ts` — Deterministic projection fold: flood, network, settlements, routes, shelters into ProjectionSnapshot.
  - `src/contract-types.ts` — Contract type definitions mirroring `@setu/contract`.
  - `src/index.ts` — Public exports.

## Pending work

- Implement `packages/geo/` Python batch builder (Karthik dependency — DEM → HAND artifacts).
- Create mock fixtures under `data/fixtures/` for Majuli scenario.
- Deterministic event fold integration test across core+server.

## Blockers / questions

- OQ-02: Geography — Guwahati seed vs Majuli artifacts. Decision pending technical lead confirmation.
- OQ-03: water_level gauge vs DEM datum rule — need gauge-zero calibration data from Karthik.
- OQ-06: Auth/roster scope — deferred beyond G1 per D-10.
- OQ-07: Subscribe mechanism — polling fallback agreed for G1.

## Next actions (from D-04: G1 scope)

G1 requires core event fold + sync harness using synthetic geography. Geographic processing proceeds independently and integrates later.

## For Darsh's frontend agent

- Your `@setu/contract` zod schemas are authoritative for wire format — backend adapts to them.
- The `http` adapter stub can be unblocked once `packages/server` implements `/api/v1/events:batch`, `/api/v1/events/status`, `/api/v1/projections`. **This is now done.** Point `VITE_API_MODE=http` at the server running on port 8080.
- Mock fixtures for Majuli will land under `data/fixtures/` when Karthik delivers geo artifacts.

## For Karthik's data/QA agent

- DEM tiles for Majuli verified downloadable anonymously from AWS `copernicus-dem-30m` bucket.
- Geodata audit complete — see `docs/05-geo-and-inundation.md`.
- Waiting on: village points with lat/lon, geocoded shelter list, ferry timetables, embankment lines, gauge-zero calibration table.