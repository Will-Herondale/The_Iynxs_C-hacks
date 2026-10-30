#!/usr/bin/env python
"""Build consumption-ready Majuli layers from the raw downloads.

Outputs (data/out):
  majuli.gpkg                      one layer per feature class
  geojson/*.geojson                same layers, EPSG:4326
  majuli_dem_30m_wgs84.tif         Copernicus GLO-30, clipped to the AOI box
  majuli_dem_30m_utm46n.tif        same, EPSG:32646 (metres)
  majuli_water_occurrence_30m.tif  JRC GSW occurrence, clipped
  manifest.csv                     provenance per output

Design notes:
  * The AOI is the documented study box, not a derived outline. Rasters keep
    the river channels around the island, which flood work needs.
  * The OSM administrative outline (if the extract has one) is exported as a
    separate `majuli_boundary` layer rather than being used as a clip mask.
  * Scenario layers are NOT produced here (see SCENARIOS.md), so synthetic
    data can never be mistaken for observed data.
"""
from __future__ import annotations

import json
import pathlib
import sys

import geopandas as gpd
import numpy as np
import pandas as pd
import rasterio
from rasterio.io import MemoryFile
from rasterio.merge import merge
from rasterio.mask import mask as rio_mask
from rasterio.warp import calculate_default_transform, reproject, Resampling
from shapely.geometry import LineString, Point, Polygon, box
from shapely.ops import polygonize, unary_union

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data" / "raw"
OUT = ROOT / "data" / "out"
GJ = OUT / "geojson"
OUT.mkdir(parents=True, exist_ok=True)
GJ.mkdir(parents=True, exist_ok=True)

# lon_min, lat_min, lon_max, lat_max -- the AOI stated in SCENARIOS.md
BBOX = (93.60, 26.78, 94.70, 27.22)
AOI_GEOM = box(*BBOX)
CRS_GEO, CRS_UTM = "EPSG:4326", "EPSG:32646"
RETRIEVED = "2026-10-30"

WAY_COLS = ["osm_id", "name", "highway", "ref", "surface", "bridge", "man_made",
            "waterway", "natural", "water"]


def log(*a):
    print(*a, flush=True)


# ---------------------------------------------------------------- OSM parsing
def load_osm(path: pathlib.Path):
    data = json.loads(path.read_text())
    nodes, ways, rels = [], [], []
    for el in data["elements"]:
        t = el["type"]
        tags = el.get("tags", {})
        if t == "node" and "lat" in el:
            nodes.append((el["id"], Point(el["lon"], el["lat"]), tags))
        elif t == "way" and el.get("geometry"):
            coords = [(p["lon"], p["lat"]) for p in el["geometry"] if p]
            if len(coords) < 2:
                continue
            closed = coords[0] == coords[-1] and len(coords) >= 4
            geom = Polygon(coords) if closed else LineString(coords)
            ways.append((el["id"], geom, tags))
        elif t == "relation" and el.get("members"):
            parts = []
            for m in el["members"]:
                if m.get("geometry"):
                    c = [(p["lon"], p["lat"]) for p in m["geometry"] if p]
                    if len(c) >= 2:
                        parts.append(LineString(c))
            if parts:
                rels.append((el["id"], parts, tags))
    return nodes, ways, rels


def relation_polygon(parts):
    """Assemble a multipolygon relation's member ways into faces.

    polygonize() on the dissolved linework drops holes, which is acceptable for
    Majuli (no enclaves) and is recorded as a limitation in DATASETS.md.
    """
    try:
        merged = unary_union(parts)
        faces = [f for f in polygonize(merged) if f.area > 0]
        if faces:
            return max(faces, key=lambda f: f.area)
    except Exception as e:
        log(f"  polygonize failed ({type(e).__name__}); falling back to ring union")
    rings = [Polygon(p.coords) for p in parts if p.is_ring]
    return unary_union(rings) if rings else None


def find_admin_boundary(rels):
    """Largest OSM administrative relation whose name mentions Majuli."""
    cands = []
    for rid, parts, tags in rels:
        if tags.get("boundary") != "administrative":
            continue
        name = tags.get("name", "")
        if "majuli" not in name.lower():
            continue
        geom = relation_polygon(parts)
        if geom is None or geom.is_empty:
            continue
        if not geom.is_valid:
            geom = geom.buffer(0)
        cands.append((geom.area, rid, name, tags.get("admin_level"), geom))
    if not cands:
        return None
    cands.sort(key=lambda c: c[0], reverse=True)
    _, rid, name, level, geom = cands[0]
    log(f"boundary: '{name}' (relation {rid}, admin_level={level}, "
        f"{len(cands)} candidate(s))")
    return geom, name


