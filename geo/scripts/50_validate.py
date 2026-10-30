#!/usr/bin/env python
"""Data-level validation for the Majuli layered dataset.

Covers the parts of the SCENARIOS.md checklist that can be checked without a
router:
  1. every declared output exists, opens, and is in the declared CRS
  2. the rasters that are supposed to stack, do stack (same grid)
  3. raster coverage inside the AOI
  4. monotonic growth of flooded road / camps / buildings across a hypothetical
     water-level sweep (S3)

The sweep is **synthetic**: it is a hypothetical level series, not an observed
hydrograph, and it says so in every output row.

Outputs: data/out/flood_sweep.csv, data/out/validation_report.json
"""
from __future__ import annotations

import json
import pathlib
import sys

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "out"
GJ = OUT / "geojson"
CRS_GEO, CRS_UTM = "EPSG:4326", "EPSG:32646"

DEM = OUT / "majuli_dem_30m_wgs84.tif"
DEM_UTM = OUT / "majuli_dem_30m_utm46n.tif"
GSW = OUT / "majuli_water_occurrence_30m.tif"
GSW_GRID = OUT / "majuli_water_occurrence_30m_demgrid.tif"

EXPECTED_R = [DEM, DEM_UTM, GSW, GSW_GRID]
EXPECTED_V = ["aoi", "majuli_boundary", "roads", "bridges", "waterways", "waterbodies",
              "ferries", "places", "amenities", "buildings", "shelters"]

LEVELS = list(range(78, 93))  # metres; island interior is ~77-111 m
NOTE = ("hypothetical water level series for demonstration; not an observed "
        "hydrograph and not a validated flood extent")


def sample_dem(dem_arr, transform, xs, ys):
    """Nearest-pixel DEM lookup for arrays of lon/lat."""
    cols, rows = ~transform * (xs, ys)
    cols = np.floor(cols).astype(int)
    rows = np.floor(rows).astype(int)
    ok = (rows >= 0) & (rows < dem_arr.shape[0]) & (cols >= 0) & (cols < dem_arr.shape[1])
    out = np.full(len(xs), np.nan)
    out[ok] = dem_arr[rows[ok], cols[ok]]
    out[out == -9999] = np.nan
    return out


def _parts(geom):
    """Yield every linear component of a geometry, including polygon rings."""
    if geom is None or geom.is_empty:
        return
    t = geom.geom_type
    if t in ("LineString", "LinearRing"):
        yield geom
    elif t == "Polygon":
        yield geom.exterior
    elif hasattr(geom, "geoms"):
        for g in geom.geoms:
            yield from _parts(g)


def segment_table(gdf, dem_arr, transform):
    """Explode lines into vertex pairs with metric length and mean elevation."""
    rows = []
    for geom in gdf.geometry:
        for part in _parts(geom):
            c = np.asarray(part.coords)
            if len(c) >= 2:
                rows.append(c)
    if not rows:
        return pd.DataFrame(columns=["length_m", "elev_m", "x", "y"])
    seg_len, seg_el, mid = [], [], []
    for c in rows:
        dx = np.diff(c[:, 0]) * 111320 * np.cos(np.radians(27.0))
        dy = np.diff(c[:, 1]) * 110540
        seg_len.append(np.hypot(dx, dy))
        el = sample_dem(dem_arr, transform, c[:, 0], c[:, 1])
        seg_el.append(np.nanmean(np.stack([el[:-1], el[1:]]), axis=0))
        mid.append(c[:-1])
    return pd.DataFrame({
        "length_m": np.concatenate(seg_len),
        "elev_m": np.concatenate(seg_el),
    })


