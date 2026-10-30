"""
SETU - Majuli DEM → HAND Pipeline
Builds hydrological conditioning artifacts for flood projection.

Steps:
1. Mosaic Copernicus GLO-30 DEM tiles
2. Clip to Majuli district extent
3. Repair water-body zero cells
4. Build pyflwdir flow direction model
5. Compute flow accumulation and stream network
6. Compute HAND (height above nearest drainage)
7. Save all artifacts

Outputs:
- data/majuli/dem/majuli_dem_clipped.tif
- data/majuli/hand/hand.bin (uint16, decimetres)
- data/majuli/hand/drain_elev.bin (int16, decimetres offset +2000)
- data/majuli/hand/recv.bin (int32, D8 receiver index)
- data/majuli/hand/reach_id.bin (uint16)
- data/majuli/dem/manifest.json
"""

import rasterio
import numpy as np
import pyflwdir
from rasterio.merge import merge
from rasterio.windows import from_bounds
from rasterio.warp import reproject
import json
import glob
import os
from scipy import ndimage

# ============================================================
# Step 1: Mosaic DEM tiles
# ============================================================
print("=" * 60)
print("STEP 1: Mosaic DEM tiles")
print("=" * 60)

tiles = sorted(glob.glob('data/majuli/dem/N*_00_E*_00.tif'))
print(f"Found {len(tiles)} tiles")

srcs = [rasterio.open(t) for t in tiles]
mosaic, out_trans = merge(srcs)
print(f"Mosaic shape: {mosaic.shape}")
print(f"Mosaic CRS: {srcs[0].crs}")

profile = srcs[0].profile.copy()
profile.update({
    'driver': 'GTiff',
    'height': mosaic.shape[1],
    'width': mosaic.shape[2],
    'transform': out_trans,
    'count': 1,
    'dtype': 'float32',
})

with rasterio.open('data/majuli/dem/majuli_dem_mosaic.tif', 'w', **profile) as dst:
    dst.write(mosaic[0].astype(np.float32), 1)

for s in srcs:
    s.close()

# ============================================================
# Step 2: Clip to Majuli extent
# ============================================================
print("\n" + "=" * 60)
print("STEP 2: Clip to Majuli extent")
print("=" * 60)

# Majuli extent: 94.0-94.6E, 26.5-27.2N
with rasterio.open('data/majuli/dem/majuli_dem_mosaic.tif') as src:
    window = from_bounds(94.0, 26.5, 94.6, 27.2, src.transform)
    window = window.round_offsets().round_lengths()
    
    profile = src.profile.copy()
    profile.update({
        'driver': 'GTiff',
        'height': int(window.height),
        'width': int(window.width),
        'transform': src.window_transform(window),
        'count': 1,
        'dtype': 'float32',
    })
    
    with rasterio.open('data/majuli/dem/majuli_dem_clipped.tif', 'w', **profile) as dst:
        reproject(
            source=rasterio.band(src, 1),
            destination=rasterio.band(dst, 1),
            src_transform=src.transform,
            src_crs=src.crs,
            dst_transform=profile['transform'],
            dst_crs=src.crs,
            resampling=rasterio.enums.Resampling.bilinear
        )

with rasterio.open('data/majuli/dem/majuli_dem_clipped.tif') as src:
    dem = src.read(1).astype(np.float32)
    transform = src.transform
    crs = src.crs

print(f"Clipped DEM shape: {dem.shape}")
print(f"Bounds: {src.bounds}")
print(f"Min: {np.nanmin(dem):.2f}, Max: {np.nanmax(dem):.2f}, Mean: {np.nanmean(dem):.2f}")
print(f"Zero cells: {np.sum(dem == 0)} ({np.sum(dem == 0)/dem.size*100:.2f}%)")

# ============================================================
# Step 3: Repair water-body zero cells
# ============================================================
print("\n" + "=" * 60)
print("STEP 3: Repair water-body zero cells")
print("=" * 60)

zero_cells = dem == 0
print(f"Zero cells before repair: {np.sum(zero_cells)} ({np.sum(zero_cells)/dem.size*100:.2f}%)")

if np.sum(zero_cells) > 0:
    dem_repaired = dem.copy()
    for iteration in range(200):
        shifted_up = np.roll(dem_repaired, 1, axis=0)
        shifted_down = np.roll(dem_repaired, -1, axis=0)
        shifted_left = np.roll(dem_repaired, 1, axis=1)
        shifted_right = np.roll(dem_repaired, -1, axis=1)
        neighbour_avg = (shifted_up + shifted_down + shifted_left + shifted_right) / 4.0
        dem_repaired = np.where(zero_cells, neighbour_avg, dem_repaired)
        remaining = np.sum(dem_repaired == 0)
        if remaining == 0:
            print(f"  All water cells repaired after {iteration + 1} iterations")
            break
    
    print(f"Remaining zero cells: {remaining}")
    
    if remaining > 0:
        local_median = np.nanmedian(dem[dem > 0])
        dem_repaired = np.where(dem_repaired == 0, local_median, dem_repaired)
        print(f"  Filled remaining {remaining} cells with local median: {local_median:.2f}")
