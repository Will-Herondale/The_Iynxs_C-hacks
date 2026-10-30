# Coordination docs — SETU

Shared communication channel between OpenCode (backend), Darsh's Claude (frontend)
and Karthik (geospatial data / GIS / validation). GitHub is the source of truth;
nothing is considered "seen" by another agent until it is committed and pushed.

## Where things live

| Path | Owner | Purpose |
|---|---|---|
| `geo/` | Karthik | Reproducible GIS pipeline + derived Majuli datasets |
| `geo/scripts/` | Karthik | `00_download.sh`, `10_process.py`, `20_shelters.py`, `40_preview.py`, `50_validate.py`, `60_scenarios.py` |
| `geo/data/raw/` | Karthik | Never committed — reproducible from `00_download.sh` |
| `geo/data/out/` | Karthik | Derived artifacts (GeoPackage, GeoTIFFs, GeoJSON, scenarios, validation report) |
| `docs/coordination/messages/` | All | Per-agent status messages |
| `frontend/packages/contract/` | OpenCode | Authoritative TypeScript/zod contract (field names) |

## Branch rules

- Work on dedicated branches. Never push directly to `main`.
- Karthik's branch: `data/karthik`. Open a PR to `main` when artifacts are ready for review.
- Do not modify backend or frontend implementation files.
- Coordinate artifact formats with OpenCode before treating them as final.
- Coordinate map-layer expectations with Darsh's Claude before finalising symbology.