def main() -> int:
    report: dict = {"checks": [], "ok": True}

    def check(name, passed, detail=""):
        report["checks"].append({"check": name, "pass": bool(passed), "detail": detail})
        if not passed:
            report["ok"] = False
        print(f"[{'PASS' if passed else 'FAIL'}] {name}" + (f" — {detail}" if detail else ""))

    # ---------------------------------------------------------------- 1. files
    for p in EXPECTED_R:
        check(f"raster exists: {p.name}", p.exists() and p.stat().st_size > 0)
    for name in EXPECTED_V:
        p = GJ / f"{name}.geojson"
        check(f"layer exists: {name}", p.exists() and p.stat().st_size > 0)

    # --------------------------------------------------------------- 2. grids
    with rasterio.open(DEM) as d, rasterio.open(GSW_GRID) as g:
        check("DEM and DEM-aligned GSW share a grid",
              d.width == g.width and d.height == g.height
              and d.transform.almost_equals(g.transform),
              f"{d.width}x{d.height} vs {g.width}x{g.height}")
        check("demgrid CRS is EPSG:4326", g.crs.to_string() == CRS_GEO, g.crs.to_string())
    with rasterio.open(DEM_UTM) as u:
        check("UTM DEM is EPSG:32646", u.crs.to_string() == CRS_UTM, u.crs.to_string())

    # ------------------------------------------------------------ 3. coverage
    with rasterio.open(DEM) as d:
        arr = d.read(1)
        transform = d.transform
        gap = float((arr == -9999).mean())
    check("DEM coverage inside AOI > 99%", gap < 0.01, f"{gap*100:.2f}% nodata")
    with rasterio.open(GSW_GRID) as g:
        gsw_arr = g.read(1)
        gsw_gap = float((gsw_arr == 255).mean())
    check("GSW coverage inside AOI > 99%", gsw_gap < 0.01, f"{gsw_gap*100:.2f}% nodata")

    # ---------------------------------------------- 4. S3 style level sweep
    roads = gpd.read_file(GJ / "roads.geojson")
    island = gpd.read_file(GJ / "majuli_boundary.geojson").geometry.iloc[0]
    roads_island = gpd.clip(roads, island)

    segs = segment_table(roads, arr, transform)
    segs = segs[segs["elev_m"].notna()]
    segs_i = segment_table(roads_island, arr, transform)
    segs_i = segs_i[segs_i["elev_m"].notna()]
    total_km = segs["length_m"].sum() / 1000
    total_km_i = segs_i["length_m"].sum() / 1000

    camps = gpd.read_file(GJ / "shelters.geojson")
    camp_el = sample_dem(arr, transform, camps.geometry.x.values, camps.geometry.y.values)
    camps = camps.assign(dem_elev_m=camp_el)

    bld = gpd.read_file(GJ / "buildings.geojson", columns=["area_m2"])
    bld_c = bld.geometry.representative_point()
    bld_el = sample_dem(arr, transform, bld_c.x.values, bld_c.y.values)
    bld_in = bld.geometry.within(island).to_numpy()

    rows = []
    for level in LEVELS:
        flooded_km = segs.loc[segs["elev_m"] <= level, "length_m"].sum() / 1000
        flooded_km_i = segs_i.loc[segs_i["elev_m"] <= level, "length_m"].sum() / 1000
        b_mask = bld_el <= level
        rows.append(dict(water_level_m=level,
                         road_km_flooded_island=round(flooded_km_i, 1),
                         road_pct_flooded_island=round(100 * flooded_km_i / total_km_i, 1) if total_km_i else 0,
                         camps_flooded=int((camps["dem_elev_m"] <= level).sum()),
                         buildings_flooded_island=int((b_mask & bld_in).sum()),
                         road_km_flooded_aoi=round(flooded_km, 1),
                         buildings_flooded_aoi=int(b_mask.sum()),
                         synthetic="true",
                         note=NOTE))
    sweep = pd.DataFrame(rows)
    sweep.to_csv(OUT / "flood_sweep.csv", index=False)

    mono = all(sweep[c].diff().dropna().ge(0).all()
               for c in ["road_km_flooded_island", "road_km_flooded_aoi", "camps_flooded",
                         "buildings_flooded_island", "buildings_flooded_aoi"])
    check("flood metrics are non-decreasing across the sweep", mono)

    # ------------------------------------------------- 5. camps below water
    below = camps[camps["dem_elev_m"] <= 80]
    check("no camp sits implausibly low for the island (< 70 m)",
          int((camps["dem_elev_m"] < 70).sum()) == 0,
          f"{(camps['dem_elev_m'] < 70).sum()} below 70 m")

    # ------------------------------------------------- 6. scenario integrity
    # Every scenario must reference ids that exist in the delivered layers and
    # sit on the island. This catches the failure we already hit twice: a rule
    # that quietly picked a mainland bridge and a settlement point in the river.
    sc_dir = OUT / "scenarios"
    sc_files = sorted(sc_dir.glob("S*.json")) if sc_dir.exists() else []
    check("scenario files present (S1-S5)", len(sc_files) == 5, f"{len(sc_files)} found")
    layer_map = {"bridges": gpd.read_file(GJ / "bridges.geojson"),
                 "roads": gpd.read_file(GJ / "roads.geojson"),
                 "places": gpd.read_file(GJ / "places.geojson")}
    sc_problems = []
    for f in sc_files:
        cfg = json.loads(f.read_text())
        if not cfg.get("synthetic") or not isinstance(cfg.get("seed"), int):
            sc_problems.append(f"{f.name}: not synthetic or missing integer seed")
        for pb in cfg.get("perturbations", []):
            targets = [pb.get("target"), pb.get("target_settlement")]
            targets += [pb.get("exposed_shelter") or {}]
            for t in targets:
                if not t or "osm_id" not in t:
                    continue
                layer = t.get("layer", "places")
                src = layer_map.get(layer)
                row = src[src["osm_id"] == t["osm_id"]] if src is not None else None
                if row is None or row.empty:
                    sc_problems.append(f"{f.name}: {layer} id {t['osm_id']} not found")
                    continue
                geom = row.geometry.iloc[0]
                inside = (geom.within(island) if geom.geom_type == "Point"
                          else geom.intersects(island))
                if not inside:
                    sc_problems.append(f"{f.name}: {layer} id {t['osm_id']} is outside the island")
    check("every scenario target resolves and lies on the island",
          not sc_problems, "; ".join(sc_problems) if sc_problems else f"{len(sc_files)} configs checked")
    report["scenarios"] = {"files": [f.name for f in sc_files], "problems": sc_problems}
    report["camps"] = {
        "count": int(len(camps)),
        "dem_elev_m_min": round(float(np.nanmin(camp_el)), 1),
        "dem_elev_m_median": round(float(np.nanmedian(camp_el)), 1),
        "dem_elev_m_max": round(float(np.nanmax(camp_el)), 1),
        "below_80m": int(len(below)),
    }

    report["dem"] = {"nodata_pct": round(gap * 100, 2),
                     "min_m": round(float(np.nanmin(np.where(arr == -9999, np.nan, arr))), 1),
                     "max_m": round(float(np.nanmax(np.where(arr == -9999, np.nan, arr))), 1)}
    report["sweep"] = {"levels_m": [LEVELS[0], LEVELS[-1]], "rows": len(sweep),
                       "island_road_km": round(total_km_i, 1),
                       "aoi_road_km": round(total_km, 1),
                       "synthetic": True, "note": NOTE}
    report["router_checks_not_run"] = [
        "reproducible route ids for a fixed seed",
        "route never crosses water deeper than the vehicle threshold",
        "disconnected settlement matches a full reachability check",
    ]
    (OUT / "validation_report.json").write_text(json.dumps(report, indent=2))

    print()
    print(sweep.to_string(index=False))
    print()
    print(f"validation: {'all data-level checks passed' if report['ok'] else 'FAILURES - see report'}")
    print("wrote", OUT / "flood_sweep.csv", "and", OUT / "validation_report.json")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
