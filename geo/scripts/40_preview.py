#!/usr/bin/env python
"""Render a single PNG contact sheet of the sourced Majuli layers.

Purpose: a fast visual check that the data covers the right place, and a slide
asset that shows only *sourced* layers. No flood extent is drawn here — that is
scenario output and must stay visually separate.

Output: data/out/preview/majuli_layers.png
"""
from __future__ import annotations

import pathlib
import sys

import geopandas as gpd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.enums import Resampling
from matplotlib.lines import Line2D
from matplotlib.patches import Patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "data/out"
GJ = OUT / "geojson"
DEST = OUT / "preview"
DEST.mkdir(parents=True, exist_ok=True)

MAX_PX = 2400  # downsample big rasters so plotting stays quick


def read_small(path: pathlib.Path):
    with rasterio.open(path) as s:
        f = max(1, int(max(s.width, s.height) / MAX_PX))
        arr = s.read(1, out_shape=(s.height // f, s.width // f),
                     resampling=Resampling.average)
        bounds = s.bounds
        nodata = s.nodata
    return arr.astype("float32"), bounds, nodata


def main() -> int:
    dem_p = OUT / "majuli_dem_30m_wgs84.tif"
    gsw_p = OUT / "majuli_water_occurrence_30m.tif"
    if not dem_p.exists():
        print("missing", dem_p, "- run 10_process.py first", file=sys.stderr)
        return 1

    dem, db, dem_nodata = read_small(dem_p)
    dem = np.where(dem == dem_nodata, np.nan, dem)
    gsw, gb, gsw_nodata = read_small(gsw_p) if gsw_p.exists() else (None, None, None)
    if gsw is not None:
        gsw = np.where(gsw == gsw_nodata, np.nan, gsw)

    fig, ax = plt.subplots(figsize=(13, 7.2), dpi=170)
    ax.set_facecolor("#f6f4ef")

    # elevation as a muted background, not a rainbow
    im = ax.imshow(dem, extent=(db.left, db.right, db.bottom, db.top),
                   cmap="Greys", alpha=0.55, origin="upper", vmin=np.nanmin(dem),
                   vmax=np.nanmax(dem))
    cb = fig.colorbar(im, ax=ax, fraction=0.026, pad=0.012)
    cb.set_label("elevation (m, Copernicus GLO-30 DSM)", fontsize=8)
    cb.ax.tick_params(labelsize=7)

    if gsw is not None:
        wet = np.where(np.nan_to_num(gsw, nan=0) >= 25, 1.0, np.nan)
        ax.imshow(wet, extent=(gb.left, gb.right, gb.bottom, gb.top),
                  cmap=matplotlib.colors.ListedColormap(["#3d7ea6"]),
                  alpha=0.75, origin="upper", interpolation="nearest")

    def plot(path, **kw):
        p = GJ / path
        if not p.exists():
            return None
        g = gpd.read_file(p)
        if g.empty:
            return None
        g.plot(ax=ax, **kw)
        return g

    plot("majuli_boundary.geojson", facecolor="none", edgecolor="#222", linewidth=1.4)
    plot("waterways.geojson", color="#4f93b8", linewidth=0.5)
    plot("embankments.geojson", color="#8a5a2b", linewidth=0.8, alpha=0.9)
    plot("roads.geojson", color="#b03030", linewidth=0.35, alpha=0.7)

    sh = plot("shelters.geojson", color="#111", marker="^", markersize=26,
              edgecolor="white", linewidth=0.5, zorder=6)
    plot("places.geojson", color="#333", marker="o", markersize=6, zorder=5)

    # label only the larger places, to keep the frame readable
    if (GJ / "places.geojson").exists():
        pl = gpd.read_file(GJ / "places.geojson")
        big = pl[pl["place"].isin(["town", "village"])].head(12)
        for _, r in big.iterrows():
            ax.annotate(r["name"], (r.geometry.x, r.geometry.y),
                        textcoords="offset points", xytext=(3, 3), fontsize=6,
                        color="#222", zorder=7)

    ax.set_xlim(93.60, 94.70)
    ax.set_ylim(26.78, 27.22)
    ax.set_xlabel("longitude (°E)", fontsize=8)
    ax.set_ylabel("latitude (°N)", fontsize=8)
    ax.tick_params(labelsize=7)
    ax.grid(color="#bbb", linewidth=0.3, alpha=0.5)

    handles = [
        Patch(facecolor="#3d7ea6", alpha=0.75, label="water occurrence ≥25% (JRC GSW 1984–2021)"),
        Line2D([], [], color="#b03030", lw=0.8, label="roads (OSM)"),
        Line2D([], [], color="#222", lw=1.4, label="district outline (OSM)"),
        Line2D([], [], color="#111", marker="^", ls="", ms=7, label=f"relief camps from DDMA plan (n={0 if sh is None else len(sh)})"),
    ]
    ax.legend(handles=handles, loc="lower left", fontsize=7, framealpha=0.9)

    n_sh = 0 if sh is None else len(sh)
    ax.set_title("Majuli, Assam — sourced layers only\n"
                 "Copernicus GLO-30 · OpenStreetMap · JRC Global Surface Water · DDMA contingency plan",
                 fontsize=10, loc="left")
    fig.text(0.012, 0.012,
             "Camps are pre-identified in the DDMA plan, not confirmed open. "
             "No flood extent is shown: simulated extents live in scenario layers and are synthetic.",
             fontsize=6.5, color="#555")
    fig.tight_layout(rect=(0, 0.03, 1, 1))

    dest = DEST / "majuli_layers.png"
    fig.savefig(dest, bbox_inches="tight")
    print("wrote", dest, f"({dest.stat().st_size / 1e3:.0f} kB), camps plotted: {n_sh}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
