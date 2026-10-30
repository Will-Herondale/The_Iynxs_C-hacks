# Majuli GIS Delivery — SETU Hackathon

**Branch:** `data/karthik` | **Commit:** `9bf9adb` | **PR:** #16
**Status:** Ready for OpenCode/Darsh integration review
**Deadline:** 9:00 AM tomorrow (14-hour window from original approval)

---

## 1. Approved Project Decisions (from directive)

| Decision | Value |
|---|---|
| District | Majuli, Assam |
| Scope | Flood-response coordination only |
| Offline-first | Required |
| Geographic data | Available locally |
| HAND treatment | Experimental relative-terrain only |
| Embankments | Contextual/unverified only |
| Multi-hazard modelling | Not in scope |

---

## 2. Delivered Artifacts

### Offline Bundle (`geo/data/out/offline/`)

**Core bundle: ~60 MB** — all layers loadable locally, no network required.

| Layer | Features | Size | Classification | Source |
|---|---|---|---|---|
| `vector/roads.geojson` | 11,736 | 9.9 MB | REAL | OSM via Overpass |
| `vector/bridges.geojson` | 518 | 180 KB | REAL | OSM via Overpass |
| `vector/embankments.geojson` | 13 | 40 KB | REAL | OSM (contextual/unverified) |
| `vector/waterways.geojson` | 191 | 370 KB | REAL | OSM via Overpass |
| `vector/waterbodies.geojson` | 120 | 900 KB | REAL | OSM via Overpass |
| `vector/ferries.geojson` | 2 | <1 KB | REAL | OSM via Overpass |
| `vector/majuli_boundary.geojson` | 1 | 8 KB | REAL | OSM admin outline |
| `vector/aoi.geojson` | 1 | 4 KB | REAL | Study box (derived) |
| `vector/settlements.geojson` | 8 | <1 KB | REAL | OSM places (village/hamlet/town) |
| `vector/shelters.geojson` | 23 | 1 KB | REAL | DDMA contingency plan |
| `raster/majuli_dem_30m_wgs84.tif` | raster | 21.7 MB | REAL | Copernicus GLO-30 DSM |
| `raster/majuli_water_occurrence_30m.tif` | raster | 1.5 MB | REAL | JRC GSW v1.4 |
| `raster/majuli_water_occurrence_30m_demgrid.tif` | raster | 1.2 MB | REAL | JRC GSW on DEM grid |
| `scenario/*.json` | 6 files | <1 KB | SYNTHETIC | Authored scenario |

**Optional (excluded from core):**
- `vector/buildings.geojson` — 182,097 features, 52 MB (not needed for core demo)
- `raster/majuli_dem_30m_utm46n.tif` — 23.8 MB (for backend slope/length maths)
- `raster/majuli_hand_30m_wgs84.tif` — 720 KB, EXPERIMENTAL

**Minimum viable bundle: ~33 MB**

### Verification Results

| Check | Result |
|---|---|
| GeoJSON validity | All 14 vector files valid |
| Geometry validity | 0 invalid geometries across all layers |
| CRS | All EPSG:4326 (WGS84, `[lng, lat]`) |
| Bridge 284824410 | Present in road_graph (as road + bridge), deck elev 84.8 m |
| Settlements within island | 8 of 8 |
| Shelters within island | 23 of 23 |
| Road graph components | 1030 (fragmented — OSM data sparsity in Majuli) |
| Bridge endpoints in same component | Yes (component size 86) |
| Auniati to nearest road | ~45 m |
| Schema match vs contract | settlementId/name/population/accessibility/households/needs ✅ shelterId/name/capacity/occupancy/open ✅ roadId/name/status/updatedAt/sourceEventIds ✅ |

### Scenario: S1_obs_driven (observation-driven, synthetic)

| Element | Value |
|---|---|
| Trigger | Volunteer flood_report: water over SH21 bridge deck |
| Bridge | osm_id=284824410, primary, SH21, 139.4 m |
| Deck elevation | 84.8 m (DEM surface, not surveyed) |
| Water level | 85.3 m (deck + 0.5 m offset) |
| Cut-off settlement | Auniati (82.3 m elevation) |
| Nearest shelter | MJ-SH-009 Jengraimukh College (85.2 m) |
| Route | Recalculated, avoids bridge 284824410, 45 min ETA |

