# claude-darsh — Frontend status

Agent: Claude (frontend engineering lead, run as an orchestrator of Orca agent teams).
Owner of: the volunteer field app, the command centre and the camp interface. Everything lives under `frontend/`.
Last updated: 2026-10-30 (update 4: plan for the complete SETU frontend spec; contradictions and dependencies below).

## Update 4: implementation plan for the complete SETU frontend spec

### What I checked first
- `origin/main` still has only README and LICENSE.
- **None of the documents the spec cites exist on any branch:**
  - `docs/03-event-model.md`
  - `docs/04-sync-protocol.md`
  - `docs/07-api-contract.md`
  - `docs/coordination/integration-contract.md`
  - the `planning/architecture` branch
- No replies from OpenCode or Karthik's AI on #2, #5, #6 or #7.
- Existing frontend stack (unchanged): React 19 + Vite + TypeScript strict, npm workspaces, Dexie/IndexedDB, MapLibre GL, TanStack Query, Vitest and Playwright. Everything is in `frontend/`; see PR #14.

### Decisions from the human developer
1. **Map data waits for Karthik.** There is no Majuli fixture and no map or basemap rework until Karthik's assets are published (#7).
2. **Build only what the current contract supports.** No new contract or mock fields are added. Everything that needs more data is listed under "Blocked" and requested from OpenCode in the new issue.

### Plan: 4 agent teams, each with its own PRs into `frontend/main`
- **Wave A: design system** (`packages/ui`, `docs/DESIGN_SYSTEM.md`)
  - semantic colours: blue = water, red = impassable/critical, orange = warning, green = safe, grey = disconnected, purple = requires review;
  - locally bundled Inter and JetBrains Mono, with monospace for IDs and timestamps;
  - shared components: status, severity, event and observation cards, context panel, a sortable and searchable table, form field, confirm dialog, offline banner, sync summary, loading and error states.
- **Wave B: field app v3** (mobile-first)
  - Home, Report, Map, Households, Sync. Map is a placeholder until #7.
  - Report categories mapped onto existing event types.
  - GPS optional; accuracy shown; editable observation time.
  - A report detail and history screen.
  - A dedicated sync and activity screen.
  - Household search, history and a camp summary.
- **Wave B: command centre v3** (desktop-first, 1366×768 and 1920×1080)
  - Overview: counts taken only from projections, clickable alerts, recent events.
  - Live Map: unchanged for now.
  - Settlements table.
  - Routes & Evacuation, built from the existing route projection, including a "no safe route" state.
  - Reports & Events and Audit, with filters plus payload and resulting-change drill-down.
  - Panels label observed vs modelled flood data, with a model-limitations note.
- **Wave C: review and QA**
  - UI and accessibility (axe), offline behaviour, performance, and API-integration readiness.
  - End-to-end tests for the acceptance criteria the current contract supports: 1–9, 11, 13, and 10 in part.

### Contradictions with existing state or contracts
1. The spec cites `docs/03`, `04` and `07` and `integration-contract.md`, but none of them exist.
2. The spec's demo is set in **Majuli**, but the current mock is a hand-made **Guwahati** fixture. Map work is paused until Karthik publishes assets.
3. The command map currently loads **online OSM tiles**, which conflicts with "no external tile requests". It stays, labelled as a demo fixture, until Karthik's local basemap arrives.
4. The status vocabulary has changed between briefs. Frontend-only mapping (no contract change):

   | Internal state | Label |
   |---|---|
   | queued, offline | Saved locally |
   | queued, online | Waiting to sync |
   | sending, or accepted but not yet confirmed | Synchronising |
   | synced (server confirms the event is applied) | Accepted |
   | conflict | Requires review |
   | rejected | Rejected |
   | failed | Failed — retry available |

   A 2xx response alone never shows as "Accepted".
5. Camp mode shows shelter capacity and occupancy, but the spec says not to build capacity management unless the backend supports it. This is kept as a read-only, labelled projection display.
6. Duplicate-household detection and review has no owner and no contract. It's blocked, and the frontend never auto-matches or merges.
7. The hypothetical flood scenario API is not specified. It's blocked.

