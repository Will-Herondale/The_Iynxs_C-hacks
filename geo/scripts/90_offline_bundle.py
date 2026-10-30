#!/usr/bin/env python
"""Build the offline-capable Majuli dataset bundle for the SETU demo application.

This script assembles a self-contained, geographically bounded set of GIS
artifacts that can be bundled with the application for offline use during
disasters. No live Overpass, external tile servers, or network services are
required to display the demonstration map.

Output: data/out/offline/
  vector/     GeoJSON layers (EPSG:4326)
  raster/     GeoTIFF layers (EPSG:4326 except UTM DEM)
  scenario/   Synthetic scenario + impact JSONs
  manifest.json  Size, CRS, provenance, real/synthetic/experimental classification

Classification of every layer:
  REAL        - Sourced from real data (OSM, DDMA, Copernicus, JRC GSW)
  SYNTHETIC   - Authored for demonstration (scenarios, flood extents, route changes)
  EXPERIMENTAL - Derived but not validated (HAND); must not drive flood extent
                or passability decisions.

Core offline bundle (recommended for app bundling):
  roads, bridges, embankments, settlements, shelters, waterways, waterbodies,
  ferries, majuli_boundary, aoi, DEM, GSW occurrence, scenario files.
  Total: ~35 MB (excluding optional buildings).

Optional (not in core bundle):
  buildings.geojson - 182,097 footprints, 56 MB. Not needed for core demo.
  HAND raster - experimental relative-terrain layer only.
"""
from __future__ import annotations

import json
import pathlib
import shutil

import geopandas as gpd

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "out"
GJ = OUT / "geojson"
DEMO = OUT / "demo"
OFFLINE = OUT / "offline"
VEC = OFFLINE / "vector"
RAS = OFFLINE / "raster"
SCE = OFFLINE / "scenario"

for d in (VEC, RAS, SCE):
    d.mkdir(parents=True, exist_ok=True)

MANIFEST = {
    "bundle": "majuli-offline-demo",
    "description": "Self-contained Majuli flood-demo dataset for offline application use",
    "crs": "EPSG:4326 (all vector layers and WGS84 rasters); UTM 46N DEM also provided in metres",
    "aoi_box": [93.60, 26.78, 94.70, 27.22],
    "generated": "2026-10-30",
    "network_required": False,
    "notes": "No live Overpass, tile server, or network service needed. All layers load from local files.",
    "classification": {
        "REAL": "Sourced from real data (OSM, DDMA plan, Copernicus DEM, JRC GSW)",
        "SYNTHETIC": "Authored for demonstration; not real observations",
        "EXPERIMENTAL": "Derived but not validated; HAND only - must not drive flood extent/passability",
    },
    "layers": [],
    "total_core_mb": 0.0,
    "total_optional_mb": 0.0,
}

REAL = "REAL"
SYNTHETIC = "SYNTHETIC"
EXPERIMENTAL = "EXPERIMENTAL"


def add_vector(src: pathlib.Path, classification: str, source: str, licence: str,
               notes: str = "", core: bool = True, simplify_tolerance: float | None = None):
    """Copy (optionally simplify) a vector layer into the offline bundle."""
    gdf = gpd.read_file(src)
    if simplify_tolerance is not None and len(gdf) > 0:
        gdf = gdf.copy()
        gdf["geometry"] = gdf.simplify(simplify_tolerance, preserve_topology=True)
        gdf = gdf[~gdf.geometry.is_empty & gdf.geometry.notna()]
    dst = VEC / src.name
    gdf.to_file(dst, driver="GeoJSON")
    size_mb = dst.stat().st_size / 1e6
    entry = {
        "file": f"vector/{src.name}",
        "features": int(len(gdf)),
        "size_mb": round(size_mb, 2),
        "crs": "EPSG:4326",
        "classification": classification,
        "source": source,
        "licence": licence,
        "core": core,
        "notes": notes,
    }
    MANIFEST["layers"].append(entry)
    if core:
        MANIFEST["total_core_mb"] += size_mb
    else:
        MANIFEST["total_optional_mb"] += size_mb
    print(f"  vector/{src.name}: {len(gdf):,} features, {size_mb:.2f} MB, {classification}")


