# SETU — Majuli geographic dataset catalogue

Prepared from `~/Downloads/KARTHTHT.txt` (task 1 & 2: find datasets, record source / resolution / coverage / licence / limitations).
Status: **downloaded and processed** into `data/out/` (the output format is still provisional pending team-lead confirmation).

**Study area:** Majuli district, Assam (Brahmaputra river island).
Indicative AOI: lat **26.83–27.15 N**, lon **93.70–94.60 E** (island ≈80 km E–W, 10–15 km N–S).
Elevation ≈**60–90 m** above MSL; district area reported as **483 km²** (govt) vs **≈880 km²** (older literature — erosion), so clip to an official boundary, not to a number.
**Working AOI box** (used for clipping): lon 93.60–94.70 E, lat 26.78–27.22 N. The OSM administrative outline is exported as a separate layer (`majuli_boundary.geojson`, ODbL) instead of being used as the clip mask, so river channels around the island stay in the rasters.
Admin context: 2 revenue circles (Ujani Majuli, Majuli), ~20 Gram Panchayats, **234 LGD villages** / 139 revenue villages, population **167,304** (Census 2011).

> **Sourced vs synthetic:** everything below is a real, citable source. Nothing here is a simulated flood extent or invented shelter. Scenario layers (submerged bridge, blocked road, rising water, disconnected settlement) must be generated separately and flagged `synthetic: true` with no claim of historical validation.

---

## 1. DEM / elevation

| | Primary — Copernicus DEM GLO-30 | Alternative — CartoDEM (India) | Alternative — NASADEM / SRTM 30 m | Alternative — ALOS AW3D30 |
|---|---|---|---|---|
| Provider | ESA / Airbus (Copernicus) | NRSC / ISRO (Bhuvan) | NASA/USGS | JAXA |
| Resolution | 1 arc-sec ≈ 30 m | 30 m (also 10 m paid) | 30 m | 30 m |
| Vertical accuracy | ≈4 m LE90 (spec) | 8 m LE90, 15 m CE90 | ≈16 m LE90 | ≈5 m RMSE |
| Coverage | Global, 2023_1 release | India + surroundings | 60°N–56°S | Global |
| Format | COG GeoTIFF tiles | GeoTIFF, 7.5′×7.5′ tiles | HGT / GeoTIFF | GeoTIFF |
| Licence | Free, Copernicus DEM licence (attribution) | Free download, NRSC terms | Public domain (US Gov) | Free, JAXA registration |
| Access | `s3://copernicus-dem-30m` (no AWS account), OpenTopography | bhuvan-app3.nrsc.gov.in/data/download | earthexplorer.usgs.gov | alos-palsar.eri.u-tokyo.ac.jp |
| Limitations | **DSM** (includes vegetation/buildings/canopy); 30 m cannot resolve embankments, roads or the braidplain micro-relief; 2026 CDSE *view service* for GLO-30 is now restricted to CCM users — use the AWS bucket / OpenTopography instead | Requires Bhuvan login; older 2006–2014 acquisition; also a DSM | 2000-era, radar canopy bias, voids in steep terrain | Registration required; DSM |

**Majuli-specific caution:** total relief is ~30 m over ~500 km² (mean slope well below 1 %). 30 m DEM vertical error is the same order as the signals we want to model, so **do not derive flood depth from the DEM alone**. Use it for relative terrain, embankment/channel clues and cost surfaces; treat water level as an explicit scenario parameter.

---

## 2. Rivers and waterways

| | OSM waterways (primary, vector) | JRC Global Surface Water (primary, raster) | HydroRIVERS v1.0 (context) |
|---|---|---|---|
| Provider | OpenStreetMap contributors / Geofabrik | EC JRC + Google | WWF / McGill (HydroSHEDS) |
| Resolution | Vector (source-dependent) | 30 m (Landsat) | 15 arc-sec ≈ 500 m |
| Coverage | Global; India extract daily | Global 78°N–60°S, 1984–2024 | Global |
| Format | `.osm.pbf`, `.gpkg`, `.shp` | GeoTIFF per 10°×10° tile | File GDB / SHP |
| Licence | **ODbL 1.0** (attribution + share-alike) | Free, Copernicus (attribute “Source: EC JRC/Google”) | HydroSHEDS licence: free incl. commercial, attribution, redistribution restrictions |
| Access | download.geofabrik.de/asia/india.html · Overpass API for AOI | global-surface-water.appspot.com/download | data.hydrosheds.org (618 MB global) |
| Limitations | Completeness in Majuli is **sparse**; braided channel geometry changes every monsoon, so `waterway` lines and `natural=water` polygons drift from reality; no discharge/width attributes | 30 m Landsat → channels narrower than ~60 m are missed; monthly history only 2022–2024 in v1.5 (merge with v1.4 for full series); no vectors | Far too coarse for Majuli’s braidplain; reach topology/discharge useful only as basin context |

