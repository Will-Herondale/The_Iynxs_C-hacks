#!/usr/bin/env python
"""Author the five synthetic scenarios as reproducible JSON configs.

Every config is `synthetic: true`, carries a fixed seed, and points at concrete
feature ids that exist in the delivered layers. The selection rules below are
deterministic, so re-running on the same data yields the same ids; if a rule
finds nothing the script fails instead of inventing a feature.

Output: data/out/scenarios/S{1..5}_*.json
"""
from __future__ import annotations

import json
import pathlib
import sys

import geopandas as gpd
import numpy as np
import rasterio

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "out"
GJ = OUT / "geojson"
DEST = OUT / "scenarios"
DEST.mkdir(parents=True, exist_ok=True)

DEM = OUT / "majuli_dem_30m_wgs84.tif"
CRS_UTM = "EPSG:32646"

BASE_LAYERS = {
    "roads": "geojson/roads.geojson",
    "bridges": "geojson/bridges.geojson",
    "ferries": "geojson/ferries.geojson",
    "places": "geojson/places.geojson",
    "shelters": "shelters.csv",
    "island": "geojson/majuli_boundary.geojson",
    "dem": "majuli_dem_30m_wgs84.tif",
    "water_occurrence": "majuli_water_occurrence_30m_demgrid.tif",
}

COMMON_NOTE = ("Synthetic demonstration scenario. Not a reconstruction of any real flood "
               "event and not validated against observations.")


def elevations(points_gdf):
    """DEM value at each point (metres), NaN outside the raster."""
    with rasterio.open(DEM) as s:
        arr = s.read(1)
        tr = s.transform
    xs = points_gdf.geometry.x.values
    ys = points_gdf.geometry.y.values
    cols, rows = ~tr * (xs, ys)
    cols = np.floor(cols).astype(int)
    rows = np.floor(rows).astype(int)
    ok = (rows >= 0) & (rows < arr.shape[0]) & (cols >= 0) & (cols < arr.shape[1])
    out = np.full(len(xs), np.nan)
    out[ok] = arr[rows[ok], cols[ok]]
    out[out == -9999] = np.nan
    return out


def write(cfg: dict) -> None:
    path = DEST / f"{cfg['scenario_id']}_{cfg['slug']}.json"
    path.write_text(json.dumps(cfg, indent=2) + "\n")
    print("wrote", path.name)


