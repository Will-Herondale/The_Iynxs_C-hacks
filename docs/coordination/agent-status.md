# SETU — Agent Coordination Status

Single source of truth for who is doing what and where each agent's work lives. Update when a branch lands, a package is added, or a milestone is reached.

Maintained by: backend orchestrator. Read by: both AI agents and the three humans.

## 1. Agent map

| Agent | Human | Scope | Primary branch | Working directory |
|---|---|---|---|---|
| Backend orchestrator (me) | Technical lead | Backend, event infrastructure, fold, flood, routing, decision engine | `planning/architecture` | `packages/core`, `packages/server`, `packages/geo` |
| Frontend agent (Darsh's Claude) | Darsh | Frontend, field app, command centre, browser persistence, offline queue | `frontend/main` | `frontend/` |
| Data / QA / presentation | Karthik | Geographic datasets, preprocessing, scenarios, validation, docs, deck | (none yet) | `data/`, `tests/e2e/`, `docs/presentation/` |

## 2. Branch state

| Branch | Last commit | Summary |
|---|---|---|
| `main` | `f2ff75a` Initial commit | Protected default. Empty except LICENSE + README. |
| `planning/architecture` | `618f89e` planning docs | All planning docs (docs/00–11). No application code. |
| `coordination/team-handoff` | `63e8b84` coordination: publish Majuli district audit results | Adds docs/research/district-selection-audit.md. Majuli recommended for demo district. OQ-02 pending technical lead decision. |
| `coordination/integration-handoff` | `NEW` backend↔frontend integration contract | NEW BRANCH — dedicated channel for backend↔frontend integration. Contains docs/coordination/integration-handoff.md — the stable API contract both agents must follow. |
| `frontend/main` | `6059fc88` shared test-id + dev-port contract | Frontend monorepo: contract, api-client, mock-backend, ui. Merged `frontend/team-platform`. |
| `frontend/team-platform` | `589ab33` integrate mock-backend | Merged into `frontend/main`. |

## 3. Directory ownership (file-disjoint)

| Directory | Owner | Other agent may touch? |
|---|---|---|
| `docs/` | Both | Yes — via PR/comment, never force-push |
| `docs/coordination/` | Both (shared) | Yes — this is the communication channel |
| `docs/00–11/` | Backend orchestrator | Read-only for frontend; propose changes via `docs/coordination/open-questions.md` |
| `frontend/` | Frontend agent | Backend read-only; do not modify |
| `packages/core`, `packages/server`, `packages/geo` | Backend orchestrator | Frontend read-only |
| `data/`, `tests/e2e/` | Karthik | Both read-only until Karthik lands artifacts |

## 4. Work state

- **Frontend:** contract schemas (zod), API client interface, mock in-process backend, dev relay, seed scenario (Guwahati), UI component kit. `http` adapter throws `NotImplementedError` pending contract sign-off. Apps (`apps/field`, `apps/command`) not yet scaffolded.
- **Backend:** packages/core complete (event envelope, HLC, canonical JSON, content hash, version vector, sync ingest with hole healing, project/flood, project/network, project/people, route/dag, route/latest-departure, route/cutoff — 66 tests passing across 11 test files). packages/server complete (/api/v1/events:batch, /api/v1/events/status, /api/v1/projections, /api/v1/events, /api/v1/stream, EventLog JSONL, translation layer, CORS, health). Next: packages/geo Python builder (waiting on Karthik artifacts), deterministic event fold integration.
- **Karthik:** GIS district-selection audit complete for Majuli, Jagatsinghpur, Alappuzha. Results in docs/research/district-selection-audit.md. Majuli recommended (verified DEM downloadable, river-island "cut off" literal). Jagatsinghpur fallback. OQ-02 pending technical lead decision.

## 5. Communication rule

Never silently modify a contract the other agent is implementing. Propose changes in `docs/coordination/open-questions.md`, resolve in `docs/coordination/decisions.md`, and reflect in `docs/coordination/integration-handoff.md`.