def add_raster(src: pathlib.Path, classification: str, source: str, licence: str,
               notes: str = "", core: bool = True):
    """Copy a raster layer into the offline bundle."""
    dst = RAS / src.name
    shutil.copy2(src, dst)
    size_mb = dst.stat().st_size / 1e6
    entry = {
        "file": f"raster/{src.name}",
        "features": "raster",
        "size_mb": round(size_mb, 2),
        "crs": "EPSG:4326" if "utm46n" not in src.name else "EPSG:32646",
        "classification": classification,
        "source": source,
        "licence": licence,
        "core": core,
        "notes": notes,
    }
    MANIFEST["layers"].append(entry)
    if core:
        MANIFEST["total_core_mb"] += size_mb
    else:
        MANIFEST["total_optional_mb"] += size_mb
    print(f"  raster/{src.name}: {size_mb:.2f} MB, {classification}")


def add_scenario(src: pathlib.Path, classification: str, source: str, licence: str,
                 notes: str = "", core: bool = True):
    """Copy a scenario/impact JSON into the offline bundle."""
    dst = SCE / src.name
    shutil.copy2(src, dst)
    size_mb = dst.stat().st_size / 1e6
    # Count features if it's a FeatureCollection
    features = "n/a"
    try:
        data = json.loads(dst.read_text())
        if isinstance(data, dict) and "features" in data:
            features = len(data["features"])
    except Exception:
        pass
    entry = {
        "file": f"scenario/{src.name}",
        "features": features,
        "size_mb": round(size_mb, 2),
        "crs": "EPSG:4326",
        "classification": classification,
        "source": source,
        "licence": licence,
        "core": core,
        "notes": notes,
    }
    MANIFEST["layers"].append(entry)
    if core:
        MANIFEST["total_core_mb"] += size_mb
    else:
        MANIFEST["total_optional_mb"] += size_mb
    print(f"  scenario/{src.name}: {features} features, {size_mb:.2f} KB, {classification}")


# ---------------------------------------------------------------- vector layers
print("== Vector layers (REAL) ==")
add_vector(GJ / "majuli_boundary.geojson", REAL,
           "OpenStreetMap relation (admin boundary 'Majuli')", "ODbL 1.0",
           "Island administrative outline ~798 km² incl. river/sandbars")
add_vector(GJ / "aoi.geojson", REAL,
           "Documented study box (derived)", "n/a (derived)",
           "Clip mask 93.60-94.70 E, 26.78-27.22 N")
add_vector(GJ / "roads.geojson", REAL,
           "OpenStreetMap via Overpass API", "ODbL 1.0",
           "11,736 highway ways on island; length_m metric attached")
add_vector(GJ / "bridges.geojson", REAL,
           "OpenStreetMap via Overpass API", "ODbL 1.0",
           "518 bridge-tagged ways; 202 >= 30 m; length_m attached")
add_vector(GJ / "embankments.geojson", REAL,
           "OpenStreetMap via Overpass API", "ODbL 1.0",
           "13 embankment=yes ways (~11 km); contextual/unverified, not authoritative flood defence")
add_vector(GJ / "waterways.geojson", REAL,
           "OpenStreetMap via Overpass API", "ODbL 1.0",
           "191 river/stream lines")
add_vector(GJ / "waterbodies.geojson", REAL,
           "OpenStreetMap via Overpass API", "ODbL 1.0",
           "120 water polygons")
add_vector(GJ / "ferries.geojson", REAL,
           "OpenStreetMap via Overpass API", "ODbL 1.0",
           "2 ferry crossings (Nimati-Kamalabari type)")
add_vector(DEMO / "settlements.geojson", REAL,
           "OpenStreetMap places (village/hamlet/town on island)", "ODbL 1.0",
           "8 island settlements; population only for 1 of 62 places (unset=not invented)")
add_vector(DEMO / "shelters.geojson", REAL,
           "DDMA Majuli Flood Contingency Plan 2026-27 PDF", "DDMA Majuli (no open licence)",
           "23 pre-identified camps; open=false (not confirmed open); coordinates as published")

# Buildings: optional, large. Include simplified version as optional.
print("\n== Vector layers (OPTIONAL) ==")
add_vector(GJ / "buildings.geojson", REAL,
           "OpenStreetMap via Overpass API", "ODbL 1.0",
           "182,097 building footprints; NOT needed for core demo. Simplified 0.0001° ~11 m.",
           core=False, simplify_tolerance=0.0001)

