# SETU — Design Decisions

This document records the architectural decisions made for SETU, following the format:
- **Decision**: What was decided
- **Rationale**: Why this decision was made
- **Alternatives Considered**: Other options evaluated
- **Trade-offs**: What was gained and what was sacrificed
- **Status**: Current implementation status

---

## D-01 — District: Majuli, Assam

**Decision**: Majuli is the demonstration district for SETU.

**Rationale**:
- Verified Copernicus GLO-30 tiles download anonymously (N26E093, N26E094, N27E093, N27E094)
- River island makes "cut off" literal — settlements can be genuinely cut off from shelters
- Small enough (~798 km²) to compute on a laptop
- Weighted audit score: 2.90 (highest among candidates)

**Alternatives Considered**:
- Jagatsinghpur, Odisha (score 2.85)
- Alappuzha, Kerala (score 2.55 — rejected due to DSM elevation error on sea-level plain)

**Trade-offs**:
- Majuli's river island geography makes cut-off scenarios literal and dramatic
- Flat terrain means HAND discrimination is limited (95% of island at HAND=0)
- Flood-only scope limits scope creep

**Status**: Resolved (provisional, pending technical lead confirmation)

---

## D-02 — Scope Freeze

**Decision**: Flood-only, one district (Majuli), no hydrodynamic solver, no live CWC API, no ML/LLM, no satellite ingestion, no traffic/congestion modelling, no photo storage.

**Rationale**:
- 48-hour hackathon constraint
- Keeps implementation tractable
- Prevents scope creep
- Focus on core disaster response workflow

**Alternatives Considered**:
- Multi-hazard platform (rejected — too broad)
- Live government API integration (rejected — reliability concerns)
- ML/LLM chatbot (rejected — not needed for core workflow)
- General traffic modelling (rejected — too complex)

**Trade-offs**:
- Limited to flood hazard only
- No real-time data
- No photo evidence
- No truck-specific routing

**Status**: Resolved

---

## D-03 — Architecture: TypeScript End-to-End

**Decision**: TypeScript for all code (backend, frontend, core logic). Python only for offline GIS artifact generation.

**Rationale**:
- Single type system across frontend, backend, and core logic
- Browser cannot run Python
- Type safety catches contract mismatches at compile time
- Shared types between frontend and backend

**Alternatives Considered**:
- Python backend + TypeScript frontend (rejected — type mismatch risk)
- Python end-to-end (rejected — browser cannot run Python)
- Multiple languages (rejected — integration complexity)

**Trade-offs**:
- TypeScript learning curve for team members
- Single language constraint
- Python needed for GIS preprocessing (acceptable — offline only)

**Status**: Resolved (provisional)

---

## D-04 — G1 Scope: Core Fold + Sync Harness with Synthetic Geography

**Decision**: Gate G1 requires core event fold + sync harness using synthetic geography. Geographic processing proceeds independently and integrates later.

**Rationale**:
- Unblocks backend/frontend integration without waiting for Karthik's geo pipeline
- Synthetic geography is sufficient for demonstrating core workflow
- Geographic artifacts proceed independently

**Alternatives Considered**:
- Wait for real geographic data before integration (rejected — blocks frontend development)
- Use only real data (rejected — not ready yet)

**Trade-offs**:
- Synthetic data doesn't represent real Majuli geography
- Integration tested with synthetic data first
- Real data integration deferred

**Status**: Resolved (provisional)

---

## D-05 — Frontend Owns Client Contract; Backend Does Wire Translation

**Decision**: @setu/contract zod schemas in frontend/packages/contract/src are authoritative for wire format. Backend translates wire → internal envelope at API boundary.

**Rationale**:
- Frontend agent has already implemented contract
- Backend adapts to frontend contract rather than forcing rewrite
- Clear separation of concerns

**Alternatives Considered**:
- Backend defines contract (rejected — frontend already implemented)
- Separate contract package (rejected — adds complexity)

**Trade-offs**:
- Backend must adapt to frontend changes
- Frontend owns contract evolution
- Backend translation layer adds complexity

**Status**: Resolved

---

## D-06 — Guwahati Seed Retained for Frontend; Majuli Artifacts Integrate Later

**Decision**: Frontend keeps Guwahati seed scenario as its own fixture. Backend publishes Majuli artifacts when Karthik delivers them. Backend is geography-configurable.

**Rationale**:
- Frontend already has working demo scenario
- Rewriting to Majuli now wastes time
- Geographic separation is temporary

**Alternatives Considered**:
- Rewrite frontend to Majuli immediately (rejected — wastes time)
- Wait for Majuli artifacts before frontend integration (rejected — blocks frontend)

**Trade-offs**:
- Frontend and backend use different geographies temporarily
- Integration testing uses synthetic geography
- Real geographic integration deferred

**Status**: Resolved

---

## D-07 — water_level Accepted with Datum Calibration

**Decision**: Backend accepts water_level events but requires gauge-zero vs DEM calibration before using levelCm for inundation. Raw levelCm never compared directly to DEM elevation.

**Rationale**:
- Assam geoid undulation ~-60 m makes raw gauge-stage vs DEM comparison unsafe
- Observations must be calibrated to DEM datum before use

**Alternatives Considered**:
- Accept raw gauge levels (rejected — unsafe due to datum mismatch)
- Reject water_level events (rejected — loses valuable data)

**Trade-offs**:
- Additional calibration step required
- Raw gauge data not directly usable
- Calibration data not yet available

