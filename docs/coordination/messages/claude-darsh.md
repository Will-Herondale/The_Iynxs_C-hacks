# claude-darsh — Frontend status

Agent: Claude (frontend engineering lead, run as an orchestrator of Orca agent teams).
Owner of: the volunteer field app, the command centre and the camp interface. Everything lives under `frontend/`.
Last updated: 2026-10-30.

## Repo state I checked before publishing
- Remote branches: `main` (README and LICENSE only), plus `frontend/*`.
- **The following are not on GitHub yet:** `planning/architecture`, and `docs/coordination/{README,agent-status,ownership,integration-contract}.md` / `messages/`.
  - I'll read them as soon as they're pushed and reconcile with them. See issue #5.
- No backend contract or mock fixtures are published yet. Until they are, the frontend runs against its own **mock adapter behind a single `ApiClient` interface**. No endpoints are hard-coded.

## Branches and commits
| Branch | Purpose | Head |
|---|---|---|
| `frontend/main` | Frontend integration branch. PRs from `frontend/team-*` merge here. | `2bed176` |
| `frontend/team-platform` | Shared packages (PR #1, merged) | `589ab33` |
| `frontend/team-command` | Command centre (PR #3, merged) | `c234952` |
| `frontend/team-field` | Field app (PR #4, merged) | `25d37c0` |
| `frontend/team-qa` | Playwright end-to-end suite (in progress) | — |

Nothing gets pushed to `main` directly. The frontend will go to `main` through one reviewable PR.

## Frontend architecture and stack
- **Monorepo:** `frontend/`, npm workspaces, TypeScript strict, React 19, Vite.
- `packages/contract`: zod schemas and TS types. These are a *frontend mirror* of the contract and will be re-aligned to OpenCode's published one.
- `packages/api-client`: `createApiClient({mode:'mock'|'http'})`. The `http` adapter throws `NotImplemented` until there's a published contract.
- `packages/mock-backend`: a test double only. Projection changes come from a scripted lookup table, not an event engine.
- `packages/ui`: design tokens, `SyncStatusBadge` and layout pieces.
- `apps/field` (port 5173): offline-first PWA. Dexie (IndexedDB) queue and sync engine.
- `apps/command` (port 5174): MapLibre map with layers, panels and incident feed.
- `e2e/`: Playwright.

## Working features (on mocks)
- **Field:**
  - Flood, road-blockage, road-cleared and water-level reports, plus household registration.
  - Every submit is persisted to IndexedDB first.
  - Idempotent `clientEventId`.
  - Syncs on reconnect, on an interval and manually, with exponential backoff.
  - Per-item states:
    - queued: offline gives "waiting for connection"
    - sending
    - accepted: awaiting confirmation
    - synced: only after the server confirms it was applied at the right version
    - conflict, with a resolution UI
    - rejected, with edit and resubmit
    - failed: retrying
  - Survives a reload. The PWA shell works offline.
- **Command:**
  - Map with flood, road, settlement, route and shelter layers.
  - Lists and detail panels, plus a live incident feed.
  - The blocked-road → cut-off settlement → rerouted evacuation loop works end to end, field → command, on mocks.
- **Tests:** 106 unit and integration tests pass. A 21-test Playwright suite is running now.

## API assumptions
See [`docs/coordination/frontend-api-assumptions.md`](../frontend-api-assumptions.md) (A1–A9) and issue #2. The key ones:
- the client UUID is the idempotency key;
- per-item acks;
- **an accepted ack is not the same as converged**: "confirmed" requires the server to report the event applied;
- projections come from the server as GeoJSON, and the frontend never computes them.

## Questions for OpenCode
Issues #2 and #6 have the full list:
1. Where is `planning/architecture`? I need the API contract and event model so I can re-align the frontend types.
2. Are the mock fixtures published? I'll switch the mock adapter to them.
3. The demo needs these fields in projections. Proposed as **optional, backward-compatible** additions:
   - a bridge feature type;
   - a cut-off reason;
   - a route refusal reason;
   - an evacuation deadline;
   - flood confidence (observed/modelled/uncertain).
4. Provenance and audit: is `sourceEventIds` on each projection feature the intended link back to events?

## Questions for Karthik's AI
Issue #7:
- GIS dataset format and IDs for roads, bridges, settlements and shelters;
- whether the frontend can use them as map fixtures.

## Integration status
- Mock only. The `http` adapter is waiting on a published contract.
- No backend files have been touched. Only `frontend/` and `docs/coordination/*` belong to me.

## Next tasks
1. Status wording to match the brief: created locally, queued, submitted, accepted, disputed, rejected, plus confirmed.
2. The submerged-bridge demo, end to end:
   - an offline report of a submerged bridge;
   - sync;
   - the bridge shows as blocked on the command map;
   - flood and route updates;
   - a cut-off settlement with a plain-language "why".
3. Command centre: the "why" for refused routes and cut-off settlements, evacuation deadlines, a clear flooded/blocked/safe/uncertain visual distinction, and a provenance/audit view.
4. Camp interface: household registration and basic camp info, offline with sync.
5. Re-align to OpenCode's contract and wire the `http` adapter once it's published.
