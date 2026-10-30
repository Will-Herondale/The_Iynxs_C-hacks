# 10 — Critical Risk Register

R-01 — DEM water-body zero cells silently corrupt HAND
- Likelihood: High. Verified: 18 % of district cells are exactly 0 m.
- Impact: High. Inundation everywhere or nowhere, invisible until the map is drawn.
- Mitigation: explicit zero-repair step using `_WBM.tif` + nominal channel depth; unit test asserts `min(drain_elev) > 0` and HAND max > 1 m.
- Fallback: synthetic fixture island (see execution plan G1 fallback).
- Owner: Karthik + lead.

R-02 — Vertical datum mismatch between gauge and DEM
- Likelihood: High if gauges are used; None by design.
- Impact: Catastrophic — 30 m error saturates a 10 m-relief island.
- Mitigation: ADR-8 — primary observation is local depth over a DEM-referenced point; no gauge stage is ever compared with DEM elevation.
- Owner: lead.

R-03 — Two implementations of the fold diverge (client vs server)
- Likelihood: Medium. This is the project's central claim.
- Impact: Catastrophic — on-stage divergence destroys credibility.
- Mitigation: ADR-1 — one TypeScript fold, shared by browser and server. No Python at request time. Convergence fuzz + negative controls in CI.
- Owner: lead.

R-04 — Plain time-dependent Dijkstra used on expiring blockages
- Likelihood: Medium. It is the obvious implementation and it is subtly wrong.
- Impact: High — route sent over a road that reopens mid-journey, or latest-departure wrong.
- Mitigation: ADR-5 — time-expanded DAG with node waiting; exact_replay hard assert; golden 4-node blockage toy.
- Owner: lead.

R-05 — Overpass API unreachable at build time
- Likelihood: High. Timed out twice from this network during audit.
- Impact: Medium — road graph cannot be fetched live.
- Mitigation: graph is a committed build artifact, never fetched live. Alternative OSM extract sources (Geofabrik, bbbike) identified if re-extraction needed.
- Owner: Karthik.

R-06 — Field-app clock skew floods/drains the map
- Likelihood: Medium in a real deployment; possible in demo if devices are misconfigured.
- Impact: High — a wrong date biases observation ranking.
- Mitigation: HLC monotonicity; `observed_at` clamped to `hlc.l + 5 min`; `suspect_clock` flag excludes observation from driving inundation.
- Owner: lead.

R-07 — Reviewed merge (person matching) breaks convergence
- Likelihood: Medium. Auto-merge would diverge under different arrival orders.
- Impact: Medium — two consoles show different linked families.
- Mitigation: ADR-6 — `match.propose` is data; `match.accept`/`match.reject` are events; projection renders `pending` deterministically.
- Owner: lead.

R-08 — HAND claims exceed method (hydrodynamic accuracy implied)
- Likelihood: High under judge pressure.
- Impact: High — a hydrologist judge will ask about velocity, duration, backwater.
- Mitigation: fixed claim language in [05-geo-and-inundation.md](./05-geo-and-inundation.md) §6; UI banner "terrain screening, not a forecast"; no accuracy numbers as skill.
- Owner: Karthik (presentation) + lead.

R-09 — Log growth unbounded (JSONL never compacted)
- Likelihood: Low in 48 h; real risk after the hackathon.
- Impact: Low for the demo; defer explicitly.
- Mitigation: document as 3-month risk; no compaction code written.
- Owner: lead.

R-10 — Wifi fails during demo (online sync cannot be demonstrated live)
- Likelihood: Medium at hackathon venues.
- Impact: Medium — the offline claim is the product's core.
- Mitigation: sneakernet file import/export built in; demo script shows offline creation then sync over a local hotspot or file transfer; pre-recorded convergence video as backup.
- Owner: Darsh + lead.

## Kill criteria (stop and pivot to synthetic-only demo)

- G1 not green by hour 8 AND synthetic fallback not ready → Karthik pivots fully to fixtures; lead proceeds.
- G4 not green by hour 24 → drop routing beats; demo is offline report + inundation + blocked roads + manual reroute explanation.
- Any specialist-review falsification found after implementation starts (e.g. FIFO claim wrong) → revert to the last design-doc-approved behaviour, no improvisation.

## Open questions for the technical lead (decisions needed before implementation)

1. **Confirm Majuli** as the demo district (alternatives: Jagatsinghpur, Alappuzha). Karthik's data pipeline is district-specific.
2. **Confirm scope freeze** — no hydrodynamic solver, no live CWC API, no ML/LLM, no satellite ingestion, flood only. (Already agreed in prior context; re-stated for the record.)
3. **Approve the monorepo + TypeScript-everywhere stack** (ADR-1) and JSONL storage (ADR-2).
4. **Approve HAND-SRC + connected-bathtub bracket** as the inundation method (ADR-4), with the explicit claim language in §6 of doc 05.
5. **Approve time-expanded DAG with node waiting** as the routing method (ADR-5), rejecting snapshot interpolation and plain TD-Dijkstra.
