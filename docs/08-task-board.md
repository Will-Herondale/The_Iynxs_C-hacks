# 08 — Human Task Board

Owners: **lead** (backend + core fold), **Darsh** (frontend), **Karthik** (data + QA + presentation). No task has shared file ownership.

## Phase 0 — Foundation (hours 0–6)

| # | Task | Owner | Depends | Deliverable | Acceptance criteria | Est. |
|---|---|---|---|---|---|---|
| T0 | Scaffold monorepo, package layout, CI-free build scripts | lead | — | `packages/core`, `packages/server`, `packages/web`, `packages/geo` skeletons; `npm install` + `py` venv on lead machine | `npm run build` in core + web passes; `py packages/geo/build.py --dry-run` prints manifest | 1 h |
| T1 | Event envelope, HLC, canonical JSON, ULID, content-hash | lead | T0 | `packages/core/src/event/*` | unit test: hash stable across JS locales; float rejection in payload validator | 2 h |
| T2 | Version-vector sync protocol (pull+push) | lead | T0 | `packages/core/src/sync/*`, server `/sync` | convergence harness green (see 04, §8); 3 negative controls red | 3 h |
| T3 | DEM → HAND artifact pipeline | Karthik | T0 | `packages/geo/build.py`, `data/artifacts/hand.bin`, `drain_elev.bin`, `reach_id.bin`, manifest | pipeline runs < 60 s on 1 M cells; HAND min/max sane; zero-cells repaired; manifest hashes committed | 4 h |
| T4 | OSM → road graph + settlements + shelters | Karthik | T0 | `data/artifacts/graph.json`, `settlements.json`, `shelters.json` | graph < 10 k edges; Majuli road/ferry edges present (Nimati–Kamalabari crossing modelled as time-varying ferry edge); villages ≥ 50 with coords; shelters ≥ 5; artifacts committed | 4 h |
| T5 | Route DAG, latest-safe-departure, cut-off sweep | lead | T0,T4 | `packages/core/src/route/*` | exact_replay assert passes; golden 4-node blockage toy correct; 20-shelter sweep < 1 s | 3 h |
| T6 | Flood projection: stage → inundation over HAND | lead | T3 | `packages/core/src/project/flood.ts` | monotonicity + connectivity invariants pass; per-stage < 200 ms | 2 h |
| T7 | Mock API + frontend scaffolding | Darsh | T0 | `packages/web/mock-api.ts`, Vite + MapLibre scaffold, local basemap image | `npm run dev` serves map with hillshade basemap + road GeoJSON layer | 3 h |

Gate G1 at hour 6: **geography + core fold + mock API all run.** If T3/T4 slip, fall back to synthetic fixtures (a 40×40 grid "island" in `data/fixtures/synthetic.json`) so the rest of the build is not blocked.

## Phase 1 — Projections (hours 6–18)

| # | Task | Owner | Depends | Deliverable | Acceptance criteria | Est. |
|---|---|---|---|---|---|---|
| T8 | Road-state projection (valid-time selection, disputed flag) | lead | T2,T4 | `packages/core/src/project/network.ts` | golden test: concurrent disagreeing reports → disputed, never free | 2 h |
| T9 | Registry + cross-script matching | lead | T2 | `packages/core/src/project/people.ts` | match.propose score on Bengali+Devanagari test pair ≥ threshold; review UI data shape ready | 3 h |
| T10 | Decision projection (reachability, cut-off) | lead | T5,T6,T8 | `packages/core/src/project/decision.ts` | cut-off list names first-submerging segment and deadline for each settlement | 2 h |
| T11 | Sync hub server (Node, JSONL log, WAL-append equivalent) | lead | T2 | `packages/server/server.ts` | serves /sync, /projection/*, /health; survives crash-restart with intact log | 3 h |
| T12 | Field app UI: offline report + local log | Darsh | T7,T2 | field-report form, IndexedDB log, offline indicator | report created offline appears in local queue; syncs when online | 4 h |
| T13 | Camp app UI: household registration | Darsh | T7,T2 | registration form (multi-script name), camp list | name stored in all entered scripts; matches surfaced as proposals | 4 h |
| T14 | Console UI: map + inundation + routing | Darsh | T7,T6,T5 | map with basemap, roads, stage slider, route drawer | raising stage turns roads impassable and greys cut-off settlements | 5 h |
| T15 | Audit/replay view | Darsh | T2 | event log table, replay slider, revision banner | replaying events regenerates identical projection hash | 2 h |

## Phase 2 — Integration and demo (hours 18–36)

| # | Task | Owner | Depends | Deliverable | Acceptance criteria | Est. |
|---|---|---|---|---|---|---|
| T16 | End-to-end scenario A (rising water → cut-off → reroute → match → sync → converge) | all | T8–T15 | committed `data/fixtures/scenario-a.json` + e2e test | 5-replica partition test green; demo narrative runs < 5 min | 4 h |
| T17 | Convergence fuzz harness on stage (negative controls included) | lead | T2 | `packages/core/test/convergence.test.ts` | one green + three red runs per CI invocation | 2 h |
| T18 | Polish: disputed badge, quarantine pane, revision banner | Darsh | T12–T15 | UI completes | disputed edge renders contested; unverified events quarantined | 3 h |
| T19 | Presentation deck + demo script | Karthik | T16,T18 | `docs/presentation/`, rehearsed script | 15-second problem statement understood; demo beats named | 3 h |
| T20 | Dry-run rehearsal (all three) | all | T18,T19 | full demo executed once | all demo beats work; rollback plan for each beat documented | 2 h |

Gate G2 at hour 36: **full demo runs end-to-end once.** Remaining 12 hours = buffer + judge prep.

## Phase 3 — Buffer and final (hours 36–48)

| # | Task | Owner | Depends | Deliverable | Est. |
|---|---|---|---|---|---|
| T21 | Fix whatever failed at G2 | owner of failure | T16–T20 | green demo | 4 h |
| T22 | README, limits section, datum caveat slide | Karthik | T21 | honest limitations documented | 2 h |
| T23 | Final rehearsal + submit | all | T21 | ready | 2 h |
| — | Unallocated buffer | all | — | — | 4 h |

## 9. Mock-dependency rule

Darsh never imports `packages/core` directly at build time; he imports `mock-api.ts` only. The switch to the real backend is a single file edit in `packages/web/src/api.ts`. This keeps frontend work independent of backend implementation until integration week.

## 10. Estimated totals

- lead: ~19 h (core fold, sync, routing, flood, decision, server, fuzz)
- Darsh: ~18 h (mock API, field, camp, console, audit UI)
- Karthik: ~11 h (geo pipeline, fixtures, e2e, deck, rehearsal)
- Shared buffer: 12 h
