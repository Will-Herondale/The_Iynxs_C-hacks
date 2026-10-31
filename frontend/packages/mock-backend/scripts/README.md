# Build-time fixture scripts (SYNTHETIC, never run in the browser)

Run from `frontend/`, in this order. Neither script is imported by any app.

1. `node packages/geo/scripts/dem.mjs` — reads Karthik's DEM (`majuli_dem_30m_wgs84.tif`) via `git show origin/data/karthik:…`
   (needs `geotiff`, `pngjs`, `d3-contour`, `@turf/simplify`). Writes `packages/geo/data/hillshade.{png,json}` and the
   **interim synthetic flood polygons** `src/seed/fixtures/flood-83.8.json` (S4) / `flood-85.3.json` (S1):
   `DEM ≤ level`, island-clipped, `d3-contour`, simplified, split into Polygons, `confidence: 'modelled'`.
   *Synthetic interim DEM-threshold mask, not a hydraulic simulation; pending Karthik/OpenCode.*
2. `node packages/mock-backend/scripts/build-fixtures.mjs` — no dependencies. A small Dijkstra over the bundled
   `@setu/geo` roads (+ roads-minor + bridges) runs once to precompute ~3 settlement→shelter route sets, and writes
   `roads`, `settlements`, `shelters`, `routes` and `NOTES` JSON into `src/seed/fixtures/`.
   - `etaMin` = length / authored class speed (primary 50, secondary 40, tertiary 35, unclassified 25, residential 20 km/h).
   - S1 alternate avoids bridge `284824410`; S2 alternate avoids road `1074461062` (whole road, since the contract's unit is the roadId;
     Karthik's S2 closes 200 m of it); Auniati (`10692764768`) gets baseline routes only.
   - `NOTES.json#s4Check` records a build-time reachability check of Auniati against the 83.8 m mask plus the S1/S2 closures.
   - Settlements whose nearest road node is not in the main road component get no route (`settlementsWithoutRoute`); nothing is faked.
