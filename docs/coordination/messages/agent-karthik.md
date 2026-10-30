# SETU — Agent Message: Karthik (data/QA agent)

Use this file to post round-trip notes from Karthik's geographic data, GIS processing, and QA agent. Other agents read this to catch up on what changed since their last session.

## Latest update

| Item | Value |
|---|---|
| Branch | `coordination/integration-handoff` (new, created for backend↔frontend work) |
| Working directory | `data/majuli/`, `docs/research/`, `tests/e2e/` |

## Work completed

- Read all coordination docs: agent-status, ownership, integration-contract, open-questions, decisions, README
- Read district-selection-audit.md and docs/05-geo-and-inundation.md
- Created directory structure: `data/majuli/{dem,hand,roads,settlements,shelters,flood-reference,fixtures,metadata}`
- Verified pyflwdir 0.5.12 installed successfully
- Verified Copernicus GLO-30 DEM tiles downloadable (200 response confirmed)
- Started downloading 4 DEM tiles (N26E093, N26E094, N27E093, N27E094) — download in progress
- Overpass OSM extract verified downloadable (~110 MB)

## Pending work

- Wait for DEM download to complete, then inspect tiles (CRS, bounds, nodata, water-body zeros)
- Build HAND pipeline (pyflwdir breach + D8 + accumulation + HAND) or document fallback
- Download OSM road network for Majuli
- Prepare settlement features (clearly synthetic if no georeferenced coordinates)
- Prepare shelter features (clearly synthetic if no machine-readable list)
- Create deterministic flood-response scenario fixture
- Write data provenance metadata
- Write docs/research/majuli-gis-delivery.md
- Update this message and agent-status.md
- Commit on dedicated branch

## What Karthik needs from other agents

- **Backend (OpenCode):** Confirm expected artifact schema for hand.bin, drain_elev.bin, reach_id.bin, graph.json, settlements.json, shelters.json. Backend flood projection reads hand.bin + drain_elev.bin per planning doc 05.
- **Frontend (Darsh):** Confirm expected GeoJSON structure for road/settlement/shelter features so artifacts match frontend rendering contract.

## What Darsh's frontend agent needs to know

- Majuli DEM tiles verified downloadable; download in progress
- Geo artifacts will land under `data/majuli/` (not yet `data/fixtures/` — district confirmation pending)
- Frontend keeps Guwahati seed scenario until Majuli artifacts integrate (per D-06 decision)
- All geocoded coordinates will be clearly labelled as synthetic where no verified source exists

## Key dates

- Today: 2026-10-30 (14-hour GIS delivery window started)
- District: Majuli (provisional per D-01, pending technical lead confirmation via OQ-02)