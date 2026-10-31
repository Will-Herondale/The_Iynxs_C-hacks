#!/usr/bin/env node
/**
 * BUILD-TIME ONLY. Never imported by any app and never run in a browser.
 *
 * Derives two things from Karthik's Copernicus GLO-30 DEM (majuli_dem_30m_wgs84.tif,
 * read via `git show origin/data/karthik:...`, never checked out):
 *
 *  1. data/hillshade.png + data/hillshade.json  (terrain backdrop, image source for MapLibre)
 *  2. mock-backend/src/seed/fixtures/flood-<level>.json  — INTERIM SYNTHETIC flood polygons
 *     at the S1 (85.3 m) and S4 (83.8 m) levels.
 *
 * HONESTY NOTE: the flood polygons are a synthetic interim DEM-threshold mask
 * (cell is flooded iff DEM <= level), clipped to the island. They are NOT a hydraulic
 * simulation, ignore connectivity to the river and are based on a DSM (canopy/roof
 * surface). Pending Karthik/OpenCode. They carry confidence:'modelled'.
 *
 * Usage (from frontend/):
 *   node packages/geo/scripts/dem.mjs [--dem file.tif] [--ref origin/data/karthik]
 */
import process from 'node:process';
import console from 'node:console';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fromFile } from 'geotiff';
import { PNG } from 'pngjs';
import { contours } from 'd3-contour';
import simplify from '@turf/simplify';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const REF = args.ref ?? 'origin/data/karthik';
const GEO_DATA = resolve(args['geo-out'] ?? join(here, '../data'));
const FIXTURES = resolve(args['fixtures-out'] ?? join(here, '../../mock-backend/src/seed/fixtures'));
const repoRoot = execFileSync('git', ['rev-parse', '--show-toplevel']).toString().trim();
const gitShow = (p, file) => execFileSync('git', ['show', `${REF}:${p}`], { cwd: repoRoot, maxBuffer: 1 << 30, ...(file ? { stdio: ['ignore', file, 'inherit'] } : {}) });
const commit = execFileSync('git', ['rev-parse', REF], { cwd: repoRoot }).toString().trim();

// Levels from Karthik's scenario configs (S1 deck 84.8 + 0.5; S4 target level).
const LEVELS = [
  { id: 's4', level: 83.8, scenario: 'S4' },
  { id: 's1', level: 85.3, scenario: 'S1' },
];
const HILLSHADE_WIDTH = 1600; // px; keeps PNG well under 1 MB
const FLOOD_STEP = 2; // sample every 2nd DEM cell (~60 m) for the mask
const MIN_AREA_M2 = 20000; // drop specks smaller than ~2 ha
const SIMPLIFY_DEG = 0.0003; // ~30 m

mkdirSync(GEO_DATA, { recursive: true });
mkdirSync(FIXTURES, { recursive: true });

// ---- read inputs -----------------------------------------------------------
let demPath = args.dem;
if (!demPath) {
  const dir = mkdtempSync(join(tmpdir(), 'setu-dem-'));
  demPath = join(dir, 'dem.tif');
  const fd = (await import('node:fs')).openSync(demPath, 'w');
  gitShow('geo/data/out/majuli_dem_30m_wgs84.tif', fd);
}
const boundary = JSON.parse(gitShow('geo/data/out/geojson/majuli_boundary.geojson').toString());
const tiff = await fromFile(demPath);
const img = await tiff.getImage();
const W = img.getWidth();
const H = img.getHeight();
const [west, south, east, north] = img.getBoundingBox();
const nodata = Number(img.getGDALNoData() ?? -9999);
const dem = (await img.readRasters())[0];
const dx = (east - west) / W;
const dy = (north - south) / H;
const lon = (c) => west + c * dx; // c = cell edge index
const lat = (r) => north - r * dy;
const elev = (c, r) => {
  const v = dem[r * W + c];
  return v === nodata || Number.isNaN(v) ? NaN : v;
};
const mPerDegLat = 111320;
const mPerDegLon = 111320 * Math.cos((((south + north) / 2) * Math.PI) / 180);

