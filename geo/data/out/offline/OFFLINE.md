# Offline Dataset Bundle — SETU Majuli Flood Demo

**Purpose:** Self-contained, geographically bounded GIS dataset that can be bundled
with the SETU application for offline use during disasters. No live Overpass API,
external tile servers, or network services are required to display the demonstration
map.

**Bundle location:** `data/out/offline/`
**Manifest:** `data/out/offline/manifest.json` (sizes, CRS, provenance, classification)

## Bundle contents

```
offline/
  manifest.json         # Size, CRS, provenance, real/synthetic/experimental classification
  vector/               # GeoJSON layers, all EPSG:4326
    majuli_boundary.geojson     1 feature   REAL   island admin outline
    aoi.geojson                 1 feature   REAL   study box clip mask
    roads.geojson          11,736 features REAL   OSM highways with length_m
    bridges.geojson          518 features REAL   bridge-tagged ways, 202 >= 30 m
    embankments.geojson       13 features REAL   embankment=yes ways (~11 km)
    waterways.geojson        191 features REAL   river/stream lines
    waterbodies.geojson      120 features REAL   water polygons
    ferries.geojson           2 features   REAL   ferry crossings
    settlements.geojson       8 features   REAL   island villages/hamlets/towns
    shelters.geojson          23 features  REAL   DDMA pre-identified camps
    buildings.geojson     182,097 features REAL   OPTIONAL (not in core bundle)
  raster/               # GeoTIFF layers
    majuli_dem_30m_wgs84.tif    REAL   Copernicus GLO-30 DSM, EPSG:4326
    majuli_dem_30m_utm46n.tif   REAL   Same, EPSG:32646 (metres)
    majuli_water_occurrence_30m.tif  REAL   JRC GSW occurrence 1984-2021
    majuli_water_occurrence_30m_demgrid.tif  REAL   GSW resampled to DEM grid
    majuli_hand_30m_wgs84.tif   EXPERIMENTAL   Height above nearest drainage
  scenario/             # Synthetic scenario + impact JSONs
    scenario_obs.json          SYNTHETIC   S1: submerged bridge observation
    road_status.json           SYNTHETIC   Road closure impact
    settlement_status.json     SYNTHETIC   Settlement cut-off impact
    shelter_status.json        SYNTHETIC   Shelter reassignment impact
    flood_extent.json          SYNTHETIC   Synthetic flood polygon
    route_status.json          SYNTHETIC   Recalculated evacuation route
```

## Bundle sizes

| Component | Size | Notes |
|---|---|---|
| Core bundle (REAL + SYNTHETIC) | ~60 MB | Load this with the app |
| Optional (buildings) | ~52 MB | Not needed for core demo |
| Total | ~112 MB | |

Core vector layers (roads, settlements, shelters, rivers, boundary): ~12 MB
Core rasters (DEM + GSW): ~48 MB
Scenario/synthetic JSONs: <1 MB

## Classification

Every layer is classified so the frontend can distinguish feature origins:

| Classification | Meaning | Layers |
|---|---|---|
| REAL | Sourced from real data (OSM, DDMA, Copernicus, JRC GSW) | roads, bridges, embankments, waterways, waterbodies, ferries, settlements, shelters, boundary, DEM, GSW |
| SYNTHETIC | Authored for demonstration; not real observations | scenario_obs, road_status, settlement_status, shelter_status, flood_extent, route_status |
| EXPERIMENTAL | Derived but not validated; must not drive flood extent or passability | HAND raster |

## Offline usage requirements

1. **No network:** The frontend loads all layers from local `offline/` files. No Overpass
   requests, no tile server calls, no external geocoding.
2. **CRS:** All vector layers and WGS84 rasters are EPSG:4326 `[lng, lat]`, matching the
   contract `Location {lat, lng}`. The UTM 46N DEM is provided in metres for backend
   slope/length calculations.
3. **Bounded extent:** All data is clipped to the AOI box (93.60–94.70 E, 26.78–27.22 N)
   or the island boundary. No global datasets are included.
4. **Feature distinction:** REAL vs SYNTHETIC vs EXPERIMENTAL is recorded in each layer's
   manifest entry and (for scenario files) in a `synthetic: true` field.

## Storage reduction opportunities

| Option | Savings | Impact |
|---|---|---|
| Exclude buildings (52 MB) | 52 MB | Buildings not needed for core demo; available as optional layer |
| Simplify road geometries | ~2-3 MB | Roads already at native OSM resolution; simplification may lose detail |
| Exclude UTM DEM (24 MB) | 24 MB | Frontend only needs WGS84 DEM; UTM is for backend slope/length |
| Exclude HAND (0.7 MB) | 0.7 MB | HAND is experimental; not needed for core demo |
| Exclude GSW demgrid copy (1.2 MB) | 1.2 MB | Only needed for per-pixel DEM/GSW comparison |
| **Minimum viable bundle** | **~33 MB** | boundary, aoi, roads, bridges, settlements, shelters, waterways, waterbodies, ferries, DEM WGS84, scenario JSONs |

## Integration notes

- OpenCode: The `manifest.json` provides all field mappings needed to load layers into
  the backend. Road `osm_id` → contract `roadId`, settlement `osm_id` → `settlementId`,
  shelter `shelter_id` → `shelterId`.
- Darsh's Claude: All vector layers are GeoJSON EPSG:4326, ready for direct map
  rendering. No network services required.
- Real vs synthetic distinction is maintained throughout: scenario files carry
  `synthetic: true`, HAND is labelled EXPERIMENTAL, embankments are marked
  contextual/unverified.

## Reproducibility

All layers are generated from `scripts/`:
- `00_download.sh` — raw downloads (DEM, GSW, OSM, admin)
- `10_process.py` — clip/convert/reproject to GeoJSON + GeoTIFF
- `20_shelters.py` — camps from DDMA PDF
- `70_hand.py` — HAND raster (experimental)
- `80_demo_artifacts.py` — scenario + impact JSONs
- `90_offline_bundle.py` — this script; assembles the offline bundle

Raw source data (`data/raw/`) is not included in the bundle (440 MB, reproducible from
downloads).