else:
    dem_repaired = dem.copy()
    print("  No zero cells found - no repair needed")

dem_repaired = np.where(np.isnan(dem_repaired), np.nanmedian(dem_repaired[dem_repaired > 0]), dem_repaired)

print(f"After repair - Min: {np.min(dem_repaired):.2f}, Max: {np.nanmax(dem_repaired):.2f}, Mean: {np.nanmean(dem_repaired):.2f}")

with rasterio.open('data/majuli/dem/majuli_dem_fixed.tif', 'w', **{
    'driver': 'GTiff',
    'height': dem_repaired.shape[0],
    'width': dem_repaired.shape[1],
    'count': 1,
    'dtype': 'float32',
    'crs': crs,
    'transform': transform,
}) as dst:
    dst.write(dem_repaired.astype(np.float32), 1)

print("Saved dem/majuli_dem_fixed.tif")

# ============================================================
# Step 4: Pyflwdir HAND pipeline
# ============================================================
print("\n" + "=" * 60)
print("STEP 4: HAND pipeline with pyflwdir")
print("=" * 60)

# pyflwdir.from_dem handles breach, D8, flow accumulation internally
flwdir = pyflwdir.from_dem(dem_repaired, transform=transform)

print(f"pyflwdir shape: {flwdir.shape}")
print(f"Number of cells: {flwdir.size}")

# Flow accumulation
acc = flwdir.accuflux()
print(f"Accumulation max: {np.nanmax(acc):.0f} cells")

# Save accumulation raster
with rasterio.open('data/majuli/dem/majuli_accumulation.tif', 'w', **{
    'driver': 'GTiff',
    'height': dem_repaired.shape[0],
    'width': dem_repaired.shape[1],
    'count': 1,
    'dtype': 'float32',
    'crs': crs,
    'transform': transform,
}) as dst:
    dst.write(acc.astype(np.float32), 1)
print("Saved accumulation raster")

# Extract stream network at different thresholds
for A_t_cells in [100, 500, 1000, 5000, 10000]:
    streams = acc >= A_t_cells
    n_stream = np.sum(streams)
    print(f"A_t={A_t_cells} cells: {n_stream} stream cells ({n_stream/streams.size*100:.2f}%)")

# Choose threshold: ~5 km² = 5000000 m² / (30*30) = ~5556 cells
A_T_cells = 5556
streams = acc >= A_T_cells
print(f"\nUsing A_T = {A_T_cells} cells (~5 km²): {np.sum(streams)} stream cells")

# Save stream network
stream_binary = streams.astype(np.uint8)
with rasterio.open('data/majuli/dem/majuli_streams.tif', 'w', **{
    'driver': 'GTiff',
    'height': dem_repaired.shape[0],
    'width': dem_repaired.shape[1],
    'count': 1,
    'dtype': 'uint8',
    'crs': crs,
    'transform': transform,
}) as dst:
    dst.write(stream_binary, 1)
print("Saved stream network")

# ============================================================
# Step 5: Compute HAND using pyflwdir.hand()
# ============================================================
print("\n" + "=" * 60)
print("STEP 5: Compute HAND using pyflwdir.hand()")
print("=" * 60)

# pyflwdir.hand() requires drain (receiver cell indices) and elevtn (elevations flattened)
# flwdir.idxs_ds gives the index of the downstream cell for each cell (flattened array)
receiver = flwdir.idxs_ds
print(f"Receiver type: {type(receiver)}, shape: {receiver.shape}")
print(f"Receiver min: {receiver.min()}, max: {receiver.max()}")

# hand() needs drain (receiver cell indices) and elevtn (elevations flattened)
hand = flwdir.hand(drain=receiver, elevtn=dem_repaired.flatten())
print(f"HAND shape: {hand.shape}")
print(f"HAND min: {np.nanmin(hand):.2f}, max: {np.nanmax(hand):.2f}, mean: {np.nanmean(hand):.2f}")

# HAND is in metres. Convert to decimetres.
HAND_dm = (hand * 10).astype(np.uint16)
HAND_dm[HAND_dm > 65535] = 65535  # Clamp to uint16 max
HAND_dm[np.isnan(hand)] = 0  # Nodata areas

print(f"HAND_dm stats: min={np.min(HAND_dm)}, max={np.max(HAND_dm)}, mean={np.mean(HAND_dm):.1f} dm")
print(f"Cells with HAND=0 (drainage cells): {np.sum(HAND_dm == 0)} ({np.sum(HAND_dm == 0)/HAND_dm.size*100:.2f}%)")