def main() -> int:
    bridges = gpd.read_file(GJ / "bridges.geojson")
    roads = gpd.read_file(GJ / "roads.geojson")
    camps = gpd.read_file(GJ / "shelters.geojson")
    places = gpd.read_file(GJ / "places.geojson")

    if bridges.empty or camps.empty or places.empty:
        print("missing base layers - run 10_process.py / 20_shelters.py first",
              file=sys.stderr)
        return 1

    island = gpd.read_file(GJ / "majuli_boundary.geojson").geometry.iloc[0]

    # ------------------------------------------------------------------ S1
    # Deterministic rule: the longest bridge >=30 m that actually touches the
    # island and carries a primary/secondary/trunk road. The island filter is
    # mandatory: without it the rule picked a mainland trunk bridge 179 m long
    # on the Jorhat side, which is irrelevant to Majuli evacuation routing.
    #
    # We do NOT claim the pick is the "only" crossing. The nearest other bridge
    # distance is recorded as a measured fact instead, so the reader can judge.
    cand = bridges[(bridges["length_m"] >= 30)
                   & (bridges["highway"].isin(["primary", "secondary", "trunk"]))
                   & (bridges.geometry.intersects(island))].copy()
    if cand.empty:
        print("S1: no island bridge >=30 m on a primary/secondary/trunk road - "
              "refusing to invent one", file=sys.stderr)
        return 1
    pick = cand.sort_values("length_m", ascending=False).iloc[0]
    b_pt = gpd.GeoSeries([pick.geometry.interpolate(0.5, normalized=True)],
                         crs="EPSG:4326")
    deck = float(elevations(gpd.GeoDataFrame(geometry=b_pt))[0])
    others = bridges[bridges["osm_id"] != pick["osm_id"]].to_crs(CRS_UTM)
    pick_utm = gpd.GeoSeries([pick.geometry], crs="EPSG:4326").to_crs(CRS_UTM).iloc[0]
    nearest_other_m = float(others.distance(pick_utm).min())

    write({
        "scenario_id": "S1",
        "slug": "submerged_bridge",
        "name": "Submerged bridge",
        "seed": 101,
        "synthetic": True,
        "note": COMMON_NOTE + " The deck height is read from a DSM surface at the bridge "
                "midpoint, so it approximates the canopy/road surface, not a surveyed deck.",
        "base_layers": BASE_LAYERS,
        "selection_rule": ("longest bridge >=30 m that intersects the island outline and "
                           "carries a primary/secondary/trunk road"),
        "candidates_considered": int(len(cand)),
        "nearest_other_bridge_m": round(nearest_other_m, 0),
        "known_gaps": ("The Majuli-Jorhat crossing is tagged highway=construction in OSM, so it "
                       "is excluded here even though it is the island's main link. Scenarios "
                       "therefore exercise river crossings that are already open."),
        "perturbations": [{
            "type": "submerge_bridge",
            "target": {"layer": "bridges", "osm_id": int(pick["osm_id"]),
                       "name": None if pick["name"] is None or pick["name"] != pick["name"] else pick["name"],
                       "length_m": float(pick["length_m"]),
                       "highway": pick["highway"]},
            "deck_elevation_m": round(deck, 1),
            "offset_m": 0.5,
            "water_level_m": round(deck + 0.5, 1),
            "edge_state": {"passable": False, "reason": "submerged_bridge"},
        }],
        "expected_effects": [
            "the bridge edge disappears from every route",
            "settlements on the far side gain at least one hop",
            "closest reachable shelter changes for affected places",
        ],
        "assertions": [
            "edge absent from all returned routes",
            "route length/time is >= the baseline for every affected pair",
            "affected settlements are reported explicitly rather than silently re-routed",
        ],
    })

    # ------------------------------------------------------------------ S2
    # Deterministic rule: the lowest camp in the set is the most exposed; close a
    # 200 m stretch of the nearest non-bridge road to it.
    camp_el = elevations(camps)
    camps = camps.assign(dem_elev_m=camp_el)
    exposed = camps.sort_values("dem_elev_m").iloc[0]
    roads_nb = roads[~roads["osm_id"].isin(bridges["osm_id"])].to_crs(CRS_UTM)
    camp_utm = gpd.GeoSeries([exposed.geometry], crs="EPSG:4326").to_crs(CRS_UTM).iloc[0]
    nearest = roads_nb[roads_nb.distance(camp_utm) < 500]
    if nearest.empty:
        nearest = roads_nb.loc[[roads_nb.distance(camp_utm).idxmin()]]
    road = nearest.sort_values("length_m", ascending=False).iloc[0]
    line = road.geometry
    mid = line.interpolate(0.5, normalized=True)
    seg = gpd.GeoSeries([line], crs=CRS_UTM).iloc[0]

    write({
        "scenario_id": "S2",
        "slug": "blocked_road",
        "name": "Blocked approach road",
        "seed": 102,
        "synthetic": True,
        "note": COMMON_NOTE + " No live road-closure feed is used; the closure is authored.",
        "base_layers": BASE_LAYERS,
        "selection_rule": ("lowest camp by DSM elevation; nearest non-bridge road within "
                           "500 m; a 200 m stretch at its midpoint"),
        "perturbations": [{
            "type": "block_road",
            "target": {"layer": "roads", "osm_id": int(road["osm_id"]),
                       "name": None if road["name"] != road["name"] else road["name"],
                       "highway": road["highway"],
                       "length_m": float(road["length_m"])},
            "closure": {"length_m": 200,
                        "at": {"lon": round(mid.x, 6), "lat": round(mid.y, 6)},
                        "blocked": True, "reason": "road_blocked"},
            "durations_h": [6, 12, 24],
            "exposed_shelter": {"shelter_id": exposed["shelter_id"],
                                "dem_elev_m": round(float(exposed["dem_elev_m"]), 1)},
        }],
        "expected_effects": [
            "detour through lower-lying roads",
            "travel time increase for the affected shelter catchment",
            "possible loss of access within the stated time budget",
        ],
        "assertions": [
            "closure is respected by the router",
            "the detour never uses a road tagged impassable",
            "any access loss is flagged instead of being hidden by a longer route",
        ],
    })

    # ------------------------------------------------------------------ S3
    with rasterio.open(DEM) as s:
        arr = s.read(1)
    island = gpd.read_file(GJ / "majuli_boundary.geojson").geometry.iloc[0]
    write({
        "scenario_id": "S3",
        "slug": "rising_water",
        "name": "Rising water level",
        "seed": 103,
        "synthetic": True,
        "note": COMMON_NOTE + " The level series is arbitrary, not an observed hydrograph. "
                "Show that sentence on screen.",
        "base_layers": BASE_LAYERS,
        "perturbations": [{
            "type": "water_level_sweep",
            "levels_m": list(range(78, 93)),
            "step_m": 1,
            "flooded_rule": "cell is flooded where DEM <= water_level_m",
            "road_rule": "segment flooded when the mean DEM at its endpoints <= level",
            "precomputed": "flood_sweep.csv",
            "vehicle_thresholds_m": {"car": 0.3, "truck": 0.5},
        }],
        "expected_effects": [
            "monotonic growth of flooded road km, flooded camps and flooded buildings",
            "loss of the lowest crossings first",
        ],
        "assertions": [
            "flooded length, camps and buildings are non-decreasing across the sweep",
            "final-step totals equal flood_sweep.csv",
            "no route through water deeper than the vehicle threshold",
        ],
    })

    # ------------------------------------------------------------------ S4
    # Deterministic rule: the lowest-lying *settlement* point is the one most
    # easily cut off; the target level sits 1.5 m above it.
    #
    # Two filters are mandatory. Inside the island: a mainland point is not a
    # Majuli settlement. Settlement place types only: the unfiltered rule picked
    # "Bulldozer Point" (74.5 m), a locality label sitting on ground below the
    # island's 77.1 m floor, i.e. in the river, not a place people live.
    SETTLEMENT_TYPES = ("village", "hamlet", "town")
    place_el = elevations(places)
    places = places.assign(dem_elev_m=place_el,
                           in_island=[g.within(island) for g in places.geometry])
    pool_places = places[(places["place"].isin(SETTLEMENT_TYPES))
                         & places["in_island"]
                         & places["dem_elev_m"].notna()]
    if pool_places.empty:
        print("S4: no settlement point inside the island - refusing to invent one",
              file=sys.stderr)
        return 1
    low = pool_places.sort_values("dem_elev_m").iloc[0]
    target_level = round(float(low["dem_elev_m"]) + 1.5, 1)

    write({
        "scenario_id": "S4",
        "slug": "settlement_disconnected",
        "name": "Settlement cut off",
        "seed": 104,
        "synthetic": True,
        "note": COMMON_NOTE + " The isolation is engineered for demonstration; it is not an "
                "observed cut-off event.",
        "base_layers": BASE_LAYERS,
        "selection_rule": ("lowest-lying settlement point (village/hamlet/town) inside the island "
                           "outline by DSM elevation, target level +1.5 m"),
        "candidates_considered": int(len(pool_places)),
        "perturbations": [{
            "type": "combine",
            "water_level_m": target_level,
            "closure_from": ["S1", "S2"],
            "target_settlement": {"osm_id": int(low["osm_id"]), "name": low["name"],
                                  "place": low["place"],
                                  "dem_elev_m": round(float(low["dem_elev_m"]), 1)},
            "goal": "no path from the settlement to any shelter",
        }],
        "expected_effects": [
            "settlement labelled disconnected",
            "nearest reachable shelter recomputed",
            "an explicit no-viable-evacuation state instead of a bogus route",
        ],
        "assertions": [
            "disconnected flag matches a full reachability check",
            "no route crosses water deeper than the threshold",
            "the settlement appears in the hand-off list with population and reason",
        ],
    })

    # ------------------------------------------------------------------ S5
    write({
        "scenario_id": "S5",
        "slug": "unsafe_route",
        "name": "Fastest route is unsafe",
        "seed": 105,
        "synthetic": True,
        "note": COMMON_NOTE + " Risk weights are authored and not empirically calibrated.",
        "base_layers": BASE_LAYERS,
        "perturbations": [{
            "type": "route_risk",
            "water_level_m": 88,
            "risk_formula": ("risk = w_depth*depth_over_threshold + w_bridge*unassessed_bridge "
                             "+ w_class*road_class_exposure + w_detour*detour_penalty"),
            "weights": {"w_depth": 1.0, "w_bridge": 0.6, "w_class": 0.3, "w_detour": 0.2},
            "depth_normalisation_m": 0.5,
            "compare": ["fastest", "safe"],
        }],
        "expected_effects": [
            "the fastest route is flagged unsafe",
            "the safe route is longer but avoids deep water and unassessed bridges",
        ],
        "assertions": [
            "safe route risk <= fastest route risk",
            "per-segment risk contributions are exposed in the response",
            "when no safe route exists the answer is unsafe/unavailable, not fastest-with-warning",
        ],
    })

    print("\nS1 deck elevation %.1f m -> water level %.1f m (bridge osm_id %d, %.0f m long)"
          % (deck, deck + 0.5, int(pick["osm_id"]), float(pick["length_m"])))
    print("S2 exposed camp %s (%.1f m), road osm_id %d"
          % (exposed["shelter_id"], float(exposed["dem_elev_m"]), int(road["osm_id"])))
    print("S4 target settlement %s (%.1f m), level %.1f m"
          % (low["name"], float(low["dem_elev_m"]), target_level))
    return 0


if __name__ == "__main__":
    sys.exit(main())
