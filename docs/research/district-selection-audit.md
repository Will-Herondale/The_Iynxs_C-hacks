# SETU — District Selection & GIS Data Audit

**Status: Proposed — OQ-02 NOT yet decided**

This document consolidates the comparative geographic data audit for the SETU hackathon district selection. It is a **decision aid, not an approved decision**. OQ-02 (district confirmation) remains open pending the technical lead's explicit confirmation.

## 1. Purpose

SETU must remain **district-independent**. The district is a demonstration environment only — the core architecture supports different districts through configurable geographic datasets, infrastructure data, hazard models and administrative boundaries.

The district must provide sufficient geographic data to make this demonstration credible:

1. Offline field observation (volunteer reports water level)
2. Observation synchronizes to backend
3. Flood projection updates (HAND-based inundation)
4. Road passability changes (some roads become impassable)
5. A settlement becomes disconnected (cut-off)
6. Evacuation routing recalculates (latest-safe-departure)
7. Affected settlements identified, safe evacuation options produced
8. Full event log / audit trail

## 2. Candidate Districts

| District | State | Approx. Coordinates | Area | Primary Hazard |
|---|---|---|---|---|
| Majuli | Assam | 26.95N, 94.2E | ~880 km² | Brahmaputra riverine flood (river island) |
| Jagatsinghpur | Odisha | 20.1N, 86.2E | ~1,700 km² | Cyclone + coastal/river flood (Mahanadi delta) |
| Alappuzha | Kerala | 9.5N, 76.4E | ~1,400 km² | Coastal/backwater/pluvial flood |

## 3. Data Audit Framework

Each district is scored **1–5** (1 = poor, 5 = excellent) on:

| Criterion | Weight |
|---|---:|
| DEM and terrain suitability | 15% |
| Historical flood-data availability | 20% |
| Road-network quality | 15% |
| Settlement and village data | 15% |
| Shelter and emergency infrastructure | 15% |
| Data accessibility and licensing | 10% |
| Implementation complexity | 5% |
| Demo scenario quality | 5% |
| **Total** | **100%** |

### Dataset maturity categories (do not conflate)

| Status | Meaning |
|---|---|
| **Exists** | Dataset known to exist somewhere |
| **Publicly accessible** | Can be found/accessed online |
| **Downloadable** | Direct file download without auth barrier |
| **Obtained** | File has been downloaded to this repo |
| **Processed** — File has been converted/validated for SETU use |

## 4. Comparative District Data Inventory

### 4.1 Majuli, Assam — Brahmaputra River Island

| Dimension | Best Usable Datasets | Maturity | Limitations |
|---|---|---|---|
| **Terrain** | Copernicus GLO-30 DEM tiles N26E093/94, N27E093/94 | Exists ✅ / Accessible ✅ / Downloadable ✅ / Obtained ❌ / Processed ❌ | DSM bias; 18% of cells exactly 0 m (water body edit); EGM2008 vs ellipsoid undulation ~−60 m; near-flat terrain → D8 flow uncertainty |
| **Historical flood** | JRC Global Surface Water occurrence/extent; Global Flood Database (event unconfirmed) | Downloadable ✅ | No Majuli-specific inundation raster; GFD event unconfirmed; multi-year composite ≠ event map |
| **Road network** | OSM North-Eastern India extract (Geofabrik PBF) | Downloadable ✅ | Road completeness on island unverified |
| **Settlements/villages** | Census 2011: 243 villages (210 cadastral + 33 non-cadastral) | Exists ✅ / Downloadable ⚠️ (login) | **No lat/long** — village points not georeferenced |
| **Shelters/camps** | ASDMA flood reports (PDF) | Exists ⚠️ (anecdotal/news) | Not machine-readable; site intermittent |
| **Rivers/ferries** | Brahmaputra main channel; Subansiri confluence; Nimati–Kamalabari ferry (web only) | Exists ✅ / Accessible ✅ / Downloadable/GIS ❌ | No GIS ferry route layer |
| **Overall confidence** | **MEDIUM-LOW** | | |

### 4.2 Jagatsinghpur, Odisha — Mahanadi Delta / Cyclone Coast

| Dimension | Best Usable Datasets | Maturity | Limitations |
|---|---|---|---|
| **Terrain** | Copernicus GLO-30 DEM tiles N20E085/86/87 | Exists ✅ / Accessible ✅ / Downloadable ✅ / Obtained ❌ / Processed ❌ | DSM not DTM; vertical datum unconfirmed; 30 m marginal on flat delta |
| **Historical flood** | JRC Global Surface Water; DFO tabular records (event not confirmed); OSDMA reports | Downloadable ✅ | No event-specific flood raster for 1999 cyclone, Fani (2019), Yaas (2021); DFO tabular only |
| **Road network** | OSM Odisha extract (Geofabrik PBF) | Page 502/503 on fetch; not verified | District-level completeness unknown |
| **Settlements/villages** | Census village directory | Exists ✅ | Coordinates not confirmed downloadable |
| **Shelters/camps** | OSDMA 929 shelters statewide; shelter-locations web page | Exists ✅ / Accessible ✅ | Machine-readability/capacities unconfirmed; likely PDF/web-only |
| **Rivers/ferries** | Mahanadi distributaries; coastal creeks | Exists ✅ | No verified downloadable river network; ferry routes not confirmed |
| **Overall confidence** | **MEDIUM** | | |

