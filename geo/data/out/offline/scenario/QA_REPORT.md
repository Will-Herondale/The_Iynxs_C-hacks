# SETU GIS QA Report — Network-Valid Demonstration

**Date:** 2026-10-30
**Branch:** `data/karthik`
**Commit:** `a629a0f` (plus scenario corrections)
**Prepared by:** Karthik (GIS / Data / Validation Lead)

---

## 1. Executive Summary

The original scenario (S1_obs_driven) contained **three unsupported claims** that could not be validated against the real road graph:

| Claim | Status | Evidence |
|---|---|---|
| Auniati cut off by bridge 284824410 | ❌ FALSE | Auniati is 4.9 km from the bridge; bridge removal does not disconnect Auniati from the road graph |
| MJ-SH-009 serving Auniati | ❌ FALSE | MJ-SH-009 is 21.6 km from Auniati; no shelter shares a connected component with any settlement |
| 45-minute computed ETA | ❌ FALSE | ETA=45 is hardcoded in fixture; no routing engine ran |

**Resolution:** A new synthetic scenario (`SYN-DEMO-001`) uses an explicitly synthetic local road subgraph placed 13.3 km from any real feature. This provides a network-valid demonstration with verifiable before/after connectivity. Real geography is unaltered.

---

## 2. Road Graph Connectivity Investigation

### 2.1 Method

The road graph (`data/out/demo/road_graph.geojson`, 1,671 features) was analyzed using union-find on snapped endpoints (5 decimal places ≈ 1.1 m). Two endpoints are connected if they share the same snapped coordinate; two endpoints within the same feature are connected by that feature.

### 2.2 Findings

| Metric | Value |
|---|---|
| Total road graph features | 1,671 (1,583 roads + 80 bridges + 8 embankments) |
| Total unique endpoints | 2,619 |
| Connected components | 1,030 |
| Largest component | 86 endpoints, 107 features |
| Components of size 2–5 | 1,001 (97%) |
| Components of size 6–20 | 28 |
| Components of size 21+ | 1 |

### 2.3 Cause of Fragmentation

**1,345 road pairs cross without shared endpoints.** This is the primary cause of fragmentation. Roads intersect geometrically but do not share a node, which is a known OSM data quality issue in the region. All 80 bridge endpoints match road endpoints at 0.0001° tolerance, so bridges are not the cause.

**Bridge 284824410 appears twice** in the road graph: once as a road-layer feature (idx=1023) and once as a bridge-layer feature (idx=1600), with identical geometry. This duplication does not affect connectivity analysis.

### 2.3 Settlement Connectivity

| Settlement | ID | Distance to nearest road | Component |
|---|---|---|---|
| Kamalabari | 2885275507 | 0 m (exact snap) | Component 0 |
| Auniati | 10692764768 | 45 m | Component 0 |
| Dakhinpat | 2885248524 | 144 m | Component 0 |
| Kaibatra | 2885275505 | 55 m | Component 458 (2 endpoints) |
| Garamur | 5263416924 | 11 m | Component 742 (2 endpoints) |
| Kakarikata | 2885288332 | 62 m | Component 941 (2 endpoints) |
| Birinabari | 2885288331 | 68 m | Component 708 (2 endpoints) |
| Deodia | 2885275504 | 122 m | No component within 111 m |

Only component 0 (86 endpoints) contains more than one settlement: Kamalabari, Auniati, and Dakhinpat.

---

## 2.4 Shelter Connectivity

| Shelter | ID | Distance to nearest road | Component |
|---|---|---|---|
| MJ-SH-022 Pitambar Dev Goswami Junior College | MJ-SH-022 | 30 m | Component 10 (9 endpoints) |
| MJ-SH-023 Garamur Sadar LPS | MJ-SH-023 | 85 m | Component 970 (2 endpoints) |
| MJ-SH-015 Meragarh Misamari LPS | MJ-SH-015 | 34 m | Component 701 (2 endpoints) |
| MJ-SH-003 2No. Ujani Ratanpur Miri LP | MJ-SH-003 | 43 m | Component 46 (5 endpoints) |
| All other 19 shelters | — | 47–673 m | Various 2-endpoint components or unconnected |

**Critical finding: No connected component contains both a settlement and a shelter.** Therefore, no real-data settlement-to-shelter evacuation route can be demonstrated.

---

## 2.5 Bridge Criticality

No bridge in component 0 is an articulation point. Removing any single bridge (both road-layer and bridge-layer features) does not split component 0. Bridge 284824410 removal removes 16 endpoints from the largest component but does not split it, and Auniati/Kamalabari remain in the same component.

---

