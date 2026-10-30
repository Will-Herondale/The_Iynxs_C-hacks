# Message from Karthik — geospatial data / GIS / validation

Branch: `data/karthik` (from `main`). Not yet pushed — first push pending.

## What I've done
Inspected the repo: `main` is essentially empty (LICENSE + README); all frontend work lives on `frontend/*` branches. Read the draft API contract (`frontend/packages/contract/src/projections.ts`, `events.ts`) and frontend assumptions doc, so my outputs use the same field names where possible.

Built the complete Majuli geo foundation (pipeline + data) in `~/Documents/SETU-Majuli-Geo/` and copied the commit-ready subset to `geo/`.

## Sources investigated
- Copernicus GLO-30 DSM tiles N26/N27 × E093/E094 (4 tiles, EPSG:4326) — all downloaded and validated.
- JRC Global Surface Water occurrence v1.4 (1984–2021), 1/4000° grid — truncated download detected & re-downloaded with resume.
- OpenStreetMap via Overpass API (194,254 elements, 126 MB) — UA header required (HTTP 406 without it).
- DDMA Majuli Flood Contingency Plan 2026–27 PDF — 23 relief camps extracted.
- Census 2011 district boundaries (provenance only; pre-2016 creation).

## Datasets obtained
Full catalogue in `geo/DATASETS.md`; provenance in `geo/data/out/manifest.csv` (13 rows).

## Processing completed
`scripts/10_process.py` → `40_preview.py` → `50_validate.py` → `60_scenarios.py`, all green.
- Hardened `10_process.py` against truncated GeoTIFFs (fails loudly) and closed-ring highway polygons (`as_line()`).
- `50_validate.py`: 24 checks, all PASS, incl. a new guard that every scenario `osm_id` resolves in a delivered layer AND lies on the island.
- `60_scenarios.py`: 5 synthetic scenario configs (S1–S5), seeds 101–105, real feature ids.

## Artifacts produced (`geo/data/out/`)
- `majuli.gpkg` (48 MB, 11 layers, EPSG:4326): buildings 182,097; roads 11,736; bridges 518 (202 ≥30 m); waterways 191; waterbodies 120; ferries 2; places 62; amenities 8; shelters 23; boundary 1.
- DEM: WGS84 21 MB + UTM46N 23 MB; GSW occurrence native + DEM-aligned copy.
- `shelters.csv` (23 camps, raw DMS preserved, status "pre-identified, not confirmed open").
- `flood_sweep.csv` (synthetic levels 78–92 m, island + AOI columns); `validation_report.json`; per-layer GeoJSON; preview PNG.

## Data-quality findings
- Island elevation: min 77.1 m / median 86.0 m / max 111.4 m. AOI max 1,567 m (mainland in box).
- DEM nodata 0.06%, GSW nodata 0.09% inside AOI.
- Fixed two bad scenario picks: S1 was a mainland bridge (now island bridge `284824410`, level 85.3 m); S4 was a river label "Bulldozer Point" (now village Auniati 82.3 m, level 83.8 m).
- Majuli–Jorhat bridge is `highway=construction` in OSM → excluded from S1.
- Only 1 of 62 places has population; shelter capacity/occupancy not published → not invented.

## Missing / open
- Output format not confirmed by team lead (provisional: GeoJSON + GPKG + UTM DEM).
- No HAND / drainage rasters yet.
- Shelter capacity/occupancy unavailable → do not invent.

## Requests
- OpenCode: confirm field mapping roadId/settlementId/shelterId/capacity/occupancy vs my layers (see `integration-contract.md`).
- Darsh's Claude: confirm expected map-layer names / symbology.

## Validation results
24/24 checks pass. At the 92 m extreme: 745 km of 893 km island road flooded (83.4%), 14 of 23 camps, 11,661 island buildings.

## Commits / branches
Branch `data/karthik` created. Ready to push and open a PR to `main`.
