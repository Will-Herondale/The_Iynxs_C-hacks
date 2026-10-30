#!/usr/bin/env python
"""Build observation-driven demonstration artifacts for the Majuli flood demo.

Outputs (data/out/demo/):
  road_graph.geojson      REAL — OSM roads + bridges + embankments on island
  settlements.geojson     REAL — 8 island settlements (village/hamlet/town)
  shelters.geojson        REAL — 23 DDMA pre-identified camps
  scenario_obs.json       SYNTHETIC — deterministic observation-driven scenario

Distinction:
  * road_graph, settlements, shelters are sourced from real data
    (OSM / DDMA contingency plan). They carry `synthetic: false`.
  * scenario_obs is authored: an observation event triggers road closure,
    route recalculation, settlement cut-off, shelter reassignment. Carries
    `synthetic: true`. Not a reconstruction of any real flood event.

Aligns with frontend/packages/contract/src/projections.ts field names
(roadId, settlementId, shelterId, status, accessibility, etc.).
"""
from __future__ import annotations

import datetime
import json
import pathlib

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "out"
DEMO = OUT / "demo"
DEMO.mkdir(parents=True, exist_ok=True)
GJ = OUT / "geojson"
DEM = OUT / "majuli_dem_30m_wgs84.tif"
HAND = OUT / "majuli_hand_30m_wgs84.tif"

NOW = datetime.datetime.now(datetime.timezone.utc).isoformat()
CRS = "EPSG:4326"

# Deterministic seed so the demo is reproducible
SEED = 20261030


def now_iso() -> str:
    return NOW


# ---------------------------------------------------------------- 1. Road graph
def build_road_graph() -> None:
    """Merge roads + bridges + embankments clipped to island into one graph."""
    roads = gpd.read_file(GJ / "roads.geojson")
    bridges = gpd.read_file(GJ / "bridges.geojson")
    emb = gpd.read_file(GJ / "embankments.geojson")
    island = gpd.read_file(GJ / "majuli_boundary.geojson").geometry.iloc[0]

    def clip_lines(gdf):
        g = gpd.clip(gdf, island)
        return g[~g.geometry.is_empty & g.geometry.notna()]

    r = clip_lines(roads).copy()
    b = clip_lines(bridges).copy()
    e = clip_lines(emb).copy()

    # Tag each with source layer
    r["source_layer"] = "roads"
    b["source_layer"] = "bridges"
    e["source_layer"] = "embankments"

    # Keep common columns
    cols = ["osm_id", "name", "highway", "ref", "surface", "bridge", "man_made",
            "length_m", "source_layer", "geometry"]
    keep = lambda g: g[[c for c in cols if c in g.columns]]
    graph = gpd.GeoDataFrame(
        pd_concat([keep(r), keep(b), keep(e)]),
        geometry="geometry", crs=CRS,
    )
    graph = graph[~graph.geometry.is_empty & graph.geometry.notna()].reset_index(drop=True)
    graph["roadId"] = graph["osm_id"].astype(str)
    graph["name"] = graph["name"].fillna("").astype(str)
    graph["length_m"] = graph["length_m"].round(1)

    path = DEMO / "road_graph.geojson"
    graph.to_file(path, driver="GeoJSON")
    print(f"wrote {path} — {len(graph)} features "
          f"(roads {len(r)}, bridges {len(b)}, embankments {len(e)})")


def pd_concat(frames):
    return pd.concat(frames, ignore_index=True)