**Status**: Resolved (implementation pending Karthik's gauge data)

---

## D-08 — household_registration Separate from Person Registry

**Decision**: household_registration (frontend type) and person.register/match.* (planning types) are parallel tracks in v1. Household registration is not auto-merged with person records. Cross-script matching is a later projection.

**Rationale**:
- Household registration is CRUD-level
- Person matching is the hard computational problem
- Avoids scope creep

**Alternatives Considered**:
- Merge household registration with person registry (rejected — too complex for v1)
- Skip household registration entirely (rejected — needed for evacuation tracking)

**Trade-offs**:
- Two separate person-related workflows
- Potential for duplicate person records
- Cross-script matching deferred

**Status**: Resolved

---

## D-09 — Photo Upload Deferred

**Decision**: photoRefs remains stub; no photo upload endpoint in 48-hour scope.

**Rationale**:
- "No photo storage" is in cut list
- Not needed for demo beats
- Reduces storage and security complexity

**Alternatives Considered**:
- Implement photo upload (rejected — out of scope)
- Store photo references only (rejected — no storage backend)

**Trade-offs**:
- No photo evidence in reports
- photoRefs field is stub only
- No visual verification of reports

**Status**: Resolved

---

## D-10 — Auth/Role Deferred to Signing Layer Only

**Decision**: Per-device Ed25519 keypair + signed genesis roster event is in scope for log layer, but full authz/token flow is deferred. Frontend sends reporterId/deviceId as strings.

**Rationale**:
- Auth complexity not needed for demo
- Quarantine unverified events is sufficient
- Reduces implementation complexity

**Alternatives Considered**:
- Full OAuth2 integration (rejected — too complex)
- Full RBAC system (rejected — overkill for demo)

**Trade-offs**:
- No auth verification
- reporterId/deviceId are self-reported
- No permission enforcement

**Status**: Resolved (deferred beyond G1)

---

## D-11 — Subscribe: Polling Fallback for G1

**Decision**: subscribe() implemented via polling fallback for G1. WS/SSE considered post-hackathon.

**Rationale**:
- Simplest path to unblock frontend http mode
- No WebSocket infrastructure needed
- Works over standard HTTP

**Alternatives Considered**:
- WebSocket implementation (rejected — adds complexity)
- Full SSE implementation (rejected — polling is sufficient for G1)

**Trade-offs**:
- Polling is less efficient than WebSocket
- Polling interval adds latency
- Simpler implementation

**Status**: Resolved

---

## D-12 — Version Semantics: Global Monotonic Counter

**Decision**: version is a single global monotonic counter across all projections. acceptedAtVersion = version AFTER event is applied. getProjections(sinceVersion) returns full snapshot.

**Rationale**:
- Matches frontend contract expectation
- Simplest to implement and reason about
- No distributed version complexity

**Alternatives Considered**:
- Per-origin version vectors (rejected — overkill for single server)
- Vector clocks for projections (rejected — overkill)

**Trade-offs**:
- Single counter limits scalability
- Simpler to reason about
- No distributed consensus needed

**Status**: Resolved

---

## D-13 — Conflict Rules: road_blockage vs road_cleared

**Decision**: road_blockage on a road already road_cleared is conflict. Other conflicts resolved by valid-time observation ranking.

**Rationale**:
- Consistency between frontend mock rule and backend behavior
- Clear conflict definition
- Valid-time ordering resolves other conflicts

**Alternatives Considered**:
- Last-writer-wins (rejected — loses information)
- Manual review for all conflicts (rejected — too slow)

**Trade-offs**:
- Clear conflict definition for one case
- Other conflicts resolved by timing
- Potential for missed conflicts in edge cases

**Status**: Resolved

---

## D-14 — Clock Skew: Clamp + suspect_clock

**Decision**: occurredAt clamped to hlc.l + 5 min on ingest. Clamp sets suspect_clock: true. Suspect-clock observations excluded from inundation.

**Rationale**:
- Prevents wrong-clock device from flooding map
- Clamp preserves event rather than rejecting
- suspect_clock flag warns consumers

**Alternatives Considered**:
- Reject out-of-clock events (rejected — loses data)
- Accept all events unmodified (rejected — unsafe)
- Complex clock skew correction (rejected — too complex)

**Trade-offs**:
- Some events marked suspect
- Clamp preserves data
- Simple implementation

**Status**: Resolved

---

## D-15 — Batch Limits: 64KB Max Event, 500 Max per Request

**Decision**: 64KB max event size, 500 max events per submitEvents request, per-device ignore switch for flood.

**Rationale**:
- Bounds malicious/buggy client impact
- Prevents memory exhaustion
- Limits single-client impact

**Alternatives Considered**:
- No limits (rejected — DoS vector)
- Stricter limits (rejected — limits legitimate use)

**Trade-offs**:
- Limits batch size
- Prevents abuse
- Slightly more complex client code

**Status**: Resolved

---

## Implementation Status

| Decision | Status | Notes |
|----------|--------|-------|
| D-01 District: Majuli | Provisional | Confirmed |
| D-02 Scope Freeze | Provisional | Implemented |
| D-03 TypeScript E2E | Provisional | Implemented |
| D-04 G1 Synthetic Geography | Provisional | Implemented |
| D-05 Frontend Owns Contract | Resolved | Implemented |
| D-06 Guwahati Seed Retained | Resolved | Implemented |
| D-07 water_level Datum Calibration | Resolved | Pending gauge data |
| D-08 Household Separation | Resolved | Implemented |
| D-09 Photo Upload Deferred | Resolved | Not implemented |
| D-10 Auth Deferred | Resolved | Not implemented |
| D-11 Polling Subscribe | Resolved | Implemented |
| D-12 Global Version Counter | Resolved | Implemented |
| D-13 Conflict Rules | Resolved | Implemented |
| D-14 Clock Skew Clamp | Resolved | Implemented |
| D-15 Batch Limits | Resolved | Implemented |
