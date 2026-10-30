# 05 — Geographic Pipeline and Inundation Model

## 1. Verified data facts

All of the following were checked during this audit, not assumed.

| Fact | Verified |
|---|---|
| Copernicus GLO-30 DEM is anonymously downloadable | `HEAD https://copernicus-dem-30m.s3.amazonaws.com/Copernicus_DSM_COG_10_N27_00_E094_00_DEM/Copernicus_DSM_COG_10_N27_00_E094_00_DEM.tif` → `200`, `image/tiff`, 43 342 995 B |
| Tiles needed for the district window | `N26E093`, `N26E094`, `N27E093`, `N27E094` (4 × ~45 MB ≈ 177 MB, one-time build) |
| CRS / grid | `EPSG:4326`, 3600×3600 per tile, 1 arc-second (~30 m), `float32`, `nodata = None` |
| **Water bodies are stored as exactly 0 m** | 18.0 % of cells in the district window are exactly `0.0` — the Brahmaputra channel and wetlands. This is a water-body edit, not terrain. |
| Land elevation in the district window | p5 80.5 m, p25 83.6 m, p50 86.0 m, p75 88.8 m, p95 95.6 m |
| `AUXFILES/` siblings available | `_EDM.tif` (uint8 1–11, an *edit-class mask*, **not** an elevation raster), `_WBM.tif` (uint8 water-body mask), `_HEM.tif` (46 MB height-error mask), `_FLM.tif` |
| Vertical datum | orthometric, EGM2008 (from tile metadata). Assam geoid undulation is of order −60 m, so ellipsoidal and orthometric heights differ by tens of metres — far more than the island's relief. |

### The zero-water problem — the single most dangerous data trap

The naive pipeline reads a DEM whose river channel sits at **0 m** while the floodplain sits at **~86 m**. Consequences, all silent:

- `z(D)` for every drainage cell is 0, so `HAND = z(c) − 0 ≈ 86 m` everywhere. Every stage threshold becomes meaningless.
- Priority-flood fill will treat the entire channel as a giant depression and either fill it to bank level (destroying the network) or breach through it arbitrarily.
- A `0` that is also a legitimate sea-level elevation is indistinguishable from nodata by value.

**Required repair step, before anything else:** read `_WBM.tif`, mark water cells, replace `0` with a *hydrologically plausible* value.

We do not attempt bathymetry. We infill water cells by iterative neighbour averaging over the DEM (a 200-iteration diffusion is ~1 s on 1 M cells), then subtract a fixed nominal channel depth of 6 m inside the wetted channel so the drainage network sits below its floodplain. The result is not a surveyed riverbed and must not be presented as one; it preserves the only property HAND needs — that the drainage line is lower than the terrain that drains to it.

If infill alone is used (no depth subtraction), HAND is compressed toward zero and the method under-predicts. This is a documented calibration knob, not a hidden fudge.

## 2. Build pipeline (Python, offline, once)

Owner: Karthik. Output is committed to `data/artifacts/`; nothing here runs at demo time.

```
  4 DEM tiles
      │  clip to district window, mosaic, reproject to metric grid
      ▼
  dem.tif  (EPSG:32646 UTM 46N, 30 m)          ~1.0 M cells for 880 km²
      │  WBM mask → zero repair → nominal channel depth
      ▼
  dem_fixed.tif
      │  breach depressions (least-cost)          [preferred over fill]
      │  D8 flow direction
      │  flow accumulation
      │  stream extraction at A_T = 5 km²  (tunable, recorded in manifest)
      │  nearest drainage along flow path
      ▼
  hand.bin       uint16, decimetres, 0..65535, 0xFFFF = nodata     (~2 MB)
  drain_elev.bin int16,  decimetres offset +2000 m                 (~2 MB)
  recv.bin       int32,  D8 receiver index, −1 = outlet            (~4 MB)
  reach_id.bin   uint16                                            (~2 MB)
  hillside.png   RGB hillshade for the map basemap                 (~1 MB)
  manifest.json  bbox, CRS, cell size, A_T, nominal depth, hashes
```

