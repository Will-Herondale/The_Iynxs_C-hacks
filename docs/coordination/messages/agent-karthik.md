# SETU — Agent Message: Karthik (data/QA agent)

Use this file to post round-trip notes from Karthik's geographic data, GIS processing, and QA agent. Other agents read this to catch up on what changed since their last session.

## Latest update

| Item | Value |
|---|---|
| Branch | (none yet — waiting on artifacts) |
| Working directory | `data/`, `tests/e2e/`, `docs/presentation/` |

## Work completed

- Majuli geodata audit complete — see `docs/05-geo-and-inundation.md`.
- Copernicus GLO-30 DEM tiles verified downloadable anonymously from AWS `copernicus-dem-30m` bucket:
  - N26E093, N26E094, N27E093, N27E094 (~43–45 MB each, ~177 MB total).
- Land elevation in district window: p5=80.5m, p50=86.0m, p95=95.6m; 18% of cells are exactly 0m (water bodies).
- Vertical datum: EGM2008 orthometric (per Copernicus lineage) — Assam geoid undulation ~−60m order (UNVERIFIED — needs confirmation).
- Data gaps identified: village points with lat/lon, geocoded shelter list, ferry timetables, embankment lines, gauge-zero calibration table.

## Pending work (Karthik owns these)

| Task | Depends | Output | Est. |
|---|---|---|---|
| T3: DEM → HAND artifact pipeline | — | `data/artifacts/hand.bin`, `drain_elev.bin`, `reach_id.bin`, manifest | 4 h |
| T4: OSM → road graph + settlements + shelters | — | `data/artifacts/graph.json`, `settlements.json`, `shelters.json` | 4 h |
| T20: Dry-run rehearsal (all three) | all demo work | rehearsed demo | 2 h |
| T22: README, limits section, datum caveat slide | demo complete | honest limitations documented | 2 h |

## What Karthik needs to deliver

1. **Village points with lat/lon** — no official geocoded village directory exists; synthesize centroids from DataMeet Census boundaries (Assam availability unverified) or OSM place nodes.
2. **Geocoded shelter/camp list** — digitize from ASDMA flood report / district disaster management plan PDFs (machine-readability unverified).
3. **Ferry time-varying edges** — Nimati–Kamalabari crossing; no public timetable found.
4. **Embankment lines** — digitize from high-resolution imagery; burn into DEM as barriers before HAND.
5. **Gauge-zero calibration table** — CWC gauge zero elevations (Survey of India MSL) for Neamatighat / Dhansiri confluence. Needed to resolve OQ-03 (datum rule).
6. **Geo artifacts** — hand.bin, drain_elev.bin, reach_id.bin, graph.json, settlements.json, shelters.json committed under `data/artifacts/`.

## For OpenCode backend agent

- `packages/geo/build.py` will produce the artifacts above; backend flood projection reads `hand.bin` + `drain_elev.bin`.
- Python-only artifact generation — no Python at runtime.
- Artifact schema: `manifest.json` with bbox, CRS, cell size, accumulation threshold A_T, nominal channel depth, hashes.

## For Darsh's frontend agent

- Seed scenario is Guwahati (hand-drawn, scripted). Frontend keeps its own fixture until Majuli artifacts integrate.
- Majuli artifacts will land under `data/fixtures/` when ready.