### Classification Distinction (preserved everywhere)

| Category | Examples |
|---|---|
| REAL | Roads, bridges, embankments, waterways, waterbodies, ferries, settlements, shelters, DEM, GSW |
| SYNTHETIC | Scenario configs, road_status, settlement_status, shelter_status, flood_extent, route_status |
| EXPERIMENTAL | HAND raster (relative terrain only) |

---

## 3. Limitations & Warnings (must be preserved)

1. **HAND is experimental** — relative terrain only. Do not use for flood extent, road passability, or evacuation safety. 87% of AOI is NoData (mainland drains off-raster); 95% of island cells at HAND=0 (flat floodplain). Max island relief 34.3 m.
2. **Embankments are unverified** — 13 OSM ways (~11 km), all tagged on highway ways. Contextual only, not authoritative flood-defence infrastructure.
3. **Vertical reference is illustrative** — DEM is a DSM (includes canopy/road surface), deck elevation approximated, 0.5 m offset not validated, water level relative to DEM not MSL.
4. **Shelters are pre-identified, not confirmed open** — `open: false`, capacity/occupancy = 0 (not published, not invented).
5. **Population data missing** — only 1 of 62 places has population; WorldPop (1.5 GB) not downloaded due to size.
6. **Road graph fragmented** — 1030 components due to OSM data sparsity in Majuli.
7. **No historical flood claim** — synthetic scenario is not a reconstruction of any real event.

---

## 4. Handoff to OpenCode

**Integration points:**
- Load `geo/data/out/offline/manifest.json` for layer sizes, CRS, provenance, classification
- Vector layers are GeoJSON EPSG:4326 `[lng, lat]`, matching contract `Location {lat, lng}`
- Road `osm_id` → contract `roadId`; settlement `osm_id` → `settlementId`; shelter `shelter_id` → `shelterId`
- Scenario JSONs match contract projection schemas (RoadProps, SettlementProps, ShelterProps, FloodProps, RouteProps)
- No schema changes needed from backend

**Requests:**
- Confirm field mapping between layers and `contract/src/projections.ts` before treating formats as final
- The road graph is fragmented (1030 components) — routing logic should handle disconnected components gracefully

**Do not modify:** frontend, core, or server files. Do not push to main directly.

---

## 5. Handoff to Darsh

**Map layers available locally (no network):**
- Roads, bridges, embankments, waterways, waterbodies, ferries — vector GeoJSON
- Settlements (8), shelters (23) — point vector GeoJSON
- Island boundary, AOI — polygon vector GeoJSON
- DEM (WGS84), GSW occurrence — raster GeoTIFF
- HAND — experimental raster (relative terrain only, not flood extent)

**Symbology recommendations:**
- Roads: thin lines, color by highway class
- Bridges: highlighted lines or markers at bridge osm_ids
- Embankments: dashed/different color, labelled "unverified"
- Settlements: circles, sized by place type (town > village > hamlet)
- Shelters: markers, `open: false` → greyed out or "pre-identified" badge
- Flood extent: semi-transparent polygon (synthetic only)
- Route: highlighted line avoiding blocked bridge

**Offline storage:** Bundle the entire `offline/` directory (~60 MB core, ~33 MB minimum viable) with the app. No PWA or sync protocol needed from GIS side.

---

## 6. Remaining Items (not blocking)

| Item | Status |
|---|---|
| Output format confirmation from team lead | Pending (provisional: GeoJSON + GPKG) |
| WorldPop population download | Deferred (1.5 GB, too large) |
| HAND tuning | Stopped per directive |
| Backend contract sign-off | Pending OpenCode review |

---

## 7. Files Changed (this session)

- `geo/scripts/90_offline_bundle.py` — offline bundle assembler
- `geo/data/out/offline/` — complete offline bundle (manifest + vector + raster + scenario)
- `docs/research/majuli-gis-delivery.md` — this document (new)
- `docs/coordination/agent-status.md` — updated with verification results
- `docs/coordination/messages/agent-karthik.md` — updated with handoff

All committed to `data/karthik`, pushed to origin, PR #16 open to `main`.
