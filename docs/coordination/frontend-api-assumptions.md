# Frontend → Backend: API assumptions and open questions

Author: frontend (Claude orchestrator). Status: **open, needs backend review**.

The full draft contract is at [`frontend/docs/API_CONTRACT.md`](../../frontend/docs/API_CONTRACT.md); the zod and TS source of truth is in `frontend/packages/contract/src/`. This file summarises what the frontend currently *assumes*, so the backend can confirm or correct it. When there's a disagreement, the backend mock contract wins and the frontend adapts. The user resolves architecture disputes.

## Repo state checked (2026-10-30)
- Remote branches: `main`, `frontend/main`, `frontend/team-platform`.
- `planning/architecture` does not exist yet. The frontend will read it once it's pushed and reconcile this doc with it.
- No backend directories or backend mock contract are on any branch yet.

## Ownership and branches
- The frontend works only in `frontend/` plus this coordination file. It never edits backend-owned files.
- Integration branch: `frontend/main`. Feature branches: `frontend/team-*`. PRs target `frontend/main`, and the frontend opens a PR to `main` once it's ready for review. Nothing is pushed to `main` directly.

## Assumptions (the frontend is built against these today, in mock mode only)
| # | Assumption | Where in code |
|---|---|---|
| A1 | Clients generate a UUID v4 `clientEventId`, which is also the idempotency key. Resubmitting it returns `duplicate` with the original `eventId`. | `contract/src/events.ts`, `sync.ts` |
| A2 | `submitEvents(batch)` returns one ack per item: `accepted` (with `eventId` and `acceptedAtVersion`), `duplicate`, `conflict` (with `reason` and `serverState?`) or `rejected` (with `errors[]`). | `contract/src/sync.ts` |
| A3 | **An accepted ack is not the same as synced.** An event counts as synced only when `getEventStatus` reports `applied` with `projectionVersion >= acceptedAtVersion`. | `isConfirmedSynced` |
| A4 | `acceptedAtVersion` is the projection version *after* the event is applied. Accepting does not bump the version. | mock-backend |
| A5 | Projections arrive as one `ProjectionSnapshot {version, flood, roads, settlements, routes, shelters}` of GeoJSON. The frontend never computes projections, routes or accessibility itself. | `contract/src/projections.ts` |
| A6 | `subscribe` pushes a version bump. The frontend then refetches `getProjections`, and falls back to polling if push isn't available. | `ApiClient` |
| A7 | Event types: `flood_report`, `road_blockage`, `road_cleared` (**frontend addition, needs approval**), `water_level`, `household_registration`. | `contract/src/events.ts` |
| A8 | `listEvents` returns applied events only. Pending ones are queried with `getEventStatus`. | mock-backend |
| A9 | Errors: network, timeout and 5xx are retryable (the client backs off). 4xx validation is not. | `contract/src/errors.ts` |

No REST or WS paths are implemented. The `http` adapter throws `NotImplementedError` until the backend publishes its contract or mock. The paths in `API_CONTRACT.md` §9 are **proposals only**.

## Open questions for backend
1. Event id format and stability. Can the client UUID be the primary key?
2. Version semantics: is there one global counter? Does `acceptedAtVersion` mean before or after apply? Do snapshots come whole or as deltas?
3. Conflict rules, and what `serverState` contains. How does a human resolve a conflict: by resubmitting a new event?
4. Offline-first auth: device registration, token lifetime, and how `reporterId` and `deviceId` are validated.
5. Photo upload flow and limits.
6. Pagination of the event feed: by cursor, or by `sinceVersion`.
7. Push transport (WS, SSE or poll) and how resume works after a reconnect.
8. Batch size and rate limits.
9. Clock skew: is `occurredAt` trusted, or is it supplemented with `receivedAt`?
10. Is `road_cleared` acceptable? Are other event types needed?
11. How long are `duplicate` lookups guaranteed?

## How to respond
Comment on the linked GitHub issue, or push a `docs/coordination/backend-*.md` reply. The frontend will update its contract package and reference the commit.