# ---------------------------------------------------------------- raster layers
print("\n== Raster layers ==")
add_raster(OUT / "majuli_dem_30m_wgs84.tif", REAL,
           "Copernicus DEM GLO-30 (ESA/Airbus), clipped to AOI",
           "Copernicus DEM licence (free, attribution)",
           "DSM (includes vegetation/buildings canopy); 0.06% nodata inside AOI")
add_raster(OUT / "majuli_dem_30m_utm46n.tif", REAL,
           "Copernicus DEM GLO-30, UTM 46N reprojected",
           "Copernicus DEM licence (free, attribution)",
           "Metres; for slope/length maths")
add_raster(OUT / "majuli_water_occurrence_30m.tif", REAL,
           "JRC Global Surface Water v1.4 occurrence 1984-2021",
           "Copernicus, free (attribute 'Source: EC JRC/Google')",
           "Native 1/4000° grid; 0.09% nodata inside AOI")
add_raster(OUT / "majuli_water_occurrence_30m_demgrid.tif", REAL,
           "JRC GSW resampled (nearest) onto DEM grid",
           "Copernicus, free",
           "Stacks pixel-for-pixel with DEM for per-pixel comparison")
add_raster(OUT / "majuli_hand_30m_wgs84.tif", EXPERIMENTAL,
           "Derived from Copernicus DEM + JRC GSW (scripts/70_hand.py)",
           "Derived from Copernicus DEM (free) + JRC GSW (free)",
           "HAND = height above nearest GSW-mapped drainage. EXPERIMENTAL: relative terrain only, "
           "not flood extent. 87% of AOI nodata (drains off-raster/to sinks); 95% of island at HAND=0")

# ---------------------------------------------------------------- scenario files
print("\n== Scenario / impact layers (SYNTHETIC) ==")
add_scenario(DEMO / "scenario_obs.json", SYNTHETIC,
             "Authored demonstration scenario", "n/a (synthetic)",
             "S1 observation-driven: submerged bridge SH21 osm_id=284824410, water level 85.3 m")
add_scenario(DEMO / "road_status.json", SYNTHETIC,
             "Authored demonstration impact", "n/a (synthetic)",
             "Bridge road blocked from observation event")
add_scenario(DEMO / "settlement_status.json", SYNTHETIC,
             "Authored demonstration impact", "n/a (synthetic)",
             "Auniati cut_off; other settlements accessible")
add_scenario(DEMO / "shelter_status.json", SYNTHETIC,
             "Authored demonstration impact", "n/a (synthetic)",
             "Shelter reassignment; open=false until DDMA confirms")
add_scenario(DEMO / "flood_extent.json", SYNTHETIC,
             "Authored demonstration flood polygon", "n/a (synthetic)",
             "Synthetic flood polygon around bridge area; not observed or historical")
add_scenario(DEMO / "route_status.json", SYNTHETIC,
             "Authored demonstration route", "n/a (synthetic)",
             "Recalculated evacuation route avoiding submerged bridge")

# ---------------------------------------------------------------- write manifest
MANIFEST["total_core_mb"] = round(MANIFEST["total_core_mb"], 2)
MANIFEST["total_optional_mb"] = round(MANIFEST["total_optional_mb"], 2)
MANIFEST["total_mb"] = round(MANIFEST["total_core_mb"] + MANIFEST["total_optional_mb"], 2)

# Classification summary
real = [l for l in MANIFEST["layers"] if l["classification"] == REAL]
syn = [l for l in MANIFEST["layers"] if l["classification"] == SYNTHETIC]
exp = [l for l in MANIFEST["layers"] if l["classification"] == EXPERIMENTAL]
MANIFEST["summary"] = {
    "real_layers": len(real),
    "synthetic_layers": len(syn),
    "experimental_layers": len(exp),
    "core_bundle_mb": MANIFEST["total_core_mb"],
    "optional_mb": MANIFEST["total_optional_mb"],
    "total_mb": MANIFEST["total_mb"],
}

(OUT / "offline" / "manifest.json").write_text(json.dumps(MANIFEST, indent=2))
print(f"\n=== Offline bundle complete ===")
print(f"Core bundle: {MANIFEST['total_core_mb']} MB ({len(real)} REAL + {len(syn)} SYNTHETIC)")
print(f"Optional: {MANIFEST['total_optional_mb']} MB")
print(f"Total: {MANIFEST['total_mb']} MB")
print(f"Manifest: data/out/offline/manifest.json")