# Save HAND raster
with rasterio.open('data/majuli/hand/hand.bin', 'w', **{
    'driver': 'GTiff',
    'height': dem_repaired.shape[0],
    'width': dem_repaired.shape[1],
    'count': 1,
    'dtype': 'uint16',
    'crs': crs,
    'transform': transform,
}) as dst:
    dst.write(HAND_dm, 1)
print("Saved hand.bin")

# Save drainage elevation (for inundation calculations)
# Drainage elevation = elevation of the downstream cell for each cell
drain_elev = dem_repaired.flatten()[receiver]
drain_elev_dm = (drain_elev * 10).astype(np.int16)  # decimetres
drain_elev_dm[drain_elev_dm < -20000] = -20000  # Clamp

with rasterio.open('data/majuli/hand/drain_elev.bin', 'w', **{
    'driver': 'GTiff',
    'height': dem_repaired.shape[0],
    'width': dem_repaired.shape[1],
    'count': 1,
    'dtype': 'int16',
    'crs': crs,
    'transform': transform,
}) as dst:
    dst.write(drain_elev_dm, 1)
print("Saved drain_elev.bin")

# Save D8 receiver index
receiver_int = receiver.astype(np.int32)
receiver_int[receiver < 0] = -1
with rasterio.open('data/majuli/hand/recv.bin', 'w', **{
    'driver': 'GTiff',
    'height': dem_repaired.shape[0],
    'width': dem_repaired.shape[1],
    'count': 1,
    'dtype': 'int32',
    'crs': crs,
    'transform': transform,
}) as dst:
    dst.write(receiver_int, 1)
print("Saved recv.bin")

# ============================================================
# Step 6: Stream reach IDs
# ============================================================
print("\n" + "=" * 60)
print("STEP 6: Stream reach IDs")
print("=" * 60)

# Label stream cells with reach IDs using connected components
from scipy import ndimage
stream_binary_bool = streams.astype(bool)
labeled, n_reaches = ndimage.label(stream_binary_bool)
print(f"Number of stream reaches: {n_reaches}")

reach_id = labeled.astype(np.uint16)
reach_id[labeled > 65535] = 65535  # Clamp
with rasterio.open('data/majuli/hand/reach_id.bin', 'w', **{
    'driver': 'GTiff',
    'height': dem_repaired.shape[0],
    'width': dem_repaired.shape[1],
    'count': 1,
    'dtype': 'uint16',
    'crs': crs,
    'transform': transform,
}) as dst:
    dst.write(reach_id, 1)
print("Saved reach_id.bin")

# ============================================================
# Step 7: Write manifest
# ============================================================
print("\n" + "=" * 60)
print("STEP 7: Write manifest")
print("=" * 60)

manifest = {
    "district": "Majuli, Assam",
    "crs": str(crs),
    "cell_size_m": 30.0,
    "n_rows": int(dem_repaired.shape[0]),
    "n_cols": int(dem_repaired.shape[1]),
    "bbox": {
        "left": 94.0,
        "bottom": 26.5,
        "right": 94.6,
        "top": 27.2
    },
    "elevation": {
        "min_m": float(np.min(dem_repaired)),
        "max_m": float(np.nanmax(dem_repaired)),
        "mean_m": float(np.nanmean(dem_repaired)),
        "p50_m": float(np.percentile(dem_repaired, 50))
    },
    "hand": {
        "min_dm": int(np.min(HAND_dm)),
        "max_dm": int(np.max(HAND_dm)),
        "mean_dm": float(np.mean(HAND_dm)),
        "unit": "decimetres"
    },
    "stream_threshold_cells": int(A_T_cells),
    "stream_threshold_km2": float(A_T_cells * 30 * 30 / 1e6),
    "n_stream_cells": int(np.sum(streams)),
    "n_reaches": int(n_reaches),
    "data_sources": {
        "dem": "Copernicus GLO-30 DEM (anonymous AWS S3 download)",
        "tiles": ["N26E093", "N26E094", "N27E093", "N27E094"]
    },
    "notes": [
        "DEM is a DSM (includes vegetation, buildings, embankments)",
        "Water-body zero cells repaired via neighbour averaging",
        "HAND computed using pyflwdir D8 flow direction",
        "Vertical datum: EGM2008 orthometric (Copernicus GLO-30)",
        "No gauge calibration - observations should be local depth over reference point"
    ]
}

with open('data/majuli/dem/manifest.json', 'w') as f:
    json.dump(manifest, f, indent=2)
print("Saved manifest.json")

print("\n" + "=" * 60)
print("HAND PIPELINE COMPLETE")
print("=" * 60)
print(f"Artifacts in data/majuli/:")
print(f"  dem/majuli_dem_clipped.tif")
print(f"  dem/majuli_dem_fixed.tif")
print(f"  dem/majuli_dem_mosaic.tif")
print(f"  dem/majuli_accumulation.tif")
print(f"  hand/hand.bin")
print(f"  hand/drain_elev.bin")
print(f"  hand/recv.bin")
print(f"  hand/reach_id.bin")
print(f"  dem/manifest.json")