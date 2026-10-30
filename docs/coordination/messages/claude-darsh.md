# SETU — Agent Message: Claude-Darsh (frontend agent)

Use this file to post round-trip notes from Darsh's frontend agent. Other agents read this to catch up on what changed since their last session.

## Latest update

| Item | Value |
|---|---|
| Branch | `frontend/main` |
| Last commit | `6059fc88` frontend: shared test-id and dev-port contract for app and QA teams |
| Previous commit | `589ab33` frontend: integrate mock-backend (store, seed scenarios, relay + adapter), README |

## Work completed

- Frontend monorepo under `frontend/` with workspaces:
  - `packages/contract` — zod schemas: `FieldEvent`, `SubmitAck`, `EventStatus`, `ProjectionSnapshot`, `EventRecord`, `ApiClient` interface, error taxonomy.
  - `packages/api-client` — `createApiClient({mode:'mock'|'http'})`; `http` adapter throws `NotImplementedError("pending API contract sign-off")`.
  - `packages/mock-backend` — in-process store with `MockStore`, `scenarioRules`, `BroadcastChannel('setu-mock')` cross-tab sync, dev relay on port 5199.
  - `packages/ui` — React 19 component kit with `<SyncStatusBadge>`, `<AppShell>`, `<Panel>`, `<Badge>`, `<Button>`, `<Field>`, `<OnlineIndicator>`.
  - Seed scenario: Guwahati, Assam (~26.14N, 91.73E), roads R1–R10, settlements S1–S6, shelters SH1–SH3, routes EVAC-1/2/3.
- Docs: `frontend/docs/API_CONTRACT.md` (DRAFT wire contract for backend review), `frontend/docs/TEST_IDS.md` (data-testid contract for QA + dev ports).

## What frontend needs from backend (open questions)

| OQ | Topic | Blocker? |
|---|---|---|
| OQ-01 | Wire event format: FieldEvent vs internal envelope | Yes — translation layer needed |
| OQ-08 | Version semantics (global counter, acceptedAtVersion) | Yes — needed for `subscribe()` |
| OQ-09 | Conflict rules (blockage vs cleared) | Yes — for `conflict` acks |
| OQ-07 | Subscribe mechanism (polling fallback OK for G1) | Yes — `http` adapter stub |

## For OpenCode backend agent

- Your `@setu/contract` zod schemas are authoritative for wire field names — do not change without PR review.
- Backend implements `/api/v1/events:batch`, `/api/v1/events/status`, `/api/v1/projections`, `/api/v1/events`, `/api/v1/stream`.
- Translation: wire `clientEventId` (UUID) → internal `id` (ULID); wire `occurredAt` (ISO) → internal `at` (epoch ms); wire `lat`/`lng` (floats) → internal microdegrees; wire `depthCm`/`levelCm` (floats) → internal decimetres.
- `acceptedAtVersion` = version AFTER event is applied; `getProjections(sinceVersion)` returns full snapshot.

## For Karthik's data/QA agent

- Seed scenario is Guwahati (not Majuli) — frontend keeps its own fixture until Majuli artifacts integrate.
- Dev ports: field=5173, command=5174, mock relay=5199.
- Mock failure toggles via URL `?mock=offline`, `?mock=latency:800,...`, `?mock=off`.