// ---- island mask via scanline point-in-polygon ------------------------------
const polys = [];
for (const f of boundary.features) {
  const g = f.geometry;
  if (g.type === 'Polygon') polys.push(g.coordinates);
  else if (g.type === 'MultiPolygon') polys.push(...g.coordinates);
}
function inside(x, y) {
  let n = 0;
  for (const rings of polys) {
    let c = false;
    for (const ring of rings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
      }
    }
    if (c) n++;
  }
  return n % 2 === 1;
}
const mask = new Uint8Array(W * H);
for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) mask[r * W + c] = inside(lon(c + 0.5), lat(r + 0.5)) ? 1 : 0;

// ---- 1. hillshade -----------------------------------------------------------
{
  const k = Math.max(1, Math.ceil(W / HILLSHADE_WIDTH));
  const w = Math.floor(W / k);
  const h = Math.floor(H / k);
  const z = new Float32Array(w * h);
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      let s = 0, n = 0;
      for (let rr = 0; rr < k; rr++) for (let cc = 0; cc < k; cc++) {
        const v = elev(c * k + cc, r * k + rr);
        if (!Number.isNaN(v)) { s += v; n++; }
      }
      z[r * w + c] = n ? s / n : NaN;
    }
  const cellX = dx * k * mPerDegLon;
  const cellY = dy * k * mPerDegLat;
  const EXAG = 6; // flat delta: exaggerate relief or the island is a blank grey
  const az = (315 * Math.PI) / 180;
  const alt = (45 * Math.PI) / 180;
  const png = new PNG({ width: w, height: h });
  const at = (c, r) => { const v = z[Math.min(h - 1, Math.max(0, r)) * w + Math.min(w - 1, Math.max(0, c))]; return v; };
  for (let r = 0; r < h; r++)
    for (let c = 0; c < w; c++) {
      const o = (r * w + c) * 4;
      const zc = z[r * w + c];
      if (Number.isNaN(zc)) { png.data[o + 3] = 0; continue; }
      const f = (v) => (Number.isNaN(v) ? zc : v);
      const dzdx = ((f(at(c + 1, r - 1)) + 2 * f(at(c + 1, r)) + f(at(c + 1, r + 1))) - (f(at(c - 1, r - 1)) + 2 * f(at(c - 1, r)) + f(at(c - 1, r + 1)))) / (8 * cellX);
      const dzdy = ((f(at(c - 1, r + 1)) + 2 * f(at(c, r + 1)) + f(at(c + 1, r + 1))) - (f(at(c - 1, r - 1)) + 2 * f(at(c, r - 1)) + f(at(c + 1, r - 1)))) / (8 * cellY);
      const slope = Math.atan(EXAG * Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      let shade = Math.cos(Math.PI / 2 - alt) * Math.cos(slope) + Math.sin(Math.PI / 2 - alt) * Math.sin(slope) * Math.cos(az - aspect);
      shade = Math.max(0, Math.min(1, shade));
      const v = Math.round(60 + shade * 170);
      png.data[o] = png.data[o + 1] = png.data[o + 2] = v;
      png.data[o + 3] = 255;
    }
  const buf = PNG.sync.write(png, { colorType: 4, deflateLevel: 9 });
  writeFileSync(join(GEO_DATA, 'hillshade.png'), buf);
  const meta = {
    file: 'hillshade.png',
    width: w,
    height: h,
    bounds: [[west, south], [east, north]],
    /** MapLibre image-source order: TL, TR, BR, BL */
    coordinates: [[west, north], [east, north], [east, south], [west, south]],
    source: { branch: REF.replace('origin/', ''), commit, file: 'geo/data/out/majuli_dem_30m_wgs84.tif', licence: 'Copernicus GLO-30 (DSM)' },
    note: 'Hillshade of a DSM (canopy/roof surface) for orientation only; vertical exaggeration applied. Not survey-grade terrain.',
  };
  writeFileSync(join(GEO_DATA, 'hillshade.json'), JSON.stringify(meta, null, 2) + '\n');
  console.log(`hillshade.png ${w}x${h} ${(buf.length / 1024).toFixed(0)} KB`);
}

