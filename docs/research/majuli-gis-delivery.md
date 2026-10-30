# SETU — Majuli GIS Delivery Document

**Status: In progress — data acquisition and pipeline build underway**

This document records Karthik's geographic data acquisition, preprocessing, artifact generation, validation, and presentation deliverables for the SETU hackathon. It is a working document, not an approved design.

## 1. District: Majuli, Assam

| Attribute | Value |
|---|---|
| District | Majuli |
| State | Assam |
| Approx. coordinates | 26.95 N, 94.2 E |
| Area | ~880 km² (river island, ~483 km² per 2011 census) |
| Primary hazard | Brahmaputra riverine flood |
| District status | Recommended in district-selection-audit.md; OQ-02 pending technical lead confirmation |

## 2. Directory Structure

```
data/majuli/
  dem/              Source DEM tiles (Copernicus GLO-30)
  hand/             HAND pipeline artifacts
  roads/            Road network graph
  settlements/      Settlement/village points
  shelters/         Shelter/camp locations
  flood-reference/  Historical flood reference layers (if available)
  fixtures/         Deterministic demo scenario fixtures
  metadata/         Provenance, manifest, validation reports
```

## 3. DEM Acquisition

### 3.1 Source

| Item | Detail |
|---|---|
| Dataset | Copernicus DEM GLO-30 Public |
| Provider | ESA / Copernicus Programme |
| Access | Anonymous download from AWS Open Data bucket `copernicus-dem-30m` |
| License | Copernicus licence (free, attribution required) |
| CRS | EPSG:4326 (geographic, lat/lon) |
| Resolution | ~30 m (1 arc-second), 3600×3600 px per tile |
| Format | Cloud-Optimized GeoTIFF (COG) |
| Vertical datum | Orthometric (EGM2008 per Copernicus lineage — verify per tile XML) |

### 3.2 Tiles Required

| Tile | Coverage | Size | Status |
|---|---|---|---|
| N26E093 | 26–27°N, 93–94°E | ~45 MB | Download in progress |
| N26E094 | 26–27°N, 94–95°E | ~45 MB | Download in progress |
| N27E093 | 27–28°N, 93–94°E | ~45 MB | Download in progress |
| N27E094 | 27–28°N, 94–95°E | ~45 MB | Download in progress |

Total: ~177 MB, one-time build.

### 3.3 Direct URLs

- `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N26_00_E093_00_DEM/Copernicus_DSM_COG_10_N26_00_E093_00_DEM.tif`
- `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N26_00_E094_00_DEM/Copernicus_DSM_COG_10_N26_00_E094_00_DEM.tif`
- `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N27_00_E093_00_DEM/Copernicus_DSM_COG_10_N27_00_E093_00_DEM.tif`
- `https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N27_00_E094_00_DEM/Copernicus_DSM_COG_10_N27_00_E094_00_DEM.tif`

### 3.4 Auxiliary Files (per tile, available in same S3 directory)

| File | Purpose |
|---|---|
| `_EDM.tif` | Edit-class mask (uint8 1–11) — NOT an elevation raster |
| `_WBM.tif` | Water-body mask (uint8) — needed for zero-cell repair |
| `_HEM.tif` | Height-error mask (~46 MB) |
| `_FLM.tif` | Flood layer mask |
| `_DEM.xml` | Tile metadata including vertical datum |

## 4. DEM Inspection (Pending Download)

Once download completes, inspect:

- [ ] CRS and grid dimensions
- [ ] NoData representation
- [ ] Elevation distribution (min, p5, p50, p95, max)
- [ ] Percentage of exactly-zero cells (water bodies)
- [ ] Water-body mask overlap
- [ ] Vertical datum confirmation from tile XML

## 5. HAND Pipeline (Planned)

Per docs/05-geo-and-inundation.md:

```
DEM tiles → mosaic → clip → breach depressions → D8 flow direction
  → flow accumulation → stream extraction (A_T = 5 km²) → nearest drainage
  → HAND grid
```

### Output Artifacts (committed to data/majuli/hand/):

| File | Format | Purpose |
|---|---|---|
| `hand.bin` | uint16, decimetres | Height Above Nearest Drainage |
| `drain_elev.bin` | int16, decimetres offset +2000 m | Drainage cell elevation |
| `reach_id.bin` | uint16 | Stream reach identifier |
| `hillside.png` | RGB | Hillshade basemap |
| `manifest.json` | JSON | bbox, CRS, cell size, A_T, nominal depth, hashes |

### Pipeline Steps:

1. Mosaic 4 DEM tiles, clip to Majuli district window
2. Read `_WBM.tif`, mark water cells
3. Repair zero cells via neighbour diffusion (infill)
4. Subtract nominal channel depth (6 m) inside wetted channel
5. Breach depressions (least-cost)
6. D8 flow direction
7. Flow accumulation
8. Stream extraction at A_T = 5 km²
9. Nearest drainage along flow path
10. Compute HAND = z(c) − z(D(c))

### Library Choice (priority order):

1. `pyflwdir` 0.5.x — installed and verified
2. `WhiteboxTools` 2.3.x via `whitebox` wrapper — fallback
3. numba priority-flood + D8 (~200 lines) — last resort fallback