**Recommendation:** OSM for the editable network the app draws; JRC GSW for *where water actually sits* (braidplain mask, seasonal vs permanent) and as the sanity check on OSM geometry.

---

## 3. Roads and bridges

| | OSM road + bridge network |
|---|---|
| Provider | OpenStreetMap contributors / Geofabrik |
| Resolution | Vector |
| Coverage | Global, India extract updated daily |
| Format | `.osm.pbf` / `.gpkg` (filter `highway=*`, `bridge=yes`, `man_made=bridge`) |
| Licence | **ODbL 1.0** |
| Access | download.geofabrik.de/asia/india.html · Overpass API |
| Limitations | **Sparse and incomplete in Majuli**; almost no surface/width/lane/condition tags; bridges under-mapped (ferry crossings to Nimati Ghat are `route=ferry`, not bridges); no road elevation, so “submerged” must be computed from DEM + scenario water level |

No open, georeferenced Assam PWD / PMGSY road or bridge layer was found. Commercial basemaps (Google/Mapbox) are usable for display but their terms prohibit storing/redistributing derived geometry. **The “submerged bridge” and “blocked road” demos therefore need explicit scenario annotations on top of OSM**, not a hidden real dataset.

---

## 4. Villages and settlement locations

| | OSM places + buildings | Census of India 2011 village tables | Google Open Buildings V3 polygons | Open Buildings 2.5D Temporal |
|---|---|---|---|---|
| Provider | OSM contributors | ORGI, Ministry of Home Affairs | Google Research | Google Research |
| Resolution | Point / footprint | Village (attribute) | 50 cm imagery → polygons | 4 m effective, 0.5 m rasters, annual |
| Coverage | Global, sparse locally | All India (234 LGD villages in Majuli) | 1.8 B buildings, incl. India, 2023 | 2016–2023, incl. India |
| Format | GeoJSON / GPKG | XLSX / CSV (no coordinates) | GeoJSON/CSV tiles | GeoTIFF per S2 tile |
| Licence | ODbL 1.0 | Government Open Data Licence – India (attribution) | CC BY 4.0 **or** ODbL 1.0 | CC BY 4.0 **or** ODbL 1.0 |
| Access | Overpass / Geofabrik | censusindia.gov.in (PCA / SbDistVill) · digitalpanchayat.org LGD mirror | sites.research.google/gr/open-buildings | same + HDX mirror |
| Limitations | Village points uneven; many hamlets (`place=hamlet`) unmapped; no population | **No coordinates** — needs geocoding to OSM/LGD; 2011 vintage, pre-dates erosion and 2016 district formation | Footprints only: no names, no population, occasional false positives in vegetation/sandbars | Same, plus model-derived heights; no administrative identity |

**Join strategy:** Census 2011 village name + LGD code → OSM `place` point (fuzzy match, manual review) → building count/population from Open Buildings. Keep unmatched villages in a separate `unmatched` table; do not silently drop them.

---

## 5. Shelters

**No authoritative open georeferenced shelter layer exists.** What does exist:

| Source | What it gives | Format | Licence / status |
|---|---|---|---|
| **Majuli District Flood Contingency Plan 2026-27** — `majuli.assam.gov.in/sites/default/files/public_utility/Flood Contingency Plan 2026-27_compressed.pdf` | Pre-identified relief camps per revenue circle (schools, colleges), camp in-charge + phone, **GPS coordinates for a subset** (e.g. Kamalabari / Garamur / Phuloni camps, N 26°58′–27°05′, E 94°08′–94°22′) | PDF table | Official DDMA document; **not** a dataset, no explicit open licence → treat as reference, extract manually, attribute DDMA Majuli |
| ASDMA daily flood reports — `sdrf.assam.gov.in/dfr` | Counts of camps/distribution centres per district, affected villages | PDF | Official; no per-camp coordinates |
| OSM `amenity=shelter` / `emergency=assembly_point` | Almost nothing in Majuli | Vector | ODbL |