# ---------------------------------------------------------------- 2. Settlements
def build_settlements() -> None:
    """8 island settlements (village/hamlet/town) with DEM elevation."""
    pl = gpd.read_file(GJ / "places.geojson")
    island = gpd.read_file(GJ / "majuli_boundary.geojson").geometry.iloc[0]

    pl = pl[pl.place.isin(["village", "hamlet", "town"])].copy()
    pl["in_isl"] = pl.geometry.within(island)
    pl_i = pl[pl.in_isl].copy()

    with rasterio.open(DEM) as s:
        arr = s.read(1)
        tr = s.transform
    xs = pl_i.geometry.x.values
    ys = pl_i.geometry.y.values
    cols, rows = ~tr * (xs, ys)
    cols = np.floor(cols).astype(int)
    rows = np.floor(rows).astype(int)
    ok = (rows >= 0) & (rows < arr.shape[0]) & (cols >= 0) & (cols < arr.shape[1])
    elev = np.full(len(xs), np.nan)
    elev[ok] = arr[rows[ok], cols[ok]]
    elev[elev == -9999] = np.nan
    pl_i["dem_elev_m"] = np.round(elev, 1)

    pl_i["settlementId"] = pl_i["osm_id"].astype(str)
    pl_i["name"] = pl_i["name"].fillna("Unnamed").astype(str)
    pl_i["population"] = pl_i["population"].fillna(0).astype("Int64").astype(object).fillna(0).astype(int)
    pl_i["households"] = 0  # not published — do not invent
    pl_i["needs"] = [[]] * len(pl_i)
    pl_i["accessibility"] = "accessible"  # baseline; scenario may change
    pl_i["synthetic"] = False

    out = pl_i[["settlementId", "name", "place", "population", "households",
                "needs", "accessibility", "dem_elev_m", "synthetic", "geometry"]]
    out = out.rename(columns={"dem_elev_m": "elevation_m"})
    path = DEMO / "settlements.geojson"
    out.to_file(path, driver="GeoJSON")
    print(f"wrote {path} — {len(out)} settlements")


# ---------------------------------------------------------------- 3. Shelters
def build_shelters() -> None:
    """23 DDMA pre-identified camps. open=False (not confirmed open)."""
    sh = gpd.read_file(GJ / "shelters.geojson").copy()
    sh["shelterId"] = sh["shelter_id"].astype(str)
    sh["name"] = sh["name"].astype(str)
    sh["capacity"] = 0  # not published — do not invent
    sh["occupancy"] = 0
    sh["open"] = False  # pre-identified, not confirmed open
    sh["synthetic"] = False
    out = sh[["shelterId", "name", "capacity", "occupancy", "open",
              "synthetic", "geometry"]]
    path = DEMO / "shelters.geojson"
    out.to_file(path, driver="GeoJSON")
    print(f"wrote {path} — {len(out)} shelters")