### Correct Inundation Formulation (from docs/05-geo-and-inundation.md):

```
wet(c) ⇔ H(c) ≤ h(D(c))
depth(c) = max(0, h(D(c)) − H(c))
```

Where H(c) = z(c) − z(D(c)) is height above nearest drainage, and h(D(c)) is hydraulic depth in the channel reach.

**Do NOT use:** `HAND(c) ≤ stage` — this algebraically reduces to `z(c) ≤ S` and cancels the HAND term, degenerating to an unconnected bathtub.

**Do not claim:** hydrodynamic model, forecast skill, validation against observed extent.

## 6. Road Network

| Item | Source | Status |
|---|---|---|
| OSM roads | Geofabrik NE-India PBF (~110 MB) | Downloadable ✅ |
| Bridges | OSM / OSM data | To verify |
| Ferries | Nimati–Kamalabari (web info only) | No GIS layer found |

Road graph must be compatible with backend's `project/network.ts` expectations:
- Edge ID, name, geometry (LineString), class
- Passability determined by depth threshold per road class
- Bridges special-cased (deck elevation vs water surface, not terrain depth)

## 7. Settlements

| Source | Status |
|---|---|
| Census 2011 village directory | 243 villages, but **no lat/long** confirmed |
| OSM place nodes | Available, completeness unverified |

**Decision:** If georeferenced village coordinates cannot be obtained within the time limit, use clearly labelled synthetic settlement points with distinct synthetic IDs. Document that they are not official village locations.

## 8. Shelters

| Source | Status |
|---|---|
| ASDMA flood reports | PDF only, not machine-readable |
| OSDMA / district disaster management plan | Not confirmed downloadable |

**Decision:** If no machine-readable shelter list is available within the time limit, use clearly labelled synthetic shelters with distinct synthetic IDs. Document that they are not official facility locations.

## 9. Scenario Fixture

One deterministic flood-response scenario:

1. Volunteer reports water depth at a reference point (bridge deck)
2. HAND inundation computed
3. Roads become impassable based on depth thresholds
4. Settlements become cut-off
5. Evacuation routing recalculates (latest-safe-departure)
6. Audit trail via event log

## 10. Data Provenance Documentation

To be committed under `data/majuli/metadata/`:

| File | Content |
|---|---|
| `manifest.json` | bbox, CRS, cell size, A_T, nominal depth, file hashes |
| `provenance.md` | Source URLs, access dates, licenses, processing steps |
| `limitations.md` | Known limitations, unverified assumptions |
| `validation.md` | Monotonicity, connectivity, bracket agreement checks |

## 11. Validation Checks (Cheap, Runnable in CI)

1. **Monotonicity:** Inundated area and volume non-decreasing in water depth
2. **Connectivity:** Every wet cell has 8-connected wet path to a stream cell
3. **Bracket agreement:** HAND area vs sloped-bathtub area within 30%

These are consistency checks, not accuracy validation.

## 12. Claims We Will Make / Will Not Make

**Will say:** terrain-based screening of potential inundation for a specified water level; static water surface; no velocity/duration/sediment; no forecast skill; HAND with uniform hydraulic depth; results sensitive to DEM (surface model acquired 2011–2015).

**Will not say:** "flood hazard map", "flood risk", "inundation forecast", "validated", any accuracy percentage as skill, stage → return-period conversion.

## 13. Integration Contract Compatibility

- Road graph: GeoJSON LineString features with `edgeId`, `name`, `geometry`, `class` — compatible with backend `project/network.ts`
- Settlements: GeoJSON Point features with `settlementId`, `name`, `population`, `households`, `needs`, `nodeId`
- Shelters: GeoJSON Point features with `shelterId`, `name`, `capacity`, `occupancy`, `open`, `nodeId`
- Flood: HAND raster read by backend `project/flood.ts` — not a GeoJSON output

Frontend/backend API contract is defined in `docs/coordination/integration-handoff.md`.

## 14. Time Management

| Phase | Hours | Tasks |
|---|---|---|
| 0–0.5 | Inspect files, establish data state, coordinate contracts | — |
| 0.5–3 | Validate DEM, create terrain artifacts | HAND pipeline |
| 3–6 | Prepare road/settlement/shelter data, scenario fixtures | Road graph, settlements, shelters |
| 6–8 | Integrate outputs, run validation | Monotonicity, connectivity, bracket |
| 8–10 | Support demo verification, correct defects | — |
| 8–14 | Document, package, hand off | metadata, validation report |

## 15. Acceptance Criteria

- [ ] Majuli DEM files verified
- [ ] Geographic bounds and CRS documented
- [ ] Water-body and NoData issues handled explicitly
- [ ] HAND artifact produced, or fallback documented
- [ ] Road graph usable by application
- [ ] Settlements accurately sourced or clearly synthetic
- [ ] Shelters accurately sourced or clearly synthetic
- [ ] At least one flood scenario reproducible
- [ ] Data provenance documented
- [ ] Outputs compatible with agreed contract
- [ ] No unsupported accuracy claims
- [ ] OpenCode can reproduce or load artifacts
- [ ] GIS work does not break running application

---

**Last updated:** 2026-10-30 by Karthik's agent  
**Next update:** After DEM download completes and HAND pipeline results known