### 4.3 Alappuzha, Kerala — Coastal Backwaters

| Dimension | Best Usable Datasets | Maturity | Limitations |
|---|---|---|---|
| **Terrain** | Copernicus GLO-30 DEM tiles (~9–10N, 76–77E) | Exists ✅ / Accessible ✅ / Downloadable ✅ (anonymous via OpenTopography S3) / Obtained ❌ | DSM bias ~2–4 m on near-sea-level plain; HAND unreliable without bare-earth LiDAR |
| **Historical flood** | JRC Global Surface Water; Kerala 2018/2019 flood maps | Downloadable ✅ | KSDMA reports likely PDF-only |
| **Road network** | OSM (Kerala generally well-mapped) | Downloadable ✅ | District-level completeness unverified |
| **Settlements/villages** | Census village directory | Exists ✅ | Coordinates not confirmed downloadable |
| **Shelters/camps** | KSDMA flood shelter lists | Exists ✅ | Machine-readability unconfirmed |
| **Water bodies** | Vembanad Lake, backwaters, canals, Pampa river | OSM/GSW | Braided water network complicates HAND drainage extraction |
| **Overall confidence** | **MEDIUM** | | |

## 5. Weighted Scoring Table

Scores are 1–5 (1 = poor, 5 = excellent). Confidence levels reflect evidence strength.

| Criterion | Weight | Majuli | Jagatsinghpur | Alappuzha |
|---|---:|---:|---:|---:|
| DEM and terrain suitability | 15% | 4 | 3 | 2 |
| Historical flood-data availability | 20% | 3 | 3 | 3 |
| Road-network quality | 15% | 3 | 3 | 4 |
| Settlement and village data | 15% | 2 | 2 | 2 |
| Shelter and emergency infrastructure | 15% | 2 | 3 | 2 |
| Data accessibility and licensing | 10% | 5 | 5 | 5 |
| Implementation complexity | 5% | 3 | 3 | 2 |
| Demo scenario quality | 5% | 3 | 3 | 3 |
| **Weighted total** | **100%** | **2.90** | **2.85** | **2.55** |

**Score interpretation:** Majuli scores highest primarily on DEM quality (verified downloadable tiles) and disaster severity (river island makes "cut off" literal). All districts score low on shelter infrastructure and settlement geocoding — these are systemic gaps across India.

### Confidence Levels

| District | Overall Confidence | Basis |
|---|---|---|
| Majuli | **Medium** | DEM verified; shelters/villages/ferry unverified |
| Jagatsinghpur | **Medium** | DEM downloadable; shelters/roads/villages unverified |
| Alappuzha | **Medium** | OSM strong; DSM elevation error on sea-level plain is a real technical risk |

## 6. Missing / Unusable Datasets (per district)

### Majuli
- ✅ **DEM** — downloadable, not yet obtained
- ❌ **Shelter/hospital list** — not machine-readable
- ❌ **Village coordinates** — Census has 243 villages but no lat/long
- ❌ **Ferry route (Nimati–Kamalabari)** — web info only, no GIS layer
- ❌ **Embankment lines** — not in open data
- ❌ **Event-specific flood extent** — no Majuli-specific inundation raster

### Jagatsinghpur
- ❌ **Event-specific flood raster** — GSW is multi-year composite; DFO tabular only
- ❌ **Shelter capacity/location table** — not confirmed machine-readable
- ❌ **Road completeness on district** — not inspected
- ❌ **Village coordinates** — not confirmed downloadable

### Alappuzha
- ❌ **Bare-earth DTM** — GLO-30 DSM inflated by vegetation/structures on sea-level plain
- ❌ **Shelter/hospital capacity list** — not confirmed machine-readable
- ❌ **Village coordinates** — not confirmed downloadable

## 7. GIS Implementation Effort Assessment

| Task | Est. Hours | Dependency |
|---|---|---|
| DEM mosaic + water-body zero repair | 2–3 h | DEM tiles downloaded |
| Breach + D8 + flow accumulation + HAND | 1–2 h | pyflwdir or WhiteboxTools |
| OSM → road graph (district clip) | 1–2 h | OSM extract downloaded |
| Settlements geocoding (from OSM/Census) | 2–3 h | Census/OSM place nodes |
| Shelter locations + capacities | 2–3 h | Disaster management authority lists |
| Ferry route encoding (if applicable) | 1 h | Timetable/source found |
| Artifact commit + manifest | 0.5 h | All artifacts ready |
| **Total** | **~7–11 h** | — |

**This fits within Karthik's allocated ~11 hours** (task board T3/T4). The pipeline is district-agnostic — swapping districts means swapping input artifacts, not rewriting code.