# ---------------------------------------------------------------- 4. Scenario
def build_scenario() -> None:
    """Deterministic observation-driven scenario (S1: submerged bridge).

    A volunteer reports water under bridge osm_id=284824410 (primary, SH21,
    139.4 m, deck ≈84.8 m). Water level = 85.3 m → bridge submerged.
    This triggers: road closure, route recalculation, settlement cut-off,
    shelter reassignment. All synthetic — authored for demonstration.
    """
    island = gpd.read_file(GJ / "majuli_boundary.geojson").geometry.iloc[0]
    camps = gpd.read_file(GJ / "shelters.geojson")
    places = gpd.read_file(DEMO / "settlements.geojson")

    # Real feature ids
    bridge_osm_id = 284824410   # primary bridge SH21, 139.4 m, on island
    bridge_deck_m = 84.8        # DEM surface at bridge midpoint
    water_level_m = 85.3        # deck + 0.5 m

    # Observation event (synthetic)
    event = {
        "eventId": "evt-obs-001",
        "clientEventId": "obs-2026-10-30-001",
        "type": "flood_report",
        "occurredAt": NOW,
        "reporterId": "volunteer-majuli-01",
        "deviceId": "device-field-07",
        "location": {
            "lat": 26.9586,
            "lng": 94.1622,
            "accuracyM": 10,
        },
        "note": "Water over bridge deck on SH21 near Auniati. Depth ~0.5 m above deck.",
        "photoRefs": [],
        "severity": 3,
        "depthCm": 50,
        "areaId": "area-sh21-auniati",
        "synthetic": True,
    }

    # Road status: bridge + approach road blocked
    road_status = {
        "type": "FeatureCollection",
        "version": 1,
        "generatedAt": NOW,
        "features": [
            {
                "type": "Feature",
                "id": "road-sh21-bridge",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [[94.1610, 26.9580], [94.1635, 26.9592]],
                },
                "properties": {
                    "roadId": str(bridge_osm_id),
                    "name": "SH21",
                    "status": "blocked",
                    "updatedAt": NOW,
                    "sourceEventIds": [event["clientEventId"]],
                    "blockReason": "submerged_bridge",
                    "waterLevelM": water_level_m,
                    "deckElevationM": bridge_deck_m,
                    "synthetic": True,
                },
            }
        ],
    }
    with open(DEMO / "road_status.json", "w") as f:
        json.dump(road_status, f, indent=2)

    # Settlements: Auniati cut off (lowest settlement, 82.3 m → submerged at 85.3 m)
    auniati = places[places.settlementId == "10692764768"]
    settlement_status = []
    for _, s in places.iterrows():
        elev = float(s["elevation_m"]) if pd.notna(s["elevation_m"]) else 999
        acc = "cut_off" if s["settlementId"] == "10692764768" else "accessible"
        settlement_status.append({
            "type": "Feature",
            "id": str(s["settlementId"]),
            "geometry": {
                "type": "Point",
                "coordinates": [float(s.geometry.x), float(s.geometry.y)],
            },
            "properties": {
                "settlementId": str(s["settlementId"]),
                "name": s["name"],
                "place": s["place"],
                "population": int(s["population"]) if pd.notna(s["population"]) else 0,
                "households": 0,
                "needs": ["evacuation"] if acc == "cut_off" else [],
                "accessibility": acc,
                "elevation_m": round(elev, 1),
                "water_level_m": water_level_m,
                "cut_off_reason": "bridge_submerged_sh21" if acc == "cut_off" else None,
                "synthetic": True,
            },
        })
    settlements_out = {
        "type": "FeatureCollection",
        "version": 1,
        "generatedAt": NOW,
        "features": settlement_status,
    }
    with open(DEMO / "settlement_status.json", "w") as f:
        json.dump(settlements_out, f, indent=2)

    # Shelters: nearest reachable shelter for Auniati reassigned
    shelters = gpd.read_file(DEMO / "shelters.geojson")
    shelter_status = []
    for _, sh in shelters.iterrows():
        # Auniati → nearest shelter becomes MJ-SH-009 (Jengraimukh College, 85.2 m)
        # but at 85.3 m water level it's also near threshold → flag limited
        open_flag = bool(sh["open"])
        shelter_status.append({
            "type": "Feature",
            "id": str(sh["shelterId"]),
            "geometry": {
                "type": "Point",
                "coordinates": [float(sh.geometry.x), float(sh.geometry.y)],
            },
            "properties": {
                "shelterId": str(sh["shelterId"]),
                "name": sh["name"],
                "capacity": int(sh["capacity"]),
                "occupancy": int(sh["occupancy"]),
                "open": open_flag,
                "status": "pre_identified_not_confirmed",
                "serves_auniati": bool(sh["shelterId"] == "MJ-SH-009"),
                "synthetic": True,
            },
        })
    shelters_out = {
        "type": "FeatureCollection",
        "version": 1,
        "generatedAt": NOW,
        "features": shelter_status,
    }
    with open(DEMO / "shelter_status.json", "w") as f:
        json.dump(shelters_out, f, indent=2)

    # Flood extent: synthetic polygon around bridge area (DEM <= water_level)
    flood_extent = {
        "type": "FeatureCollection",
        "version": 1,
        "generatedAt": NOW,
        "features": [
            {
                "type": "Feature",
                "id": "flood-sh21-auniati",
                "geometry": {
                    "type": "Polygon",
                    "coordinates": [[
                        [94.1590, 26.9560],
                        [94.1650, 26.9560],
                        [94.1650, 26.9610],
                        [94.1590, 26.9610],
                        [94.1590, 26.9560],
                    ]],
                },
                "properties": {
                    "areaId": "area-sh21-auniati",
                    "depthCm": 50,
                    "severity": 3,
                    "waterLevelM": water_level_m,
                    "method": "dem_below_level_synthetic",
                    "synthetic": True,
                },
            }
        ],
    }
    with open(DEMO / "flood_extent.json", "w") as f:
        json.dump(flood_extent, f, indent=2)

    # Route: primary evacuation route recalculated (unavailable)
    route = {
        "type": "FeatureCollection",
        "version": 1,
        "generatedAt": NOW,
        "features": [
            {
                "type": "Feature",
                "id": "route-auniati-evac",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [94.1622, 26.9586],
                        [94.1700, 26.9650],
                        [94.1800, 26.9700],
                    ],
                },
                "properties": {
                    "routeId": "route-auniati-evac-001",
                    "from": "10692764768",
                    "to": "MJ-SH-009",
                    "kind": "evacuation",
                    "status": "recalculated",
                    "etaMin": 45,
                    "replacesRouteId": None,
                    "avoids": [str(bridge_osm_id)],
                    "synthetic": True,
                },
            }
        ],
    }
    with open(DEMO / "route_status.json", "w") as f:
        json.dump(route, f, indent=2)

    # Master scenario bundle
    scenario = {
        "scenario_id": "S1_obs_driven",
        "name": "Submerged bridge — observation driven",
        "seed": SEED,
        "synthetic": True,
        "generatedAt": NOW,
        "note": ("Authored demonstration scenario. Not a reconstruction of any real "
                 "flood event. Water level is relative to the DEM/DSM surface, not MSL."),
        "base_layers": {
            "roads": "geo/data/out/geojson/roads.geojson",
            "bridges": "geo/data/out/geojson/bridges.geojson",
            "embankments": "geo/data/out/geojson/embankments.geojson",
            "settlements": "data/out/demo/settlements.geojson",
            "shelters": "data/out/demo/shelters.geojson",
            "dem": "majuli_dem_30m_wgs84.tif",
            "hand": "majuli_hand_30m_wgs84.tif",
        },
        "real_features": {
            "bridge": {"osm_id": bridge_osm_id, "highway": "primary",
                       "ref": "SH21", "length_m": 139.4,
                       "deck_elevation_m": bridge_deck_m},
            "settlement_cut_off": {"osm_id": "10692764768", "name": "Auniati",
                                   "place": "village", "elevation_m": 82.3},
            "shelter_nearest": {"shelter_id": "MJ-SH-009", "name": "Jengraimukh College",
                                "elevation_m": 85.2},
        },
        "observation_event": event,
        "perturbation": {
            "type": "submerge_bridge",
            "trigger": "flood_report",
            "target": str(bridge_osm_id),
            "water_level_m": water_level_m,
            "deck_elevation_m": bridge_deck_m,
            "offset_m": 0.5,
            "edge_state": {"passable": False, "reason": "submerged_bridge"},
        },
        "expected_effects": [
            "bridge edge absent from all returned routes",
            "Auniati settlement marked cut_off",
            "nearest reachable shelter for Auniati reassigned",
            "evacuation route recalculated with longer eta",
        ],
        "assertions": [
            "no route crosses the submerged bridge",
            "cut_off settlement appears in hand-off list with reason",
            "shelter open=false until confirmed by DDMA",
        ],
        "outputs": {
            "road_status": "data/out/demo/road_status.json",
            "settlement_status": "data/out/demo/settlement_status.json",
            "shelter_status": "data/out/demo/shelter_status.json",
            "flood_extent": "data/out/demo/flood_extent.json",
            "route_status": "data/out/demo/route_status.json",
        },
    }
    with open(DEMO / "scenario_obs.json", "w") as f:
        json.dump(scenario, f, indent=2)
    print(f"wrote {DEMO / 'scenario_obs.json'} — observation-driven scenario")


def main() -> int:
    build_road_graph()
    build_settlements()
    build_shelters()
    build_scenario()
    print("\nDemo artifacts complete in", DEMO)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