// ---- 2. interim synthetic flood polygons -----------------------------------
function ringAreaM2(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += (ring[j][0] * mPerDegLon) * (ring[i][1] * mPerDegLat) - (ring[i][0] * mPerDegLon) * (ring[j][1] * mPerDegLat);
  return Math.abs(a) / 2;
}
const round5 = (n) => Math.round(n * 1e5) / 1e5;
const S = FLOOD_STEP;
const gw = Math.floor(W / S);
const gh = Math.floor(H / S);
const outputs = {};
for (const { id, level, scenario } of LEVELS) {
  // value = 1 where flooded and on the island; d3-contour traces the 0.5 isoline.
  const vals = new Float64Array(gw * gh);
  const depthSum = new Float64Array(gw * gh);
  for (let r = 0; r < gh; r++)
    for (let c = 0; c < gw; c++) {
      const cc = c * S, rr = r * S;
      const m = mask[rr * W + cc];
      const e = elev(cc, rr);
      if (m && !Number.isNaN(e) && e <= level) { vals[r * gw + c] = 1; depthSum[r * gw + c] = level - e; }
    }
  const mp = contours().size([gw, gh]).thresholds([0.5])(vals)[0]; // MultiPolygon in grid coords
  const toLonLat = ([x, y]) => [round5(west + (x * S + S / 2) * dx), round5(north - (y * S + S / 2) * dy)];
  let features = [];
  for (const poly of mp.coordinates) {
    const rings = poly.map((ring) => ring.map(toLonLat));
    if (ringAreaM2(rings[0]) < MIN_AREA_M2) continue;
    const f = simplify({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: rings } }, { tolerance: SIMPLIFY_DEG, highQuality: false, mutate: false });
    if (f.geometry.coordinates[0].length < 4) continue;
    features.push(f);
  }
  // depth per polygon: mean (level - DEM) over flooded sample cells inside its bbox/ring
  features = features.map((f, i) => {
    const ring = f.geometry.coordinates[0];
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    let sum = 0, n = 0;
    const c0 = Math.max(0, Math.floor((Math.min(...xs) - west) / dx / S)), c1 = Math.min(gw - 1, Math.ceil((Math.max(...xs) - west) / dx / S));
    const r0 = Math.max(0, Math.floor((north - Math.max(...ys)) / dy / S)), r1 = Math.min(gh - 1, Math.ceil((north - Math.min(...ys)) / dy / S));
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (vals[r * gw + c]) { sum += depthSum[r * gw + c]; n++; }
    const depthCm = n ? Math.round((sum / n) * 100) : 0;
    const severity = depthCm >= 300 ? 5 : depthCm >= 200 ? 4 : depthCm >= 100 ? 3 : depthCm >= 50 ? 2 : 1;
    return { type: 'Feature', id: `flood-${scenario.toLowerCase()}-${String(i + 1).padStart(3, '0')}`, properties: { areaId: `flood-${scenario.toLowerCase()}-${String(i + 1).padStart(3, '0')}`, depthCm, severity, confidence: 'modelled' }, geometry: f.geometry };
  });
  const fc = {
    type: 'FeatureCollection',
    properties: {
      synthetic: true,
      scenario,
      waterLevelM: level,
      method: 'DEM <= level, island-clipped, d3-contour, simplified',
      note: 'Synthetic interim DEM-threshold mask, not a hydraulic simulation; pending Karthik/OpenCode.',
      source: { branch: REF.replace('origin/', ''), commit, file: 'geo/data/out/majuli_dem_30m_wgs84.tif', licence: 'Copernicus GLO-30 (DSM)' },
    },
    features,
  };
  const path = join(FIXTURES, `flood-${level.toFixed(1)}.json`);
  writeFileSync(path, JSON.stringify(fc));
  outputs[id] = { path, features: features.length, kb: Math.round(statSync(path).size / 1024) };
  console.log(`flood ${level} m (${scenario}): ${features.length} polygons, ${outputs[id].kb} KB -> ${path}`);
}
