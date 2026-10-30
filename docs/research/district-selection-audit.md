# SETU — District Selection & GIS Data Audit

**Status: Proposed — awaiting subagent findings for Majuli, Jagatsinghpur, Alappuzha**

This document consolidates the comparative geographic data audit for the SETU hackathon district selection. It is a decision aid, not an approved decision. OQ-02 remains open pending the technical lead's explicit confirmation.

## 1. Purpose

SETU must remain district-independent. The district is a demonstration environment only — the core architecture supports different districts through configurable geographic datasets, infrastructure data, hazard models and administrative boundaries.

The district must provide sufficient geographic data to make this demonstration credible:

1. Offline field observation
2. Observation syncs to backend
3. Flood projection updates
4. Road passability changes
5. Settlement becomes disconnected
6. Evacuation routing recalculates
7. Affected settlements identified, safe evacuation options produced
8. Full event log / audit trail

## 2. Candidate Districts

| District | State | Approx. Coordinates | Area | Hazard Type |
|---|---|---|---|---|
| Majuli | Assam | 26.95N, 94.2E | ~880 km² | Brahmaputra riverine flood |
| Jagatsinghpur | Odisha | 20.1N, 86.2E | ~1,700 km² | Cyclone + coastal/river flood |
| Alappuzha | Kerala | 9.5N, 76.4E | ~1,400 km² | Coastal/backwater/pluvial flood |

## 3. Data Audit Framework

Each district is scored 1–5 on:

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

Status categories for each dataset (do not conflate):
- **Exists** — dataset known to exist
- **Publicly accessible** — can be found/accessed online
- **Downloadable** — direct file download available without auth barrier
- **Obtained** — file has been downloaded to this repo
- **Processed** — file has been converted/validated for SETU use

## 4. District-Specific Findings

### 3.1 Majuli, Assam — Verified Facts

| Item | Status | Detail |
|---|---|---|
| Copernicus GLO-30 DEM | Downloaded | Tiles N26E093, N26E094, N27E093, N27E094 (~177 MB total), 30 m, EPSG:4326, anonymous S3 access verified |
| Water bodies in DEM | Known issue | 18% of cells exactly 0.0 m (Brahmaputra channel + wetlands); WBM mask available for repair |
| Vertical datum | EGM2008 orthometric | Assam geoid undulation ~−60 m vs ellipsoid |
| Land elevation | p50 ≈ 86 m | Range 80.5–95.6 m |
| Village count | 243 (district site) | Coordinates not yet verified |
| Shelter list | PDF only (ASDMA) | Not machine-readable |
| Ferry (Nimati–Kamalabari) | Time-varying edge | Timetable not found |
| Embankments | Not in open data | Must be digitized or ignored |

**Confidence: High** — DEM verified, rest largely unverified.

### 3.2 Jagatsinghpur, Odisha — Pending Subagent Findings

| Item | Status | Detail |
|---|---|---|
| Copernicus GLO-30 DEM | Pending | Tiles ~20N, 86E |
| Historical flood data | Pending | 1999 super cyclone, OSDMA reports |
| Road network | Pending | OSM coverage unknown |
| Village data | Pending | Census directory coordinates unknown |
| Shelter list | Pending | OSDMA cyclone shelter network |

**Confidence: None** — subagent findings pending.

### 3.3 Alappuzha, Kerala — Pending Subagent Findings

| Item | Status | Detail |
|---|---|---|
| Copernicus GLO-30 DEM | Pending | Tiles ~9-10N, 76-77E |
| Historical flood data | Pending | 2018 Kerala floods, KSDMA reports |
| Road network | Pending | Kerala generally well-mapped in OSM |
| Village data | Pending | Census directory coordinates unknown |
| Shelter list | Pending | KSDMA flood shelter lists |

**Confidence: None** — subagent findings pending.

## 5. Minimum Dataset Requirements (all districts)

For a complete SETU demonstration, the following are required:

| Dataset | Purpose | Acceptable Source |
|---|---|---|
| DEM (30 m or better) | HAND inundation pipeline | Copernicus GLO-30, anonymous download |
| Road network (with names/classes) | Time-dependent routing | OSM |
| Settlements with coordinates | Cut-off list, reachability | Census village directory + OSM places |
| Shelters with capacity | Evacuation destinations | Disaster management authority lists |
| Rivers/water bodies | Drainage network for HAND | OSM waterways + DEM WBM mask |
| Ferry routes (if applicable) | Time-varying edges | OSM / local knowledge |
| Historical flood extent (optional) | Demo plausibility check | JRC Global Surface Water |

## 6. Evaluation Criteria & Scoring Framework

Score each district 1–5 (1 = poor, 5 = excellent). Weighted total = Σ(score × weight).

| Criterion | Weight | Majuli | Jagatsinghpur | Alappuzha |
|---|---:|---:|---:|---:|
| DEM and terrain suitability | 15% | — | — | — |
| Historical flood-data availability | 20% | — | — | — |
| Road-network quality | 15% | — | — | — |
| Settlement and village data | 15% | — | — | — |
| Shelter and emergency infrastructure | 15% | — | — | — |
| Data accessibility and licensing | 10% | — | — | — |
| Implementation complexity | 5% | — | — | — |
| Demo scenario quality | 5% | — | — | — |
| **Weighted total** | **100%** | **—** | **—** | **—** |

Scores and confidence levels to be filled in from subagent findings.

## 7. Missing / Unusable Datasets (per district)

To be populated from subagent findings.

## 8. GIS Implementation Effort Assessment

| Task | Est. Hours | Dependency |
|---|---|---|
| DEM mosaic + zero repair | 2–3 h | DEM tiles downloaded |
| Breach + D8 + accumulation + HAND | 1–2 h | pyflwdir or WhiteboxTools |
| OSM → road graph | 1–2 h | OSM extract downloaded |
| Settlements + shelters geocoding | 2–3 h | Census/OSM + shelter lists |
| Ferry route encoding | 1 h | Timetable/source found |
| Artifact commit + manifest | 0.5 h | All artifacts ready |
| **Total** | **~7–11 h** | — |

This fits within Karthik's allocated ~11 hours (see task board T3/T4).

## 9. Recommendation (Proposed — Not Approved)

To be populated after subagent findings. Will recommend one district with explicit reasoning, plus a fallback.

**This section is intentionally blank until evidence is consolidated.**

## 10. Sources & Links

To be populated with direct URLs from subagent findings.

---

**Confidence statement:** Majuli DEM facts are verified (anonymous S3 access confirmed). All other district data is unverified pending subagent reports. Do not treat any district score as final until subagent reports are reviewed.
