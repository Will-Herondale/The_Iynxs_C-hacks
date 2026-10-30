# Scenario design (task 4) + validation checklist (task 5)

All scenarios are **synthetic and parameterised**. None is a reconstruction of a real flood event, and none may be presented as validated. Each scenario is a JSON config with a fixed seed, so the same demo always reproduces the same result.

```
scenario_id, name, seed, base_layers, perturbations[], expected_effects, assertions[]
```

Base graph: OSM roads (`roads.geojson`) + ferries (`ferries.geojson`), nodes anchored on `places.geojson`, shelters from `shelters.csv`.
Elevation: Copernicus GLO-30 (`majuli_dem_30m_wgs84.tif`).
Water reference: JRC GSW occurrence (not a flood forecast — used only to show where water usually is).

---

## S1 — Submerged bridge (seed 101)

| | |
|---|---|
| Perturbation | Pick the longest bridge ≥30 m that **intersects the island outline** and carries a primary/secondary/trunk road. Set `water_level_m = deck_elevation_m + 0.5`. Mark that edge `passable=false`, `reason=submerged_bridge`. |
| Why synthetic | DEM is a DSM; “deck elevation” is approximated from the DEM surface at the bridge midpoint. The submergence is an authored assumption. |
| Expected effects | Edge removed; shortest path lengthens or disappears; settlements on the far side gain ≥1 hop; closest shelter assignment changes for affected places. |
| Assertions | (a) edge absent from all returned routes; (b) route length/time strictly ≥ baseline; (c) affected settlements reported explicitly, not silently re-routed. |
| Actual pick | `osm_id 284824410`, unnamed primary bridge, 139.4 m, deck ≈ 84.8 m → level 85.3 m. Nearest other bridge is recorded in the config, not assumed away. |
| Selection trap avoided | Without the island filter the rule picked a 179 m **mainland** trunk bridge at 94.58 E (Jorhat side). The config now states the filter and the validator re-checks it. |

## S2 — Blocked road (seed 102)

| | |
|---|---|
| Perturbation | Close a 200 m segment of a non-bridge road (e.g. embankment or approach road): `blocked=true`, `reason=road_blocked`, duration 6/12/24 h. |
| Why synthetic | No live road-closure feed is used. |
| Expected effects | Detour through lower-lying roads; travel time increase; possible loss of access to a shelter within the time budget. |
| Assertions | (a) closure respected by router; (b) detour never uses a road tagged `impassable`; (c) any access loss is flagged, not hidden by a longer route. |
| Actual pick | Lowest camp `MJ-SH-009` (Jengraimukh College, 85.2 m); 200 m closure at the midpoint of road `osm_id 1074461062`. |

## S3 — Rising water level (seed 103)

| | |
|---|---|
| Perturbation | Sweep `water_level_m` in fixed steps (78 → 92 m, 1 m steps; the inhabited island floor is 77.1 m and the island maximum is 111.4 m). Flooded = DEM ≤ level. A road segment is flooded when the mean DEM at its endpoints is submerged; shelters flooded when their point is submerged. |
| Why synthetic | The level series is arbitrary, not an observed hydrograph. **State this on screen.** |
| Expected effects | Monotonic growth of flooded road km, flooded shelters, cut-off population. |
| Assertions | (a) flooded length/shelters/cut-off population are non-decreasing across the sweep; (b) at the final step, the numbers equal those in the table shown to the user; (c) no route through water deeper than the vehicle threshold (0.3 m for cars, 0.5 m for trucks/boats policy). |
| Precomputed | `data/out/flood_sweep.csv` — island and AOI columns side by side. At 92 m: 745 of 893 island road km flooded (83.4%), 14 of 23 camps, 11,661 island buildings. |

## S4 — Settlement becoming disconnected (seed 104)

| | |
|---|---|
| Perturbation | Combine S3 at `water_level_m` = *t* with S1/S2 closures until one named settlement has no path to **any** shelter. |
| Why synthetic | The isolation is engineered for demonstration, not observed. |
| Expected effects | Settlement labelled `disconnected`; nearest reachable shelter recomputed; “no viable evacuation” state surfaced instead of a bogus route. |
| Assertions | (a) disconnected flag matches a full graph reachability check; (b) app never returns a route across water deeper than threshold; (c) the settlement appears in the hand-off list with its population and reason. |
| Actual pick | **Auniati** (`osm_id 10692764768`, village, DEM 82.3 m) → target level 83.8 m. Lowest of 11 settlement points inside the island (6 villages, 3 localities, 2 towns). |
| Selection trap avoided | Unfiltered, the rule picked “Bulldozer Point” at 74.5 m — below the island's 77.1 m floor, i.e. a locality label in the river. S4 now requires `place in (village, hamlet, town)` **and** inside the island. |

## S5 — Route becoming unsafe (seed 105)

| | |
|---|---|
| Perturbation | Keep origin/destination connected, but assign per-segment risk = f(water depth, bridge flag, road class, detour length). Route “safe” vs “fastest”. |
| Why synthetic | Risk weights are authored, not empirically calibrated. |
| Expected effects | Fastest route flagged unsafe; safe route is longer but avoids deep water and unassessed bridges. |
| Assertions | (a) safe route risk ≤ fastest route risk; (b) risk contribution of each segment is exposed in the response (explainability); (c) if no safe route exists the result is “unsafe/unavailable”, not the fastest route with a warning badge. |

---

## Validation checklist (task 5)

Run for every scenario, store results in `data/out/scenario_report.json`:

1. **Reproducibility** — same seed + same base layers ⇒ byte-identical route IDs.
2. **Monotonicity** — rising water: flooded roads, flooded shelters, disconnected settlements never decrease.
3. **No water-walking** — zero route segments with depth > threshold.
4. **Shelter sanity** — a shelter inside the flood extent is never offered as a destination.
5. **Explainability** — every closure/flood/risk decision carries `reason` + source dataset id.
6. **Honesty** — every scenario object has `synthetic: true`, a `note` string, and no `observed_event` field. Demo slides must repeat the caveat.
7. **Degradation** — if a layer is missing (e.g. no bridges in AOI), the scenario fails loudly rather than silently inventing one.