def as_line(geom):
    """Closed-ring highway ways (roundabouts) arrive as polygons; a road is a line."""
    if geom is None:
        return None
    if geom.geom_type in ("LineString", "MultiLineString"):
        return geom
    if geom.geom_type == "Polygon":
        return geom.exterior
    if geom.geom_type == "MultiPolygon":
        return LineString([c for p in geom.geoms for c in p.exterior.coords])
    return None


def to_gdf(recs, cols, kind: str, clip=None):
    """Records -> clipped GeoDataFrame, keeping only the expected columns."""
    if not recs:
        return gpd.GeoDataFrame(columns=cols + ["geometry"], geometry="geometry",
                                crs=CRS_GEO)
    if kind == "line":
        recs = [r | {"geometry": as_line(r["geometry"])} for r in recs]
        recs = [r for r in recs if r["geometry"] is not None]
    gdf = gpd.GeoDataFrame([{c: r.get(c) for c in cols} | {"geometry": r["geometry"]}
                            for r in recs], geometry="geometry", crs=CRS_GEO)
    if kind == "polygon":
        gdf = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notna()]
    if clip is not None and len(gdf):
        gdf = gdf[gdf.geometry.intersects(clip)]
        gdf = gpd.clip(gdf, clip)
        gdf = gdf[~gdf.geometry.is_empty]
    return gdf.reset_index(drop=True)


def add_metrics(gdf, kind: str):
    """Metric area / length, computed in UTM 46N so the numbers are meaningful."""
    if len(gdf) == 0:
        return gdf
    utm = gdf.to_crs(CRS_UTM)
    if kind == "polygon":
        return gdf.assign(area_m2=utm.area.round(1))
    return gdf.assign(length_m=utm.length.round(1))


def check_tile_complete(path: pathlib.Path) -> None:
    """Fail loudly on a truncated download.

    A partly-downloaded GeoTIFF can still open and return plausible-looking
    pixels for the rows that made it to disk, which would silently produce a
    half-empty mosaic. Reading the last row forces a read at the end of the
    file and raises if the data is not there.
    """
    try:
        with rasterio.open(path) as s:
            s.read(1, window=((s.height - 1, s.height), (0, s.width)))
    except Exception as e:
        raise SystemExit(
            f"{path.name} is incomplete or unreadable ({type(e).__name__}: {str(e)[:120]}). "
            f"Re-download it before processing."
        )


