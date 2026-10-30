# SETU — PROJECT CONTEXT SUMMARY

## Current checkpoint — 2026-10-31

**The material below this checkpoint is a historical snapshot, not current status. In particular, its claims that the backend and tunnel are live and that the frontend HTTP adapter is a stub are outdated.**

- **Current focus:** GIS work is paused while the two agents establish communication.
- **Shared inbox:** [PR #28](https://github.com/Will-Herondale/The_Iynxs_C-hacks/pull/28). Darsh's agent had already replied there; OpenCode read it and [acknowledged it](https://github.com/Will-Herondale/The_Iynxs_C-hacks/pull/28#issuecomment-6531852602). A fresh acknowledgment from Darsh's agent is still awaited. Both agents must be prompted to check the thread; it is not a live, automatic connection.
- **Repository:** backend checkout was `coordination/integration-handoff` at `2096af9` when checked. The remote `frontend/main` was at `7a14660`; the reply branch was `coordination/claude-darsh-reply` at `bdef245`.
- **Frontend:** the HTTP adapter is implemented. Both apps use `VITE_API_URL`, defaulting to `http://localhost:8080`; do not ask Darsh to replace a stub.
- **Backend availability:** `http://127.0.0.1:8080/health` refused the connection, and the previously shared Cloudflare tunnel returned HTTP 502 when checked. No working public URL is currently confirmed. The source entry point `packages/server/src/run.ts` exists, but the server was not started in this check.
- **Outstanding:** Darsh reported integration problems in [issue #22](https://github.com/Will-Herondale/The_Iynxs_C-hacks/issues/22) and requested route provenance in [issue #26](https://github.com/Will-Herondale/The_Iynxs_C-hacks/issues/26). Later backend fixes exist, but their effectiveness was not reverified in this check. Prior test counts are historical, not freshly verified.
- **Working-tree caution:** prior troubleshooting altered generated `packages/server/dist/server/src/*.js` files; do not rely on them without rebuilding and checking. The working tree also has a modified `frontend/package-lock.json` and untracked files; preserve them pending review.

---

## Historical snapshot — status below may be stale

**Date:** 2026-10-30  
**Branch:** `coordination/integration-handoff` (pushed to GitHub)  
**Commit:** `67e7991`

---

## TEAM & ROLES

| Agent | Human | Scope | Branch | Working Dir |
|---|---|---|---|---|
| OpenCode (backend orchestrator) | Technical lead | Backend, event infra, fold, flood, routing, decision engine | `coordination/integration-handoff` | `packages/core`, `packages/server`, `packages/geo` |
| Darsh's Claude | Darsh | Frontend, field app, command centre, browser persistence, offline queue | `frontend/main` | `frontend/` |
| Karthik (data/QA) | Karthik | Geographic datasets, preprocessing, scenarios, validation | (none yet) | `data/`, `tests/e2e/`, `docs/presentation/` |

---

## BACKEND STATE — LIVE

### Server Status
- **Running on:** `http://localhost:8080` (local) 
- **Public URL (Cloudflare Tunnel):** `https://marc-followed-equal-broadway.trycloudflare.com`
- **Health check:** `GET /health` → `{"ok":true,"eventCount":0,"projectionVersion":0}`

### Endpoints (all working)
- `POST /api/v1/events:batch` — submit field events → `{ acks: SubmitAck[] }`
- `POST /api/v1/events/status` — get event status → `{ statuses: EventStatus[] }`
- `GET /api/v1/projections?sinceVersion=` — projection snapshot (GeoJSON FeatureCollections)
- `GET /api/v1/events?sinceVersion=&limit=&type=` — list event records
- `GET /api/v1/stream` — SSE version bumps
- `GET /api/v1/health` — health check
- CORS enabled (`Access-Control-Allow-Origin: *`)

### `packages/core` (66 tests passing, 11 test files)
- `src/event/ulid.ts` — ULID v1 generation
- `src/event/hlc.ts` — Hybrid Logical Clock
- `src/event/canonical.ts` — Canonical JSON (integers only, no floats)
- `src/event/content-hash.ts` — SHA-256 over canonical JSON
- `src/event/envelope.ts` — Envelope type, creation, validation, happensBefore, totalOrder
- `src/sync/version-vector.ts` — Version vector operations
- `src/sync/types.ts` — SyncRequest/SyncResponse/SyncState
- `src/sync/ingest.ts` — Sync ingest (duplicate delivery, hole healing, collision detection, 64KB max event size)
- `src/project/network.ts` — Road state projection with valid-time observations + disputed flag
- `src/project/flood.ts` — HAND inundation projection
- `src/project/people.ts` — Cross-script person matching
- `src/route/dag.ts` — Time-expanded DAG routing with node waiting
- `src/route/latest-departure.ts` — Reverse sweep latest-safe-departure
- `src/route/cutoff.ts` — Settlement reachability and cut-off
- `src/index.ts` — Public exports

### `packages/server` (running)
- `src/server.ts` — HTTP server on port 8080 with all 6 endpoints
- `src/event-log.ts` — Append-only JSONL log, in-memory indices, hole healing, duplicate detection
- `src/translation.ts` — Wire format (FieldEvent) → internal envelope (Envelope)
- `src/projection.ts` — Deterministic projection fold
- `src/contract-types.ts` — Contract type definitions
- `src/run.ts` — Server entry point (run with `npx tsx src/run.ts`)

---

## FRONTEND STATE (DARSH'S AGENT)

**Branch:** `frontend/main` — NOT updated since `6059fc88`

### What frontend has:
- `packages/contract` — zod schemas for `FieldEvent`, `SubmitAck`, `EventStatus`, `ProjectionSnapshot`, `EventRecord`, `ApiClient` interface
- `packages/api-client` — `createApiClient({mode:'mock'|'http'})`; `http` adapter throws `NotImplementedError("pending API contract sign-off")`
- `packages/mock-backend` — in-process store, dev relay port 5199, Guwahati seed scenario
- `packages/ui` — React 19 component kit
- Dev ports: field=5173, command=5174, relay=5199

### What frontend NEEDS to do:
Switch `VITE_API_MODE` from `'mock'` to `'http'` and point at the backend URL.

**Local URL (same network):** `http://192.168.1.7:8080`
**Public URL (any network):** `https://marc-followed-equal-broadway.trycloudflare.com`

---

## COMMUNICATION CHANNELS

| File | Purpose | Owner |
|---|---|---|
| `docs/coordination/integration-handoff.md` | Stable frontend↔backend wire contract | Both agents |
| `docs/coordination/agent-status.md` | Who's doing what, branch state | OpenCode updates |
| `docs/coordination/open-questions.md` | Unresolved items (OQ-01 to OQ-14) | Both agents |
| `docs/coordination/decisions.md` | Resolved decisions (D-01 to D-15) | Both agents |
| `docs/coordination/messages/opencode.md` | Backend agent notes | OpenCode |
| `docs/coordination/messages/claude-darsh.md` | Frontend agent notes | Darsh's agent |
| `docs/coordination/messages/agent-karthik.md` | Data/QA agent notes | Karthik's agent |

**COMMUNICATION RULE:** Never silently modify a contract the other agent is implementing. Propose changes in `open-questions.md`, resolve in `decisions.md`, update `integration-handoff.md`.

---

## DECISIONS MADE (D-01 to D-15)

| ID | Decision | Status |
|---|---|---|
| D-01 | District: Majuli, Assam | Provisional |
| D-02 | Scope: flood-only, one district, no hydrodynamic solver, no live CWC API, no ML/LLM, no satellite | Provisional |
| D-03 | Architecture: ADRs 1-9, TypeScript end-to-end | Provisional |
| D-04 | G1: core fold + sync harness with synthetic geography | Provisional |
| D-05 | Frontend owns client contract; backend does wire translation | Resolved |
| D-06 | Guwahati seed retained for frontend; Majuli artifacts integrate later | Resolved |
| D-07 | water_level accepted with datum calibration | Resolved |
| D-08 | household_registration separate from person registry | Resolved |
| D-09 | Photo upload deferred | Resolved |
| D-10 | Auth/roster deferred | Resolved |
| D-11 | Subscribe: polling fallback for G1 | Resolved |
| D-12 | Version semantics: global monotonic counter | Resolved |
| D-13 | Conflict rules: road_blockage vs road_cleared | Resolved |
| D-14 | Clock skew: clamp + suspect_clock | Resolved |
| D-15 | Batch limits: 64KB max event, 500 max per request | Resolved |

---

## OPEN QUESTIONS (OQ-01 to OQ-14)

Key ones blocking integration:
- **OQ-01:** Wire event format — wire uses `FieldEvent` (UUID, ISO, floats), internal uses ULID/HLC/integers. Translation layer handles this. ✅ RESOLVED IN CONTRACT
- **OQ-07:** Subscribe mechanism — polling fallback agreed for G1 ✅ RESOLVED
- **OQ-08:** Version semantics — global counter, acceptedAtVersion = version AFTER apply | ✅ RESOLVED
- **OQ-09:** Conflict rules — road_blockage on cleared road = conflict ✅ RESOLVED
- **OQ-02:** District — Majuli recommended, awaiting technical lead confirmation | PENDING

---

## IMMEDIATE NEXT STEPS

1. **Darsh's agent:** Switch `VITE_API_MODE` to `'http'`, point at backend URL (public: `https://marc-followed-equal-broadway.trycloudflare.com`), test event submission and projection retrieval
2. **Backend:** Server is running and responding to requests ✅
3. **Both agents:** Verify end-to-end: submit event → see in projections → check event status
4. **Karthik:** Produce Majuli geo artifacts (DEM → HAND, road graph, settlements, shelters)

---

## FILES OF INTEREST

- `docs/coordination/integration-handoff.md` — THE contract
- `docs/coordination/agent-status.md` — Who's doing what
- `docs/coordination/open-questions.md` — What's unresolved
- `docs/coordination/decisions.md` — What's decided
- `packages/server/src/server.ts` — Backend HTTP server
- `packages/core/src/` — Core event/fold logic
- `frontend/packages/contract/src/` — Frontend contract schemas (authoritative for wire format)
- `frontend/packages/api-client/src/http.ts` — HTTP adapter (currently throws NotImplementedError)
- `data/majuli/` — GIS artifacts (in progress by Karthik)

---

## COMMUNICATION PROTOCOL

1. Never silently modify a contract the other agent implements
2. Propose changes in `open-questions.md`
3. Resolve in `decisions.md`
4. Update `integration-handoff.md`
5. `git fetch` before integrating other agent's branch
6. Update `agent-status.md` on milestones
7. Use PRs for cross-agent code changes

---

## PUBLIC TUNNEL (CLOUDFLARE)

**Backend URL for Darsh's frontend (any network):**
`https://marc-followed-equal-broadway.trycloudflare.com`

**Local URL (same network):**
`http://192.168.1.7:8080`

**Tunnel process:** Running in background via `cloudflared.exe`
**Tunnel will remain active as long as the cloudflared process is running.**

---

## MESSAGE TO DARSH'S AGENT

> **Backend is LIVE and ready for integration.**
>
> **Public URL (use this):** `https://marc-followed-equal-broadway.trycloudflare.com`
> **Local URL (same network):** `http://192.168.1.7:8080`
>
> **What to do:**
> 1. Switch `VITE_API_MODE` from `'mock'` to `'http'` in your frontend apps
> 2. Point your API client at `https://marc-followed-equal-broadway.trycloudflare.com`
> 3. Read the contract: `docs/coordination/integration-handoff.md` on branch `coordination/integration-handoff`
> 4. Test: submit a `flood_report` via field app, then call `/api/v1/projections` to see inundation update
>
> **Endpoints:**
> - `POST https://marc-followed-equal-broadway.trycloudflare.com/api/v1/events:batch`
> - `POST https://marc-followed-equal-broadway.trycloudflare.com/api/v1/events/status`
> - `GET https://marc-followed-equal-broadway.trycloudflare.com/api/v1/projections?sinceVersion=`
> - `GET https://marc-followed-equal-broadway.trycloudflare.com/api/v1/events`
> - `GET https://marc-followed-equal-broadway.trycloudflare.com/api/v1/stream`
> - `GET https://marc-followed-equal-broadway.trycloudflare.com/api/v1/health`
>
> **CORS is enabled** — all origins allowed.
>
> Let me know once `http` mode is working or if you hit any issues.
