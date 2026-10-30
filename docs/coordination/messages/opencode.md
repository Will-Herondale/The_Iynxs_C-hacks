# SETU — Agent Message: OpenCode (backend orchestrator)

Use this file to post round-trip notes from the OpenCode backend agent. Other agents read this to catch up on what changed since their last session.

## Latest update

| Item | Value |
|---|---|
| Branch | `coordination/team-handoff` (from `planning/architecture`) |
| Last commit | `aec61bb` coordination: update agent-status with coordination branch and backend state |
| Previous commit | `ea114c4` coordination: publish multi-agent handoff documents |

## Work completed

- Created `docs/coordination/` with 6 documents: README, agent-status, ownership, integration-contract, open-questions, decisions, handoff-frontend, handoff-backend.
- Inspected Darsh's frontend branch `frontend/main` — contract schemas, api-client, mock-backend, ui packages all present; `http` adapter stub throws `NotImplementedError("pending API contract sign-off")`.
- Created `packages/core` package with:
  - `src/event/ulid.ts` — ULID v1 generation (26-char Crockford Base32, 6-byte timestamp + 10-byte randomness).
  - `src/event/hlc.ts` — Hybrid Logical Clock (l, c) with monotonic physical time + logical counter.
  - `src/event/canonical.ts` — Canonical JSON serialization (sorted keys, integers only, no floats).
  - `src/event/content-hash.ts` — SHA-256 over canonical JSON envelope fields.
  - `src/event/envelope.ts` — Envelope type, creation, validation, happensBefore, totalOrder.
  - `src/sync/version-vector.ts` — Version vector operations (empty, get, set, merge, equal, clone, sorted entries).
  - `src/sync/types.ts` — SyncRequest/SyncResponse/SyncState types.
  - `src/index.ts` — Public exports.
- Unit tests: 33 tests across 6 files — all passing.

## Pending work

- Implement `packages/core/src/sync/` merge/ingest algorithm (per-origin seq, holes, contiguous hwm).
- Implement `packages/core/src/project/` deterministic fold (flood, network, people, decision).
- Implement `packages/core/src/route/` time-expanded DAG, latest-safe-departure, cut-off sweep.
- Implement `packages/server/` HTTP adapter for `/api/v1/*` endpoints (per integration-contract.md).
- Create `packages/geo/` Python batch builder (Karthik dependency).

## Blockers / questions

- OQ-02: Geography — Guwahati seed vs Majuli artifacts. Decision pending technical lead confirmation.
- OQ-03: water_level gauge vs DEM datum rule — need gauge-zero calibration data from Karthik.
- OQ-06: Auth/roster scope — deferred beyond G1 per D-10.
- OQ-07: Subscribe mechanism — polling fallback agreed for G1.

## Next actions (from D-04: G1 scope)

G1 requires core event fold + sync harness using synthetic geography. Geographic processing proceeds independently and integrates later.

## For Darsh's frontend agent

- Your `@setu/contract` zod schemas are authoritative for wire format — backend adapts to them.
- The `http` adapter stub can be unblocked once `packages/server` implements `/api/v1/events:batch`, `/api/v1/events/status`, `/api/v1/projections`.
- Mock fixtures for Majuli will land under `data/fixtures/` when Karthik delivers geo artifacts.

## For Karthik's data/QA agent

- DEM tiles for Majuli verified downloadable anonymously from AWS `copernicus-dem-30m` bucket.
- Geodata audit complete — see `docs/05-geo-and-inundation.md`.
- Waiting on: village points with lat/lon, geocoded shelter list, ferry timetables, embankment lines, gauge-zero calibration table.