### Blocked, waiting on other agents
| Feature (spec section) | Waiting on |
|---|---|
| Majuli data, offline basemap, terrain/hillshade/rivers, field offline map, manual map location picker, observations layer, demo with no online tiles (§3.4, §4.2, demo step 1) | Karthik (#7) |
| "Damaged infrastructure" and "Other" report types; water "estimated vs measured"; obstruction types; observation validity period (§3.2, §4.2) | OpenCode (#15) |
| Household member names; duplicate detection, match proposals and review (§3.5, demo step 8) | OpenCode (#15) |
| Travel times, latest safe departure, reachable shelters, first segment to fail, recommended vs rejected alternatives (§4.2, §4.4, demo step 6) | OpenCode (#15) |
| Hypothetical scenario controls and projection comparison (§4.3, demo step 7) | OpenCode (#15) |
| District, simulation time and scenario name (§4.1) | OpenCode (#15) |
| Real API integration | OpenCode contract documents (#5) |

## Repo state I checked before publishing
- Remote branches: `main` (README and LICENSE only), plus `frontend/*`.
- **The following are not on GitHub yet:** `planning/architecture`, and `docs/coordination/{README,agent-status,ownership,integration-contract}.md` / `messages/`.
  - I'll read them as soon as they're pushed and reconcile with them. See issue #5.
- No backend contract or mock fixtures are published yet. Until they are, the frontend runs against its own **mock adapter behind a single `ApiClient` interface**. No endpoints are hard-coded.

## Branches and commits
| Branch | Purpose | Head / PR |
|---|---|---|
| `frontend/main` | Frontend integration branch. Every team PR merges here. | `762c5bd` |
| `frontend/team-platform` | Shared packages | PR #1 (merged) |
| `frontend/team-command` / `-v2` | Command centre, then explanations, deadlines and audit | PRs #3, #10 (merged) |
| `frontend/team-field` / `-v2` | Field app, then camp mode, bridges and status vocabulary | PRs #4, #11 (merged) |
| `frontend/team-scenario` | B1 demo scenario and status vocabulary UI | PR #9 (merged) |
| `frontend/team-qa` | 22-test Playwright suite | PR #12 (merged) |
| `frontend/team-release` | Bug fixes, IST times, the B1 demo e2e, DEMO.md | PR #13 (merged) |
| `coordination/claude-darsh` | This message, on `main` | PR #8 (open, docs only) |

Nothing gets pushed to `main` directly.

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
**Main demo works end to end** (screenshot: `frontend/apps/command/docs/demo.png`):
1. A volunteer reports **Bharalu Bridge (B1) submerged while offline**. The item shows **Saved on device**.
2. On reconnect it goes Submitted → **Accepted — awaiting confirmation** → **Confirmed**, and only once the server reports the event applied.
3. The command centre then shows:
   - B1 **impassable**, with a red ✕ on the map;
   - the flood area grown over it;
   - **Hatigaon (S4) cut off**, with *"Why cut off: Bharalu Bridge (B1) is submerged and EVAC-3 was the only road access"*;
   - an **evacuation deadline** countdown at critical priority;
   - **EVAC-3 refused**, with a reason;
   - a situation bar: *"Bharalu Bridge (B1) submerged → Hatigaon cut off → evacuate by 16:28"*.

**Field app:**
- Flood, road and bridge blockage (with cause), road-cleared and water-level reports, plus household registration.
- An IndexedDB queue with idempotent `clientEventId`.
- Automatic sync with backoff.
- Statuses: Saved on device, Queued for sync, Submitted, Accepted, Confirmed, Disputed, Rejected, Retrying.
- An offline banner, an offline cache for road, bridge and camp lists, and a PWA shell that works offline.

**Camp interface** (camp mode in the field app, `#/camp`):
- Choose the camp.
- Capacity and occupancy.
- Offline household registration that syncs the same way as reports.

**Command centre:**
- A map with flooded, blocked, safe and uncertain styling, and a legend.
- Bridges, cut-off settlements, and refused or recalculated routes.
- Why explanations and an evacuation deadline list.
- Per-feature provenance ("Based on these reports").
- An **audit view**: occurredAt vs receivedAt, reporter and device, strict status, and the features each event affected.

**Tests:**
- **165/165** unit and integration tests pass.
- **26/26** Playwright e2e tests pass, covering:
  - offline submission;
  - reconnect and auto-sync;
  - reload persistence;
  - duplicate submission (one event);
  - conflict → Disputed;
  - rejected → edit and resubmit;
  - 5xx and timeout → Retrying, then Confirmed;
  - the full cross-app B1 demo;
  - camp mode;
  - audit;
  - the PWA offline shell.

**Demo script:** [`frontend/docs/DEMO.md`](../../../frontend/docs/DEMO.md), with screenshots.

## API assumptions
See [`docs/coordination/frontend-api-assumptions.md`](../frontend-api-assumptions.md) (A1–A9) and issue #2. The key ones:
- the client UUID is the idempotency key;
- per-item acks;
- **an accepted ack is not the same as converged**: "confirmed" requires the server to report the event applied;
- projections come from the server as GeoJSON, and the frontend never computes them.

## Questions for OpenCode
Issues #2, #5 and #6 (none answered as of this update):
1. **#5:** where are `planning/architecture` and `docs/coordination/*`? They're still not on GitHub. I need the API contract and event model so I can re-align.
2. Are mock fixtures published? I'll switch the mock adapter to them.
3. **#6:** the demo uses these optional, backward-compatible fields: road `kind`, `passability` and `reason`; settlement `cutOffReason`, `evacuationDeadline` and `evacuationPriority`; route `refusal`; flood `confidence`; blockage `cause`; household `shelterId`. Please accept them, rename them or replace them. The frontend will adapt.
4. Is `sourceEventIds` on projection features the intended provenance link?
5. Does `acceptedAtVersion` mean the version after the event is applied? The "confirmed" logic depends on it (assumption A4).

## Questions for Karthik's AI
Issue #7 (unanswered): dataset area and CRS, stable feature IDs (bridges especially), file location, and flood observed vs modelled.

## Integration status
- **Mock only.** The `http` adapter throws `NotImplemented` until OpenCode publishes a contract. No endpoints have been invented.
- No backend or data-pipeline files have been touched.

## Next tasks
1. **Review:** the `frontend/main` → `main` PR is open for OpenCode. I won't merge it myself.
2. **Blocked on OpenCode (#5, #6, #2):** the published contract and event model. Once they're published I'll:
   - re-align `packages/contract`;
   - implement the `http` adapter;
   - run the e2e suite with `VITE_API_MODE=http`.
3. **Blocked on Karthik's AI (#7):** GIS fixtures, to replace the hand-made Guwahati seed map.
4. **Cosmetic:** fix spacing in the field queue row, and show field timestamps in IST.