def main() -> int:
    osm_path = RAW / "osm" / "majuli_osm.json"
    nodes, ways, rels = load_osm(osm_path)
    log(f"OSM: {len(nodes)} nodes, {len(ways)} ways, {len(rels)} relations")

    # ------------------------------------------------------------ AOI layers
    aoi_gdf = gpd.GeoDataFrame({"name": ["Majuli AOI"], "source": ["documented study box"],
                                "area_km2": [round(AOI_GEOM.area, 4)]},
                               geometry=[AOI_GEOM], crs=CRS_GEO)
    aoi_gdf.to_file(GJ / "aoi.geojson", driver="GeoJSON")
    log(f"AOI: documented box {BBOX}")

    manifest = [dict(layer="aoi", features=1, source="Documented study box (not a boundary)",
                     licence="n/a (derived)", retrieved=RETRIEVED, resolution="n/a",
                     crs="EPSG:4326", synthetic="false")]

    admin = find_admin_boundary(rels)
    if admin:
        geom, name = admin
        bdf = add_metrics(gpd.GeoDataFrame({"name": [name]}, geometry=[geom], crs=CRS_GEO),
                          "polygon")
        bdf.to_file(GJ / "majuli_boundary.geojson", driver="GeoJSON")
        bdf.to_file(OUT / "majuli.gpkg", layer="majuli_boundary", driver="GPKG")
        log(f"majuli_boundary: {bdf.area_m2.iloc[0] / 1e6:.1f} km²")
        manifest.append(dict(layer="majuli_boundary", features=1,
                             source=f"OpenStreetMap relation (admin boundary '{name}')",
                             licence="ODbL 1.0", retrieved=RETRIEVED, resolution="vector",
                             crs="EPSG:4326", synthetic="false"))
    else:
        log("majuli_boundary: no suitable OSM admin relation - layer not written")

    # --------------------------------------------------------- feature split
    roads, water_lines, water_polys, bridges, ferries, buildings = [], [], [], [], [], []
    for oid, geom, t in ways:
        rec = dict(osm_id=oid, name=t.get("name"), highway=t.get("highway"),
                   ref=t.get("ref"), surface=t.get("surface"), bridge=t.get("bridge"),
                   man_made=t.get("man_made"), waterway=t.get("waterway"),
                   natural=t.get("natural"), water=t.get("water"), geometry=geom)
        if t.get("highway"):
            roads.append(rec)
            if t.get("bridge") not in (None, "no") or t.get("man_made") == "bridge":
                bridges.append(rec)
        if t.get("waterway"):
            water_lines.append(rec)
        if t.get("natural") == "water" and geom.geom_type == "Polygon":
            water_polys.append(rec)
        if t.get("route") == "ferry":
            ferries.append(rec)
        if t.get("building") and geom.geom_type == "Polygon":
            buildings.append(dict(osm_id=oid, name=t.get("name"),
                                  building=t.get("building"), geometry=geom))

    for rid, parts, t in rels:
        if t.get("natural") == "water":
            geom = relation_polygon(parts)
            if geom is not None:
                water_polys.append(dict(osm_id=rid, name=t.get("name"), natural="water",
                                        water=t.get("water"), geometry=geom))

    places = [dict(osm_id=i, name=t.get("name"), place=t.get("place"),
                   population=t.get("population"), geometry=g)
              for i, g, t in nodes if t.get("place")]
    amenities = [dict(osm_id=i, name=t.get("name"), amenity=t.get("amenity"), geometry=g)
                 for i, g, t in nodes if t.get("amenity")]

    # kind per layer drives which metric column gets attached
    layers = {
        "roads":       (to_gdf(roads, WAY_COLS, "line", AOI_GEOM), "line"),
        "bridges":     (to_gdf(bridges, WAY_COLS, "line", AOI_GEOM), "line"),
        "waterways":   (to_gdf(water_lines, WAY_COLS, "line", AOI_GEOM), "line"),
        "waterbodies": (to_gdf(water_polys, WAY_COLS, "polygon", AOI_GEOM), "polygon"),
        "ferries":     (to_gdf(ferries, WAY_COLS, "line", AOI_GEOM), "line"),
        "places":      (to_gdf(places, ["osm_id", "name", "place", "population"],
                               "point", AOI_GEOM), None),
        "amenities":   (to_gdf(amenities, ["osm_id", "name", "amenity"],
                               "point", AOI_GEOM), None),
        "buildings":   (to_gdf(buildings, ["osm_id", "name", "building"],
                               "polygon", AOI_GEOM), "polygon"),
    }

    for name, (gdf, kind) in layers.items():
        if gdf.empty:
            log(f"{name}: 0 features (layer skipped)")
            continue
        if kind:
            gdf = add_metrics(gdf, kind)
        gdf.to_file(GJ / f"{name}.geojson", driver="GeoJSON")
        gdf.to_file(OUT / "majuli.gpkg", layer=name, driver="GPKG")
        note = ""
        if name == "bridges":
            major = int((gdf.length_m >= 30).sum())
            note = f" ({major} >=30 m long; rest are small culverts on tracks)"
        log(f"{name}: {len(gdf)} features{note}")
        manifest.append(dict(layer=name, features=len(gdf),
                             source="OpenStreetMap via Overpass API", licence="ODbL 1.0",
                             retrieved=RETRIEVED, resolution="vector", crs="EPSG:4326",
                             synthetic="false"))

    # ------------------------------------------------------------- rasters
    dem_tiles = sorted((RAW / "dem").glob("*.tif"))
    if dem_tiles:
        for t in dem_tiles:
            check_tile_complete(t)
        srcs = [rasterio.open(t) for t in dem_tiles]
        mosaic, transform = merge(srcs)
        crs = srcs[0].crs
        meta = srcs[0].meta | {"height": mosaic.shape[1], "width": mosaic.shape[2],
                               "transform": transform, "compress": "lzw", "tiled": True}
        for s in srcs:
            s.close()
        with MemoryFile() as mem:
            with mem.open(**meta) as ds:
                ds.write(mosaic[0], 1)
            with mem.open() as ds:
                clipped, ctransform = rio_mask(ds, [AOI_GEOM], crop=True, filled=True,
                                               nodata=-9999)
                cmeta = ds.meta | {"height": clipped.shape[1], "width": clipped.shape[2],
                                   "transform": ctransform, "nodata": -9999,
                                   "compress": "lzw", "tiled": True}
                with rasterio.open(OUT / "majuli_dem_30m_wgs84.tif", "w", **cmeta) as dst:
                    dst.write(clipped[0], 1)

        with rasterio.open(OUT / "majuli_dem_30m_wgs84.tif") as s:
            dem_gap = float((s.read(1) == -9999).mean())
        log(f"DEM: {dem_gap * 100:.1f}% of the AOI has no elevation data")

        with rasterio.open(OUT / "majuli_dem_30m_wgs84.tif") as src:
            tr, w, h = calculate_default_transform(src.crs, CRS_UTM, src.width, src.height,
                                                   *src.bounds)
            prof = src.profile | {"crs": CRS_UTM, "transform": tr, "width": w, "height": h,
                                  "compress": "lzw", "tiled": True, "nodata": -9999}
            with rasterio.open(OUT / "majuli_dem_30m_utm46n.tif", "w", **prof) as dst:
                reproject(rasterio.band(src, 1), rasterio.band(dst, 1),
                          resampling=Resampling.bilinear, src_nodata=-9999,
                          dst_nodata=-9999)
        log("DEM: wgs84 + utm46n written")
        manifest.append(dict(layer="majuli_dem_30m_*", features="",
                             source="Copernicus DEM GLO-30 (ESA/Airbus), AWS Open Data",
                             licence="Copernicus DEM licence (free, attribution)",
                             retrieved=RETRIEVED, resolution="30 m",
                             crs="EPSG:4326 / EPSG:32646", synthetic="false"))

    gsw = RAW / "gsw" / "occurrence_90E_30Nv1_4_2021.tif"  # spans 20-30N, 90-100E
    if gsw.exists():
        with rasterio.open(gsw) as src:
            clipped, ctransform = rio_mask(src, [AOI_GEOM], crop=True, filled=True, nodata=255)
            prof = src.profile | {"height": clipped.shape[1], "width": clipped.shape[2],
                                  "transform": ctransform, "nodata": 255, "compress": "lzw",
                                  "tiled": True}
            with rasterio.open(OUT / "majuli_water_occurrence_30m.tif", "w", **prof) as dst:
                dst.write(clipped[0], 1)
        with rasterio.open(OUT / "majuli_water_occurrence_30m.tif") as s:
            gsw_gap = float((s.read(1) == 255).mean())
        log(f"GSW: {gsw_gap * 100:.1f}% of the AOI is outside the water dataset")

        # GSW is 1/4000° (~27.8 m) and the DEM is 1/3600° (~30.9 m), so the two
        # grids do not line up. Ship a copy resampled onto the DEM grid as well,
        # otherwise any per-pixel comparison in the app silently misaligns.
        if (OUT / "majuli_dem_30m_wgs84.tif").exists():
            with rasterio.open(OUT / "majuli_dem_30m_wgs84.tif") as ref:
                with rasterio.open(OUT / "majuli_water_occurrence_30m.tif") as src:
                    aligned = np.full((ref.height, ref.width), 255, dtype="uint8")
                    reproject(rasterio.band(src, 1), aligned,
                              dst_transform=ref.transform, dst_crs=ref.crs,
                              resampling=Resampling.nearest,
                              src_nodata=255, dst_nodata=255)
                    prof = ref.profile | {"dtype": "uint8", "nodata": 255,
                                          "compress": "lzw", "tiled": True}
                    with rasterio.open(OUT / "majuli_water_occurrence_30m_demgrid.tif",
                                       "w", **prof) as dst:
                        dst.write(aligned, 1)
            log("GSW: DEM-aligned copy written (majuli_water_occurrence_30m_demgrid.tif)")
            manifest.append(dict(layer="majuli_water_occurrence_30m_demgrid", features="",
                                 source="JRC GSW v1.4 resampled (nearest) onto the Copernicus DEM grid",
                                 licence="Copernicus, free", retrieved=RETRIEVED,
                                 resolution="1/3600° (~31 m)", crs="EPSG:4326",
                                 synthetic="false"))
        log("GSW: occurrence clipped")
        manifest.append(dict(layer="majuli_water_occurrence_30m", features="",
                             source="JRC Global Surface Water v1.4 (1984-2021)",
                             licence="Copernicus, free (attribute 'Source: EC JRC/Google')",
                             retrieved=RETRIEVED, resolution="30 m", crs="EPSG:4326",
                             synthetic="false"))

    pd.DataFrame(manifest).to_csv(OUT / "manifest.csv", index=False)
    log(f"wrote {OUT / 'manifest.csv'} ({len(manifest)} rows)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