Total committed artifact budget: **< 15 MB**. No Git LFS.

### Library choice

| Need | Choice | Why |
|---|---|---|
| Breach, D8, accumulation, HAND | `pyflwdir` 0.5.x (pure Python + numba, maintained by Deltares) | installs cleanly on macOS/Windows, `hand` built in |
| Fallback if pyflwdir fights the environment | `WhiteboxTools` 2.3.x via the `whitebox` wrapper (Rust binary, no compiler) | `breach_depressions_least_cost`, `d8_pointer`, `d8_flow_accumulation`, `extract_streams`, `elevation_above_stream` |
| Raster I/O | `rasterio` (cp314 wheel verified installable) | bundled GDAL, no system dependency |
| Label / morphology | `scipy.ndimage` | already present |
| **Do not use** | `richdem` | last release 2018, wheels stop at cp37 Linux; effectively abandoned |

The pipeline itself is a build step: if both libraries fail, the fallback is a numba priority-flood + D8 in ~200 lines, which is a known quantity but costs Karthik ~3 hours. Gate: this fallback decision happens at **hour 4**, not hour 20.

## 3. The inundation model — corrected

### 3.1 The error in the original formulation

The proposal was `wet(c) ⇔ HAND(c) ≤ stage`. Substituting the definition:

```
HAND(c) = z(c) − z(D(c))
HAND(c) ≤ S        ⇔   z(c) − z(D(c)) ≤ S   ⇔   z(c) ≤ S + z(D(c))
```

The HAND term cancels and the condition becomes a function of `z(c)` and `S` plus an artefact of `z(D)`. Compared against an absolute stage, HAND contributes nothing and the method is an unconnected bathtub wearing a HAND costume. This was caught in specialist review and is the reason this section exists.

### 3.2 Correct formulation

```
z(c)     conditioned elevation, metres, orthometric (EGM2008), after water-body repair
r(c)     D8 receiver of cell c
A(c)     flow accumulation, cells
N        = { c : A(c) ≥ A_T }            stream cells
D(c)     first stream cell reached by walking c → r(c) → r(r(c)) → …
         (undefined / nodata if the path ends in a sink)
H(c)     = z(c) − z(D(c))                 height above nearest drainage, metres
h        hydraulic depth: water depth IN THE CHANNEL, metres
S(n)     = z(n) + h(n)                    water-surface elevation at reach n

wet(c)   ⇔   H(c) ≤ h(D(c))
depth(c) = max(0, h(D(c)) − H(c))
```

The comparison is **HAND against hydraulic depth**, not against absolute stage. With a spatially uniform depth `h`:

```
depth(c) = max(0, h − H(c))
```

which is the standard HAND inundation rule. It is *not* a bathtub: because `H` varies with terrain, the wet set follows the drainage structure, not a horizontal plane.

### 3.3 Where `h` comes from — the datum-free chain

This is the part that makes the system usable without a surveyed gauge.

```
1. A volunteer reports: "water 1.1 m over the Kamalabari bridge deck."
   → obs.water { point_id, kind: depth_over_ref, value_dm: 11 }

2. z_ref = DEM elevation at the reported point                     (from artifacts)
   S_obs  = z_ref + 1.1 m                                          absolute WSE

3. h0 = S_obs − z(D_ref)      where D_ref is the nearest drainage cell to the point
   → h0 is the channel depth at the anchor reach.
   If z_ref ≈ z(D_ref) (a bridge deck at bank level), then h0 ≈ 1.1 m,
   which is the expected sanity relationship and is asserted.

4. Uniform-depth assumption: h(n) = h0 for all reaches.
   (Documented limitation: no backwater, no downstream control.)
```

No gauge zero, no geoid model, no Survey of India datum. The DEM supplies both the reference elevation and the inundation surface, so a datum error cancels. This is the whole reason the primary observation is a local depth rather than a stage reading — see ADR-8.

