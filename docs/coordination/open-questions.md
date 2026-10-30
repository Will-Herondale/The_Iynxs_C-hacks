# SETU — Open Questions (coordination)

Unresolved items requiring agreement between the backend orchestrator, frontend agent, Karthik, and/or the technical lead. Update as items are resolved; move resolved items to `decisions.md`.

Format: `OQ-NN` — title — owner — status — notes.

## OQ-01 — Wire event format: FieldEvent vs internal envelope
**Owner:** backend orchestrator + frontend agent
**Status:** open
**Notes:** Frontend submits `FieldEvent` (UUID v4 clientEventId, ISO occurredAt, floats lat/lng/depthCm/levelCm, photoRefs). Planning internal envelope uses ULID, HLC, vector clock, integer decimetres, no floats. Resolution: wire = `FieldEvent`; translation layer in `packages/server` converts to internal envelopes. The fold never sees floats or ISO strings.

## OQ-02 — Geography: Guwahati seed vs Majuli artifacts
**Owner:** technical lead + Karthik + frontend agent
**Status:** open
**Notes:** Frontend seed data is Guwahati, Assam (~26.14N, 91.73E), hand-drawn geometries, scripted scenario. Karthik/backend plan targets Majuli (~26.95N, 94.2E) with verified Copernicus GLO-30 tiles. Technical lead proposed Majuli for Q1 (provisional). Question: does backend support both geographies? Does frontend rework seed to Majuli or keep Guwahati for G1?

## OQ-03 — water_level gauge readings vs ADR-8 datum rule
**Owner:** backend orchestrator
**Status:** open
**Notes:** Frontend has `water_level` (gaugeId, levelCm, trend). ADR-8 says no raw gauge-stage vs DEM comparison (datum mismatch risk: ~−60 m geoid undulation in Assam). Proposed: backend accepts `water_level` but requires gauge-zero vs DEM calibration table (Karthik provides); raw `levelCm` never compared directly to DEM elevation. Confirm gauge calibration data availability.

## OQ-04 — household_registration vs person registry + cross-script matching
**Owner:** backend orchestrator
**Status:** open
**Notes:** Frontend submits `household_registration`. Planning has `person.register`/`person.sighting`/`match.*` events with cross-script matching. Are these the same thing? Does `household_registration` map to `person.register`, or are they parallel tracks? Confirm before backend implements people projection.

## OQ-05 — Photo upload endpoint
**Owner:** backend orchestrator
**Status:** open
**Notes:** Frontend `photoRefs` is a stub; upload undefined. Confirm whether photo upload is in 48-hour scope (planning says no photo storage — cut if behind schedule).

## OQ-06 — Auth / roster model
**Owner:** backend orchestrator
**Status:** open
**Notes:** Planning ADR: per-device Ed25519 keypair, signed genesis roster event, quarantine unverified events. Frontend sends `reporterId`/`deviceId` as strings with no token flow. Confirm whether roster/auth is in 48-hour scope or deferred.

## OQ-07 — Subscribe: WebSocket, SSE, or polling
**Owner:** backend orchestrator + frontend agent
**Status:** open
**Notes:** Frontend `ApiClient.subscribe(onChange)` needs a push mechanism. Proposed: polling fallback acceptable for G1; WS/SSE later. Confirm.

## OQ-08 — Version semantics
**Owner:** backend orchestrator + frontend agent
**Status:** open
**Notes:** Is `version` one global monotonic counter across all projections? Is `acceptedAtVersion` the version before or after the event is applied? Does `getProjections(sinceVersion)` return a full snapshot or delta? Planning doc 04 says global counter; frontend contract implies global. Confirm.

## OQ-09 — Conflict rules
**Owner:** backend orchestrator
**Status:** open
**Notes:** Which combinations conflict (e.g. blockage on a road already reported cleared)? Is last-writer-wins by `occurredAt` or by arrival? What goes in `conflict.serverState`? How does a human resolve it? Frontend has a default conflict rule for `road_blockage` vs `road_cleared`. Backend must match or supersede.

## OQ-10 — Retention / duplicate lookup window
**Owner:** backend orchestrator
**Status:** open
**Notes:** How long are `duplicate` lookups guaranteed to resolve for a given `clientEventId`? Unbounded log growth is a known risk (deferred).

## OQ-11 — Clock skew handling
**Owner:** backend orchestrator
**Status:** open
**Notes:** Devices may be offline for days with wrong clocks. Is `occurredAt` trusted, clamped to `hlc.l + 5 min`, or supplemented with `receivedAt` for ordering? Planning says clamp + `suspect_clock` flag. Confirm.

## OQ-12 — Batch size limits
**Owner:** backend orchestrator
**Status:** open
**Notes:** Max events per `submitEvents`, max body size, rate limits. Proposed: 64 KB max event, 500 max per request, per-device ignore switch. Confirm.

## OQ-13 — G1 scope: synthetic geography only?
**Owner:** technical lead
**Status:** open
**Notes:** Technical lead proposed G1 requires core fold + sync harness using synthetic geography; geo artifacts proceed independently. Confirm this is acceptable to all parties.

## OQ-14 — Majuli confirmation
**Owner:** technical lead
**Status:** open
**Notes:** Q1: confirm Majuli as demonstration district. Alternatives: Jagatsinghpur, Alappuzha.