**Handling:** extract the contingency-plan table to CSV (`shelter_id, name, gp, revenue_circle, lat, lon, in_charge, phone, coord_source`), keep `coord_source = "DDMA contingency plan 2026-27 (as published)"`, and mark all non-extracted shelter locations as `synthetic: true`. Never present a camp list as currently open — the plan lists camps “likely to be set up”.

---

## 6. Supporting layers (recommended, needed by the scenarios)

| Layer | Source | Res | Licence | Why |
|---|---|---|---|---|
| Sentinel-1 GRD (SAR) | Copernicus Data Space / ASF | 10 m | Free, Copernicus | Actual observed flood extent for a given date; validate scenarios |
| Sentinel-2 L2A | CDSE | 10 m | Free, Copernicus | Pre/post imagery, channel change, embankment inspection |
| Admin boundaries (district/circle/GP) | DataMeet `github.com/datameet/maps` | Vector | CC BY-SA 2.5 IN | Clipping, labels, joins |
| JRC GSW seasonality/transitions | as §2 | 30 m | Free, Copernicus | Permanent vs seasonal water, braidplain mask |
| NISAR L-band GCOV (optional) | NASA/JPL via ASF | ~10 m | Open | Used in the 2026 Assam flood assessment; better under vegetation |

---

## Minimum viable stack for the demo

1. `dem_cop30_majuli.tif` — Copernicus GLO-30, clipped, EPSG:4326 + a UTM 46N copy.
2. `rivers_osm_majuli.geojson` + `water_jrc_gsw_occurrence.tif`.
3. `roads_osm_majuli.geojson` (with `bridge=yes` subset).
4. `villages_majuli.geojson` (OSM points + Census attributes, `match_confidence` field).
5. `shelters_majuli.csv` from the DDMA contingency plan, flagged as published-not-validated.
6. `scenarios/*.json` — synthetic, versioned, with `synthetic: true` and a plain-language note per scenario.

## Open questions before processing (task 3)

- Output format: **GeoJSON** (easy for the app), **GeoPackage** (one file, typed), or **PMTiles/MBTiles** (fast map) — or GeoJSON + PMTiles pair?
- CRS: EPSG:4326 for exchange, EPSG:32646 (UTM 46N) for any metric calculation — confirm.
- Water level datum: scenario depths relative to **MSL** or relative to **local DEM surface**? (DEM is a DSM, so a “depth above ground” is biased under canopy.)
- Do you need village *population* and *building counts*, or only geometry?
- Do you want observed Sentinel-1 flood extent at all, or is the demo purely hypothetical?

## Field template for the delivered data

`id, category, name, source, source_url, licence, acquired_at, resolution, geometry_type, crs, synthetic (bool), notes`

---

## Download gotchas hit while building this (keep for reproducibility)

1. **Overpass returned HTTP 406** to a plain `curl --data-urlencode`. The main instance rejects requests without a descriptive `User-Agent`; `scripts/05_osm.py` POSTs with one and falls back across mirrors. The full AOI extract is ~126 MB / 194k elements.
2. **GSW tile names are not the south-west corner.** `occurrence_90E_20Nv1_4_2021.tif` actually spans 10–20° N (lon 90–100 E). For the AOI at 27° N the correct file is `occurrence_90E_30Nv1_4_2021.tif`. Always check `.bounds` after download rather than trusting the name.
3. **Copernicus GLO-30 covers 1°×1° only.** A 93.60–94.70 E AOI needs both the `E093` and `E094` tiles for each latitude band, i.e. four tiles (`N26/N27` × `E093/E094`), not two.
4. Neither Copernicus nor GSW declares a nodata value in the file; the pipeline sets one explicitly (DEM `-9999`, GSW `255`) during clipping.

## Status of the open questions (task 3)

Provisional answers used for this build, pending team-lead confirmation: **EPSG:4326 GeoJSON + one GeoPackage**, plus a UTM 46N DEM copy; water levels are **relative to the DEM/DSM surface** (not MSL) and the DSM bias under canopy is stated as a limitation.