**Assertion at runtime:** if `h0` exceeds 12 m or is negative, the observation is rejected with a visible reason rather than flooding the island. `h0 > 12 m` means the reported point is not where the user thinks it is, or the DEM is wrong there.

### 3.4 The second method, as an independent bracket

Alongside the HAND surface, compute a **connected bathtub**: flood-fill from stream cells at absolute `S_obs`, 8-connected, but with `S` allowed to vary as `S(n) = z(n) + h0` (so it is a sloped water surface, not a horizontal one). Display both. If the two areas differ by more than 30 %, the build is flagged as suspect — this is a *debugging* check, not an accuracy claim, because both share the same DEM and the same datum and therefore share their errors.

### 3.5 Per-stage runtime

| Step | Cost |
|---|---|
| `H ≤ h` over 1.0 M cells (typed array) | ~8 ms |
| `depth = max(0, h − H)` | ~6 ms |
| 8-connected component label + keep components touching a stream cell | ~60–120 ms |
| Containment check: count settlements/edges intersecting wet cells | ~2 ms |
| **Full recompute per stage value** | **< 200 ms** |

Cheap enough to recompute live when the demo raises the water level, and cheap enough to sweep 60 stage values for the evacuation analysis.

## 4. Road passability from the surface

For each edge, sample the depth raster at **fixed intervals along the geometry (every 15 m, min 8 samples)** plus at both endpoints.

- **Passability** uses `max` depth over the samples. Mean depth is physically wrong: a 1.5 m channel across a 300 m causeway averages to passable.
- **Travel time** uses the integral `∫ ds / v(d(s))` — the harmonic mean of speed, not `v(mean d)`.
- **Bridges are special-cased.** A bridge deck is not terrain. Its passability is `max(0, S − deck_elev) ≤ 0`, using the deck's own elevation and the local water surface, and the bridge must not be merged with its approach causeways — otherwise a DEM cell sampled on the approach decides the bridge.
- Reserved: edges tagged `ferry` are time-varying availability, treated as a separate class.

Depth thresholds by class are events (`threshold.set`), not constants: `path 15 cm`, `track 20 cm`, `residential 25 cm`, `secondary 30 cm`, `primary 35 cm`, `bridge 10 cm` (deck awash is worse than a ford). Values are placeholders to be set by Karthik from IRC/practice references and recorded in the manifest.

## 5. Validation — what we can and cannot prove

Three numerical checks, all cheap, all runnable in CI:

1. **Monotonicity.** Inundated area `A(h)` and volume `V(h) = Σ max(0, h − H)` are non-decreasing in `h`; `V` is convex between channel-fill transitions; no negative depths; `max(depth) = h − min H`.
2. **Connectivity invariant.** Every wet cell has an 8-connected wet path to a stream cell; the number of wet components equals the number of seeded stream components; no wet cell inside a closed depression isolated from the network.
3. **Bracket agreement.** HAND area vs sloped-bathtub area within 30 % at three reference stages. A failure is a bug signal.

**These are consistency checks. They are not accuracy validation.** No observed flood-extent ground truth is being used, and the UI must say so in the same sentence as any number.

A fourth check is possible and optional: IoU against a JRC Global Surface Water maximum-extent layer for the district. It answers "is the water in roughly the right place", not "is the model right". If Karthik has time, it is a good slide. If not, no loss.

## 6. Claims we will make, and claims we will not

**We will say:** terrain-based screening of potential inundation for a specified water level; static water surface; no velocity, duration, sediment or erosion; no forecast skill; HAND with a uniform hydraulic depth, which ignores backwater and downstream control; results are sensitive to the DEM, which is a surface model (canopy, embankments and the river surface are in it) acquired 2011–2015.

**We will not say:** "flood hazard map", "flood risk", "inundation forecast", "validated against the 2017 flood", any accuracy or IoU percentage framed as skill, or any stage → return-period conversion.
