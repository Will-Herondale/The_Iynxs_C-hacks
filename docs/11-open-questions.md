# 11 — Open Questions (require technical-lead decision)

No implementation may begin past the planning stage until these are answered.

## Q1 — Demo district (blocking Karthik's data pipeline)

Options on the table:
- **Majuli, Assam** (recommended): Brahmaputra river island, ~880 km², "cut off" is literal, DEM tiles N26E093/N26E094/N27E093/N27E094 verified downloadable, land p50 ≈ 86 m.
- **Jagatsinghpur, Odisha**: cyclone + flood history, 1999 anchor.
- **Alappuzha, Kerala**: dense, well-mapped OSM.

Decision needed: which district? Karthik's T3/T4 are district-specific and start at hour 0.

## Q2 — Scope freeze confirmation

Confirmed non-goals from prior context:
- No hydrodynamic solver, no live CWC API, no ML/LLM, no satellite ingestion, no traffic/congestion modelling, no truck-specific thresholds, no occupancy forecasting, no photo storage, no general all-hazards platform.

Please confirm or trim. The routing spec (doc 06) and inundation spec (doc 05) assume flood-only on one district.

## Q3 — Architecture approval

- ADR-1: TypeScript end-to-end; Python only as a batch artifact builder.
- ADR-2: JSONL append-only log, in-memory index, IndexedDB client.
- ADR-4: HAND-SRC inundation + connected bathtub bracket; fixed claim language.
- ADR-5: Time-expanded DAG with node waiting for routing.

Approve, or request changes before hour 0.

## Q4 — First milestone content

Gate G1 at hour 6 requires geo artifacts + core fold + sync harness all green. If you want a narrower first milestone (e.g. "fold + sync only, synthetic geography"), say so now so Karthik does not over-prepare.

Please answer Q1–Q4 before implementation begins.
