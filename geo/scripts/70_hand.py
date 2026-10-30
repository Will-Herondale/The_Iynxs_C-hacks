#!/usr/bin/env python
"""HAND (Height Above Nearest Drainage) raster for the Majuli flood demo.

HAND = DEM elevation minus the elevation of the nearest downstream drainage
cell. Cells in the drainage network (water bodies from JRC GSW) have HAND = 0;
every other cell's HAND is the height it would take for water to reach the
drainage network along the flow path.

This is a *derived* raster — computed from the Copernicus GLO-30 DEM already
in data/out/. It is not a historical flood extent and must not be presented as
one.

Algorithm:
  1. D8 flow direction (steepest downslope among 8 neighbours).
  2. Drainage network = JRC GSW occurrence > 25 % (perennial/seasonal water).
  3. HAND propagated upstream from drainage cells by reverse flow tracing:
     HAND[cell] = DEM[cell] - DEM[downstream] + HAND[downstream]
     Cells with no path to mapped drainage (flow off-raster or to sinks)
     are nodata — this is an honest data-quality signal, not invented data.

Output: data/out/majuli_hand_30m_wgs84.tif  (EPSG:4326, float32, nodata=-9999)
"""
from __future__ import annotations

import pathlib
import sys

import numpy as np
import rasterio

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data" / "out"
DEM = OUT / "majuli_dem_30m_wgs84.tif"
GSW = OUT / "majuli_water_occurrence_30m_demgrid.tif"  # DEM-aligned copy
HAND = OUT / "majuli_hand_30m_wgs84.tif"

NODATA = -9999.0
STREAM_THRESHOLD = 25  # GSW occurrence % above which a cell is drainage

# D8 neighbours: (dy, dx, distance, direction_code)
# code: 0=N,1=NE,2=E,3=SE,4=S,5=SW,6=W,7=NW
D8 = [(-1, 0, 1.0, 0), (-1, 1, 1.41421356, 1), (0, 1, 1.0, 2),
      (1, 1, 1.41421356, 3), (1, 0, 1.0, 4), (1, -1, 1.41421356, 5),
      (0, -1, 1.0, 6), (-1, -1, 1.41421356, 7)]


def shift_array(arr: np.ndarray, offset_y: int, offset_x: int, fill):
    """result[i, j] = arr[i + offset_y, j + offset_x]; fill where out of bounds."""
    h, w = arr.shape
    result = np.full((h, w), fill, dtype=arr.dtype)
    src_r0 = max(0, -offset_y)
    src_r1 = min(h, h - offset_y)
    dst_r0 = max(0, offset_y)
    dst_r1 = min(h, h + offset_y)
    src_c0 = max(0, -offset_x)
    src_c1 = min(w, w - offset_x)
    dst_c0 = max(0, offset_x)
    dst_c1 = min(w, w + offset_x)
    result[dst_r0:dst_r1, dst_c0:dst_c1] = arr[src_r0:src_r1, src_c0:src_c1]
    return result


def compute_flow_direction(dem: np.ndarray, valid: np.ndarray):
    """D8 flow direction: direction code of steepest downslope neighbour.

    Returns int8 array with codes 0-7, -1 where no downslope neighbour
    (sink / nodata / edge).
    """
    h, w = dem.shape
    flow_dir = np.full((h, w), -1, dtype=np.int8)
    best_slope = np.full((h, w), -np.inf, dtype=np.float64)

    for dy, dx, dist, code in D8:
        # neighbour elevation at (i+dy, j+dx) for each cell (i, j)
        shifted = shift_array(dem, dy, dx, np.inf)
        # Only consider neighbours that are lower and valid
        slope = np.where(
            valid & np.isfinite(shifted) & (shifted < dem),
            (dem - shifted) / dist,
            -np.inf,
        )
        mask = (slope > best_slope) & valid
        flow_dir[mask] = code
        best_slope[mask] = slope[mask]

    return flow_dir


def compute_hand(dem: np.ndarray, flow_dir: np.ndarray, valid: np.ndarray,
                 stream: np.ndarray, max_iter: int = 2000):
    """Propagate HAND upstream from stream cells via reverse flow tracing.

    For cell P flowing downstream to D: HAND[P] = DEM[P] - DEM[D] + HAND[D].
    Stream cells start at HAND = 0 and the value propagates upstream.
    """
    h, w = dem.shape
    hand = np.full((h, w), np.nan, dtype=np.float64)
    hand[stream & valid] = 0.0

    iteration = 0
    while iteration < max_iter:
        iteration += 1
        changed = False
        for dy, dx, dist, code in D8:
            # DEM and HAND at the downstream neighbour D = P + (dy, dx)
            dem_ds = shift_array(dem, dy, dx, np.inf)
            hand_ds = shift_array(hand, dy, dx, np.nan)

            flows_here = (flow_dir == code) & valid
            have_ds = flows_here & np.isfinite(hand_ds)
            if not have_ds.any():
                continue

            new_hand = dem - dem_ds + hand_ds
            upd = have_ds & (~np.isfinite(hand) | (new_hand < hand))
            hand[upd] = new_hand[upd]
            if upd.any():
                changed = True

        if not changed:
            break

    # Cells with no path to mapped drainage (flow off-raster or to sinks):
    # nodata — honest data-quality signal, not invented data.
    no_hand = valid & ~np.isfinite(hand)
    hand[~valid] = NODATA
    hand[no_hand] = NODATA

    finite = np.isfinite(hand) & (hand != NODATA)
    log(f"HAND propagation converged after {iteration} iterations; "
        f"{int(np.count_nonzero(finite)):,} cells reach mapped drainage, "
        f"{int(np.count_nonzero(no_hand)):,} cells drain off-raster/to sinks (nodata)")
    return hand


def log(*a):
    print(*a, flush=True)


def main() -> int:
    with rasterio.open(DEM) as s:
        dem = s.read(1).astype(np.float64)
        profile = s.profile
        dem_nodata = s.nodata

    valid = dem != dem_nodata
    log(f"DEM: {dem.shape[1]}x{dem.shape[0]}, {int(np.count_nonzero(valid)):,} valid cells")

    flow_dir = compute_flow_direction(dem, valid)
    n_sinks = int(np.count_nonzero((flow_dir == -1) & valid))
    log(f"Flow direction computed; {n_sinks:,} sink/no-outlet cells")

    with rasterio.open(GSW) as s:
        gsw = s.read(1).astype(np.float64)
        gsw_nodata = s.nodata
    stream = (gsw > STREAM_THRESHOLD) & valid & (gsw != gsw_nodata)
    log(f"Drainage cells (GSW > {STREAM_THRESHOLD}%): {int(np.count_nonzero(stream)):,}")

    hand = compute_hand(dem, flow_dir, valid, stream)
    finite = np.isfinite(hand) & (hand != NODATA)
    if np.count_nonzero(finite) > 0:
        log(f"HAND: min={hand[finite].min():.1f} m  median={np.median(hand[finite]):.1f} m  "
            f"max={hand[finite].max():.1f} m")
    else:
        log("HAND: no cells reach mapped drainage (all nodata)")

    out_profile = profile | {
        "dtype": "float32", "nodata": NODATA,
        "compress": "lzw", "tiled": True,
    }
    with rasterio.open(HAND, "w", **out_profile) as dst:
        dst.write(hand.astype(np.float32), 1)
    log(f"wrote {HAND}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