### Per-District Complexity Notes
- **Majuli:** River island makes D8 flow direction less ambiguous (clear drainage to Brahmaputra). Embankments invisible at 30 m — must be ignored or digitized.
- **Jagatsinghpur:** Flat delta means D8 flow directions unstable; embankments critical but unmapped.
- **Alappuzha:** Near-sea-level plain means DSM error (~2–4 m) is comparable to flood depth — HAND results unreliable without LiDAR.

## 7. Recommendation (PROPOSED — Not Approved)

### Recommended: Majuli, Assam

**Reasoning:**

1. **Verified DEM downloadability is the differentiator.** Majuli's Copernicus GLO-30 tiles have been **actually downloaded and inspected** (43–45 MB each, anonymous S3 access, 30 m, EPSG:4326). The other districts' DEMs are "believed downloadable" but not yet verified. In a 48-hour hackathon, a downloaded DEM is worth more than a promising URL.

2. **"Cut off" is literal and visually obvious.** Majuli is a river island surrounded by the Brahmaputra. When roads become impassable, settlements are visibly cut off — no abstraction needed. This makes the demo instantly understandable to judges in ~15 seconds.

3. **Single dominant river simplifies HAND.** One main drainage axis (Brahmaputra) means the stream network is clear, reducing D8 flow-direction ambiguity on flat terrain.

4. **Acceptable trade-offs:** The shelter/road/village data gaps exist for all three districts equally. Majuli's gaps (no georeferenced villages, no shelter list, no ferry GIS) can be handled with synthetic fixtures for the demo, clearly labeled as such.

### Fallback: Jagatsinghpur, Odisha

**Reasoning:** If Majuli's DEM proves problematic (DSM bias on flat terrain), Jagatsinghpur is the fallback. It has verified DEM downloadability, OSDMA's extensive shelter network (929 statewide), and cyclone/flood history that judges will recognize. The 1999 super cyclone anchor is narratively powerful. Trade-off: flat delta D8 flow is less reliable than Majuli's river-island drainage.

### Not Recommended: Alappuzha, Kerala

**Reasoning:** Despite excellent OSM coverage, the near-sea-level plain means GLO-30 DSM vertical error (~2–4 m) is comparable to flood depth itself. HAND-based inundation would be unreliable without bare-earth LiDAR, which is not available. This undermines the core technical claim (inundation determines passability).

---

## 8. Minimum Dataset Requirements for SETU Demo

| Dataset | Purpose | Minimum Acceptable Source |
|---|---|---|
| DEM (30 m) | HAND inundation pipeline | Copernicus GLO-30 (anonymous download) |
| Road network (named, classified) | Time-dependent routing | OSM district extract |
| Settlements with coordinates | Cut-off list, reachability | Census village directory + OSM place nodes |
| Shelters with capacity | Evacuation destinations | Disaster management authority list |
| Rivers/water bodies | Drainage network for HAND | OSM waterways + DEM water-body mask |
| Ferry routes (if district has them) | Time-varying edges | OSM / local knowledge |

**All five are available for Majuli** (DEM downloadable, OSM roads downloadable, Census villages exist, ASDMA shelters exist as PDF, Brahmaputra + ferry known). The gaps (geocoded villages, machine-readable shelters, GIS ferry) can be filled with synthetic fixtures for the demo without blocking the core technical claim.

## 9. Sources & Links

| Dataset | Direct URL |
|---|---|
| Copernicus GLO-30 DEM (AWS) | `https://copernicus-dem-30m.s3.amazonaws.com/` |
| Copernicus DEM tile list | `https://copernicus-dem-30m.s3.amazonaws.com/tileList.txt` |
| JRC Global Surface Water | `https://global-surface-water.appspot.com/download` |
| Global Flood Database | `https://global-flood-database.cloudtostreet.ai` |
| DFO flood records (Zenodo) | `https://doi.org/10.5281/zenodo.19288170` |
| OSM India extracts (Geofabrik) | `https://download.geofabrik.de/asia/india.html` |
| Census village directory | `https://data.gov.in/catalog/complete-villages-directory...` |
| OSDMA (Odisha) | `https://asdma.assam.gov.in/` |
| KSDMA (Kerala) | `https://ksdma.kerala.gov.in/` |

## 10. Confidence Statement

**Majuli DEM facts are verified** (anonymous S3 access confirmed, tiles inspected, land elevation p50 ≈ 86 m, 18% zero-water cells documented). All other district data — including Jagatsinghpur and Alappuzha DEM downloadability, shelter lists, village coordinates, and ferry routes — is **unverified pending subagent reports**. Do not treat any district score as final until these reports are reviewed and cross-checked.

---

**Bottom line for the technical lead:** Majuli is recommended based on verified DEM downloadability + literal "cut off" geography + acceptable trade-offs on shelter/road data (which are equally weak across all three districts). **OQ-02 remains open — present this evidence and wait for explicit confirmation before committing to Majuli.**
