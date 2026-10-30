# Integration contract — geographic data → backend contract (DRAFT)

Maps `geo/data/out/` layers to `frontend/packages/contract/src/projections.ts` field names.
**Status: needs OpenCode sign-off.** The TypeScript/zod source is authoritative; this doc is my proposed mapping.

## Contract field → my source layer

| Contract field | Contract type | My source | Notes |
|---|---|---|---|
| `Shelter.shelterId` | string | `shelters.csv` / `shelters.geojson` `shelter_id` | e.g. `MJ-SH-001` |
| `Shelter.name` | string | `name` | from DDMA plan |
| `Shelter.capacity` | int >= 0 | **not published** — leave unset / 0 with note | do not invent |
| `Shelter.occupancy` | int >= 0 | **not published** — leave unset / 0 with note | do not invent |
| `Shelter.open` | boolean | `status` = "pre-identified camp, not confirmed open" → `false` | shelters are pre-identified, not confirmed open |
| `Settlement.settlementId` | string | `places.geojson` `osm_id` | OSM node/way id |
| `Settlement.name` | string | `places.geojson` `name` | |
| `Settlement.population` | int >= 0 | `places.geojson` `population` | only 1 of 62 places has a value |
| `Settlement.accessibility` | `accessible\|limited\|cut_off` | scenario-derived (S4/S5), not from source | synthetic |
| `Settlement.households` | int >= 0 | **not available** — leave unset / 0 | do not invent |
| `Settlement.needs` | string[] | **not available** — empty array | synthetic per event |
| `RoadStatus.roadId` | string | `roads.geojson` / `bridges.geojson` `osm_id` | |
| `RoadStatus.name` | string | `name` tag (often null) | fallback to `ref` or `highway` class |
| `RoadStatus.status` | `open\|partial\|blocked\|unknown` | scenario-derived (S1/S2), default `unknown` | synthetic |
| `RoadStatus.updatedAt` | ISO datetime | scenario `occurredAt` | synthetic |
| `RoadStatus.sourceEventIds` | string[] | scenario-generated clientEventIds | synthetic |
| `FloodExtent.areaId` | string | synthetic area id (S3 sweep step) | synthetic |
| `FloodExtent.depthCm` | int >= 0 | derived from DEM − water_level | synthetic |
| `FloodExtent.severity` | int 1–5 | authored per scenario | synthetic |
| `Route.*` | — | **not produced** — router owned by OpenCode | future |

## Coordinate reference systems
- Vector layers: EPSG:4326 (GeoJSON `[lng, lat]`), matching contract `Location {lat, lng}`.
- DEM: `majuli_dem_30m_wgs84.tif` (EPSG:4326) + `majuli_dem_30m_utm46n.tif` (EPSG:32646, metres).
- GSW occurrence native grid (1/4000°) and DEM-aligned copy (1/3600°, stacks pixel-for-pixel with DEM).

## Synthetic vs sourced (keep separate)
- Sourced (real): buildings, roads, bridges, waterways, waterbodies, ferries, places, shelters, DEM, GSW occurrence, island boundary.
- Synthetic (authored, labelled `synthetic: true`): scenario configs S1–S5, flood_sweep.csv levels, road closures, bridge submergence, settlement accessibility, route status, flood extents.

## Known gaps to flag to backend
- Shelter capacity/occupancy not published → must not be invented; suggest `capacity: 0, occupancy: 0, open: false` with `needs_review: true` provenance flag.
- Population available for only 1 of 62 places.
- No HAND/drainage rasters yet (flow direction needed).
- Output format not yet confirmed by team lead.
