# SETU — Decisions Log

Resolved coordination decisions. Moved here from `open-questions.md` when resolved. Format: `D-NN` — title — date — owner — decision — rationale.

## D-01 — District: Majuli, Assam (provisional)
**Date:** 2026-10-30
**Owner:** technical lead
**Decision:** Majuli is the demonstration district.
**Rationale:** Verified Copernicus GLO-30 tiles (N26E093/94, N27E093/94) download anonymously; river island makes "cut off" literal; small enough to compute on a laptop.
**Status:** Provisional pending technical lead confirmation.

## D-02 — Scope freeze
**Date:** 2026-10-30
**Owner:** technical lead
**Decision:** Flood-only, one district, no hydrodynamic solver, no live CWC API, no ML/LLM, no satellite ingestion, no traffic/congestion modelling, no photo storage.
**Rationale:** 48-hour constraint; keeps implementation tractable and claims defensible.
**Status:** Provisional pending technical lead confirmation.

## D-03 — Architecture: ADRs 1–9, TypeScript end-to-end
**Date:** 2026-10-30
**Owner:** technical lead
**Decision:** ADRs 1–9 approved. TypeScript for core fold + server + frontend; Python only for offline geographic artifact generation. JSONL append-only log. One fold shared by browser + server.
**Rationale:** Avoids two implementations of the determinism-critical fold; browser cannot run Python.
**Status:** Provisional pending technical lead confirmation.

## D-04 — G1 scope: core fold + sync harness with synthetic geography
**Date:** 2026-10-30
**Owner:** technical lead
**Decision:** Gate G1 requires core event fold + sync harness using synthetic geography. Geographic processing (Majuli DEM → HAND artifacts) proceeds independently and integrates later.
**Rationale:** Unblocks backend+frontend integration without waiting for Karthik's geo pipeline.
**Status:** Provisional pending technical lead confirmation.

## D-05 — Frontend owns client contract; backend owns wire translation
**Date:** 2026-10-30
**Owner:** both agents
**Decision:** `@setu/contract` zod schemas in `frontend/packages/contract/src` are authoritative for wire field names. Backend translates wire → internal envelope at `packages/server` API boundary. Frontend never computes projections.
**Rationale:** Frontend agent has already implemented the contract; backend adapts to it rather than forcing a rewrite.
**Status:** Resolved.

## D-06 — Guwahati seed retained for frontend; Majuli artifacts integrate later
**Date:** 2026-10-30
**Owner:** both agents
**Decision:** Frontend keeps its Guwahati seed scenario (`frontend/packages/mock-backend/src/seed/data.ts`) as its own fixture. Backend will publish Majuli synthetic/Majuli artifacts under `data/fixtures/` when Karthik delivers them. Backend is geography-configurable.
**Rationale:** Frontend already has a working demo scenario; rewriting it to Majuli now would waste time. Geographic separation is temporary.
**Status:** Resolved.

## D-07 — water_level accepted with datum calibration
**Date:** 2026-10-30
**Owner:** backend orchestrator
**Decision:** Backend accepts `water_level` events but requires gauge-zero vs DEM calibration before using `levelCm` for inundation. Raw `levelCm` never compared directly to DEM elevation (ADR-8 datum rule).
**Rationale:** Assam geoid undulation ~−60 m makes raw gauge-stage vs DEM comparison unsafe.
**Status:** Resolved (implementation pending Karthik's gauge data).

## D-08 — household_registration is separate from person registry
**Date:** 2026-10-30
**Owner:** backend orchestrator
**Decision:** `household_registration` (frontend type) and `person.register`/`match.*` (planning types) are parallel tracks in v1. Household registration is not auto-merged with person records. Cross-script matching is a later projection.
**Rationale:** Avoids scope creep; household registration is CRUD-level, person matching is the hard computational piece.
**Status:** Resolved.

## D-09 — Photo upload deferred
**Date:** 2026-10-30
**Owner:** technical lead
**Decision:** `photoRefs` remains a stub; no photo upload endpoint in 48-hour scope.
**Rationale:** "No photo storage" is in the cut list; not needed for demo beats.
**Status:** Resolved.

## D-10 — Auth/roster deferred to signing layer only
**Date:** 2026-10-30
**Owner:** backend orchestrator
**Decision:** Per-device Ed25519 keypair + signed genesis roster event is in scope for the log layer, but full authz/token flow is deferred. Frontend sends `reporterId`/`deviceId` as strings.
**Rationale:** Auth complexity not needed for demo; quarantine unverified events is sufficient.
**Status:** Resolved (deferred beyond G1).

## D-11 — Subscribe: polling fallback for G1
**Date:** 2026-10-30
**Owner:** both agents
**Decision:** `subscribe()` implemented via polling fallback for G1; WS/SSE considered post-hackathon.
**Rationale:** Simplest path to unblock frontend `http` mode.
**Status:** Resolved.

## D-12 — Version semantics: global monotonic counter
**Date:** 2026-10-30
**Owner:** both agents
**Decision:** `version` is a single global monotonic counter across all projections. `acceptedAtVersion` = version AFTER event is applied. `getProjections(sinceVersion)` returns a full snapshot.
**Rationale:** Matches frontend contract expectation; simplest to implement and reason about.
**Status:** Resolved.

## D-13 — Conflict rules: road_blockage vs road_cleared
**Date:** 2026-10-30
**Owner:** backend orchestrator
**Decision:** `road_blockage` on a road already reported `road_cleared` is a `conflict`. Backend matches frontend's default conflict rule. Other conflicts resolved by valid-time observation ranking (planning doc 03).
**Rationale:** Consistency between frontend mock rule and backend behavior.
**Status:** Resolved.

## D-14 — Clock skew: clamp + suspect_clock
**Date:** 2026-10-30
**Owner:** backend orchestrator
**Decision:** `occurredAt` clamped to `hlc.l + 5 min` on ingest; clamp sets `suspect_clock: true`. Suspect-clock observations are excluded from driving inundation.
**Rationale:** Prevents a wrong-clock device from flooding the map.
**Status:** Resolved.

## D-15 — Batch limits: 64 KB max event, 500 max per request
**Date:** 2026-10-30
**Owner:** backend orchestrator
**Decision:** 64 KB max event size, 500 max events per `submitEvents` request, per-device ignore switch for flood.
**Rationale:** Bounds malicious/buggy client impact.
**Status:** Resolved.
