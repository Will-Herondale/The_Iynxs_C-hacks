# SETU — Routing and GIS

## Overview

SETU uses geographic data from Copernicus GLO-30 DEM and OpenStreetMap to model flood inundation, road passability, and evacuation routing in Majuli, Assam.

## DEM Data

### Source
Copernicus GLO-30 DEM — 30m resolution Digital Elevation Model from ESA/Airbus.

### Processing
1. **Mosaic**: 4 tiles (N26E093, N26E094, N27E093, N27E094) stitched together
2. **Clip**: Cut to Majuli extent (94.0–94.6°E, 26.5–27.2°N)
3. **Format**: EPSG:4326 (WGS84) and EPSG:32646 (UTM 46N for metric calculations)

### DEM Statistics
- Min elevation: 68.2 m
- Max elevation: 1567.4 m
- Mean elevation: ~120 m
- Nodata: 0.06% inside AOI

## HAND (Height Above Nearest Drainage)

### What is HAND?

HAND measures how high each cell is above the nearest stream/river drainage cell:

```
HAND(c) = z(c) - z(D(c))
```

Where z(c) is the cell elevation and z(D(c)) is the drainage cell elevation.

### Computation Pipeline
1. **Flow Direction**: pyflwdir D8 algorithm determines flow direction for each cell
2. **Flow Accumulation**: Counts upstream cells draining through each cell → identifies stream channels
3. **Stream Network**: Cells with accumulation ≥ 5,556 cells (~5 km²) are classified as stream channels
4. **HAND Calculation**: For each cell, compute elevation difference to nearest downstream drainage cell

### HAND Statistics
- Min: -14.59 m (drainage cells, slightly negative due to DEM artifacts)
- Max: 1175.27 m
- Mean: 35.57 m
- HAND = 0 cells: 41,708 (0.77% - drainage cells themselves)

### ⚠️ IMPORTANT: HAND is EXPERIMENTAL

HAND is computed from a DSM (Digital Surface Model) which includes vegetation and building canopy. It has not been calibrated against gauge data and should NOT be used as:
- Independent flood extent determination
- Road passability determination
- Evacuation safety assessment
- Water depth estimation

HAND is used only as a relative terrain reference in the demonstration.

## Road Network

### Source
OpenStreetMap (ODbL 1.0) — 11,736 highway ways on Majuli island.

### Road Classification
- **Primary**: Major roads (SH21, etc.)
- **Secondary**: Secondary roads
- **Tertiary**: Tertiary roads
- **Residential**: Residential streets
- **Track**: Unpaved tracks
- **Service**: Service roads

### Bridge Data
- 518 bridge-tagged ways
- 202 bridges ≥ 30 m length
- Longest bridge: 139.4 m (SH21, osm_id 284824410)

### Connectivity
The road graph has **43 connected components**. The largest component contains 31,060 nodes. Many roads are disconnected fragments. This means NOT all settlements are reachable from all shelters via the road network.

## Routing Engine

### Time-Expanded DAG

SETU uses a time-expanded Directed Acyclic Graph for routing:

1. **Node Expansion**: Each road node is replicated for each time slot
2. **Wait Arcs**: Zero-cost self-loops allow waiting at nodes
3. **Travel Arcs**: Directed edges with travel time cost
4. **Reverse Sweep**: Computes latest safe departure from each node

### Passability Model

Road passability is determined by:
- Flood observations covering the road edge
- Road observations (blocked/partial/open)
- Valid-time observations (events have valid_from/valid_until)

### Route Finding

1. **Build Graph**: Create time-expanded DAG from road network + passability
2. **Find Path**: Forward DP from source node at departure slot
3. **Reverse Sweep**: Compute latest safe departure from each node to reach destination by deadline

### Route Results

```typescript
interface RouteResult {
  path: string[];          // Edge IDs forming the path
  etaS: number;            // Estimated time of arrival (seconds)
  departAt: number;        // Departure epoch ms
  waits: Array<{ nodeId: string; holdS: number }>;  // Waiting at nodes
  replayPassed: boolean;   // Replay validation passed
}
```

### Route Failure Reasons

When no route exists:
- **No connected path**: Settlement and shelter are in different connected components
- **All roads blocked**: All routes blocked by flood observations
- **Time constraints**: No route possible within the time window

## GIS Artifacts

### Road Network (road_graph.geojson)
- 1,673 features (roads, bridges, embankments)
- EPSG:4326 coordinates
- Each feature has osm_id, name, highway, length_m

### Settlements (settlements.geojson)
- 8 settlements on Majuli island
- Each has settlementId, name, population, households, elevation_m

### Shelters (shelters.geojson)
- 23 DDMA pre-identified camps
- All open=false (not confirmed open)
- capacity=0, occupancy=0 (not published)

### Flood Reference Points
- P1: Bridge 284824410 (SH21), deck elevation 84.8 m
- Used as reference point for flood observations

### Synthetic Demo Scenario (SYN-DEMO-001)
- Synthetic settlement (syn-settlement-1) at 94.5°E, 26.8°N
- Synthetic bridge (syn-bridge-1) at 94.5005°E, 26.8005°N
- Synthetic shelter (syn-shelter-1) at 94.501°E, 26.801°N
- Clearly labeled as synthetic — never confused with real data

## Limitations

1. **Real road graph is fragmented**: 43 connected components — many settlements cannot reach any shelter
2. **No live traffic data**: Road passability based on observations only
3. **No truck-specific thresholds**: All vehicles treated equally
4. **No occupancy forecasting**: Shelter occupancy always 0
5. **HAND is experimental**: Not validated for flood extent determination