## 3. Corrected Scenario: SYN-DEMO-001

### 3.1 Design

Because no network-valid scenario exists in the real data, a fully synthetic local road subgraph was created:

- **Location:** (94.6000, 27.1000), 13.3 km from nearest real feature — no conflict with real geography
- **Settlement:** SYN-SET-001 at (94.59910, 27.10000)
- **Bridge:** SYN-BRG-000 spanning (94.59955, 27.10000) → (94.60045, 27.10000), 100 m
- **Shelter:** SYN-SHELTER-001 at (94.60090, 27.10000)
- **Road segments:** 50 m + 100 m (bridge) + 50 m = 200 m total

### 3.2 Before / After Connectivity

| Metric | Before Closure | After Closure |
|---|---|---|
| Settlement connected to road | Yes | Yes |
| Shelter reachable | Yes | No |
| Path | SYN-SET-001 → SYN-BRG-000-a → SYN-BRG-000-b → SYN-SHELTER-001 | None |
| Total distance | 200 m | N/A |
| ETA | 4 min (illustrative) | N/A (unavailable) |

### 3.3 Files

| File | Purpose |
|---|---|
| `data/out/demo/scenario_syn_demo.json` | Master scenario config with real-data findings and synthetic subgraph |
| `data/out/demo/road_status_syn.json` | Bridge closure status |
| `data/out/demo/settlement_status_syn.json` | Settlement accessibility (synthetic + real reference) |
| `data/out/demo/shelter_status_syn.json` | Shelter status (synthetic + real reference) |
| `data/out/demo/flood_extent_syn.json` | Synthetic flood polygon |
| `data/out/demo/route_status_syn.json` | Before/after route status |

All synthetic features carry `"classification": "SYNTHETIC"` and `"synthetic": true`.

---

## 4. Corrections to Original Scenario

| Original Claim | Correction |
|---|---|
| Auniati cut off by bridge 284824410 | REMOVED — bridge removal does not disconnect Auniati |
| MJ-SH-009 serving Auniati | REMOVED — MJ-SH-009 is 21.6 km away, different component |
| 45-minute computed ETA | REMOVED — ETA was hardcoded fixture, not computed |
| Road graph is connected | CORRECTED — 1,030 components, largest is 3.3% of endpoints |

The original scenario files (`scenario_obs.json`, `road_status.json`, `settlement_status.json`, `shelter_status.json`, `flood_extent.json`, `route_status.json`) remain unchanged in the repository for audit purposes. The corrected files use the `_syn` suffix.

---

## 5. Classification Integrity

All data integrity rules from the directive are preserved:

| Rule | Status |
|---|---|
| Synthetic never represented as real | All synthetic features carry `synthetic: true` and `classification: "SYNTHETIC"` |
| No shelter locations invented | Synthetic shelter is explicitly labeled synthetic; real shelters unchanged |
| No shelter capacities invented | All capacities = 0 (not published) |
| No historical flood claim | All flood extents labeled synthetic |
| HAND not used for decisions | HAND remains experimental, excluded from scenario |
| Embankments not treated as authoritative | Embankments labeled contextual/unverified |

---

## 6. Offline Bundle Status

The offline bundle (`data/out/offline/`) is unaffected by the scenario corrections. All 60 MB of core artifacts remain valid for offline use. The synthetic scenario files are additional artifacts in `data/out/demo/`.

---

## 7. Recommendations for OpenCode / Darsh

1. **Use `scenario_syn_demo.json` + `*_syn.json` files** for the network-valid demonstration, not the original `scenario_obs.json` files.
2. **Frontend must render synthetic features distinctly** — all carry `synthetic: true` and `classification: "SYNTHETIC"`.
3. **Road graph fragmentation (1,030 components)** means any routing logic must handle disconnected components gracefully.
4. **No real shelter is reachable from any real settlement** — the synthetic shelter is required for the demonstration.
5. **Do not modify real geometry** — the synthetic subgraph is at (94.6000, 27.1000), 13.3 km from any real feature.

---

## 8. Files Changed

| File | Action |
|---|---|
| `data/out/demo/scenario_syn_demo.json` | NEW — corrected synthetic scenario |
| `data/out/demo/road_status_syn.json` | NEW — corrected road status |
| `data/out/demo/settlement_status_syn.json` | NEW — corrected settlement status |
| `data/out/demo/shelter_status_syn.json` | NEW — corrected shelter status |
| `data/out/demo/flood_extent_syn.json` | NEW — corrected flood extent |
| `data/out/demo/route_status_syn.json` | NEW — corrected route status |

Original files (`scenario_obs.json`, etc.) are preserved unchanged for audit.
