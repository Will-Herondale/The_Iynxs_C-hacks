#!/usr/bin/env node
import process from 'node:process';
import { Buffer } from 'node:buffer';
// Build-time import of Karthik's published Majuli layers (READ-ONLY source:
// `git show origin/data/karthik:<path>`). Never runs in the browser.
//   node scripts/import.mjs [--ref origin/data/karthik]
// Output: packages/geo/data/*.geojson + provenance.json + scenarios.json
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import bboxClip from '@turf/bbox-clip';
import booleanIntersects from '@turf/boolean-intersects';
import simplify from '@turf/simplify';
import bbox from '@turf/bbox';

const REF = process.argv.includes('--ref') ? process.argv[process.argv.indexOf('--ref') + 1] : 'origin/data/karthik';
const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
const show = (p) => execFileSync('git', ['show', `${REF}:${p}`], { maxBuffer: 1 << 29, encoding: 'utf8' });
const readJson = (p) => JSON.parse(show(p));
const sha = execFileSync('git', ['rev-parse', REF], { encoding: 'utf8' }).trim();
const G = 'geo/data/out/geojson/';

const round = (n) => Math.round(n * 1e5) / 1e5;
const roundCoords = (c) => (typeof c[0] === 'number' ? c.map(round) : c.map(roundCoords));
const pick = (props, keys) => Object.fromEntries(keys.filter((k) => props[k] !== null && props[k] !== undefined && props[k] !== '').map((k) => [k, props[k]]));

const boundary = readJson(G + 'majuli_boundary.geojson');
const island = boundary.features[0];
const [w, s, e, n] = bbox(island);
const PAD = 0.01;
const clipBox = [w - PAD, s - PAD, e + PAD, n + PAD];

const inIsland = (f) => booleanIntersects(f, island);

function finish(name, features, tolerance) {
  const fc = { type: 'FeatureCollection', features };
  const out = tolerance ? simplify(fc, { tolerance, highQuality: false, mutate: true }) : fc;
  for (const f of out.features) f.geometry.coordinates = roundCoords(f.geometry.coordinates);
  return out;
}
const feat = (f, props) => ({ type: 'Feature', properties: props, geometry: f.geometry });

const MAIN = new Set(['trunk', 'primary', 'secondary', 'tertiary', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link', 'unclassified']);
const MINOR = new Set(['residential', 'living_street']);
// dropped: track, path, footway, pedestrian, service, construction, proposed, bus_stop, road
const ROAD_KEYS = ['osm_id', 'name', 'highway', 'ref', 'surface', 'bridge', 'length_m'];

const roadsSrc = readJson(G + 'roads.geojson').features.filter(inIsland);
const layers = {};
layers.island = finish('island', [feat(island, pick(island.properties, ['name', 'area_m2']))], 0.00002);
layers.roads = finish('roads', roadsSrc.filter((f) => MAIN.has(f.properties.highway)).map((f) => feat(f, pick(f.properties, ROAD_KEYS))), 0.00001);
const minor = finish('roads-minor', roadsSrc.filter((f) => MINOR.has(f.properties.highway)).map((f) => feat(f, pick(f.properties, ROAD_KEYS))), 0.00002);
layers.bridges = finish('bridges', readJson(G + 'bridges.geojson').features.filter(inIsland).map((f) => feat(f, pick(f.properties, ['osm_id', 'name', 'highway', 'ref', 'bridge', 'man_made', 'length_m']))), 0.00002);
layers.waterbodies = finish('waterbodies',
  readJson(G + 'waterbodies.geojson').features.filter((f) => (f.properties.area_m2 ?? 0) >= 2000 && booleanIntersects(f, island))
    .map((f) => feat(bboxClip(f, clipBox), pick(f.properties, ['osm_id', 'name', 'natural', 'water', 'area_m2']))).filter((f) => f.geometry.coordinates.length && f.geometry.coordinates[0].length), 0.00003);
layers.waterways = finish('waterways',
  readJson(G + 'waterways.geojson').features.map((f) => {
    const c = bboxClip(f, clipBox);
    return c.geometry.coordinates.length ? feat(c, pick(f.properties, ['osm_id', 'name', 'waterway'])) : null;
  }).filter(Boolean), 0.00003);
layers.places = finish('places', readJson(G + 'places.geojson').features.filter(inIsland).map((f) => feat(f, pick(f.properties, ['osm_id', 'name', 'place', 'population']))));
layers.shelters = finish('shelters', readJson(G + 'shelters.geojson').features.map((f) => feat(f, pick(f.properties, ['shelter_id', 'name', 'source', 'source_url', 'status', 'synthetic', 'needs_review']))));
layers.ferries = finish('ferries', readJson(G + 'ferries.geojson').features.map((f) => feat(bboxClip(f, clipBox), pick(f.properties, ['osm_id', 'name', 'length_m']))));

mkdirSync(OUT, { recursive: true });
const write = (name, fc) => writeFileSync(path.join(OUT, name + '.geojson'), JSON.stringify(fc));
for (const [name, fc] of Object.entries(layers)) write(name, fc);
// roads-minor is optional and only bundled when small (<= 600 KB)
const minorSize = Buffer.byteLength(JSON.stringify(minor));
const bundledMinor = minorSize <= 600_000;
if (bundledMinor) write('roads-minor', minor);

// ---- scenarios (S1-S5 metadata copied from Karthik's configs) ----
const SC = { S1: 'S1_submerged_bridge', S2: 'S2_blocked_road', S3: 'S3_rising_water', S4: 'S4_settlement_disconnected', S5: 'S5_unsafe_route' };
const scenarios = Object.entries(SC).map(([id, file]) => {
  const j = readJson(`geo/data/out/scenarios/${file}.json`);
  const p = j.perturbations[0];
  const targets = {};
  if (id === 'S1') Object.assign(targets, { bridgeId: String(p.target.osm_id), deckElevationM: p.deck_elevation_m, waterLevelM: p.water_level_m });
  if (id === 'S2') Object.assign(targets, { roadId: String(p.target.osm_id), closureLengthM: p.closure.length_m, shelterId: p.exposed_shelter.shelter_id, shelterElevationM: p.exposed_shelter.dem_elev_m });
  if (id === 'S3') Object.assign(targets, { levelsM: p.levels_m });
  if (id === 'S4') Object.assign(targets, { settlementId: String(p.target_settlement.osm_id), settlementName: p.target_settlement.name, settlementElevationM: p.target_settlement.dem_elev_m, waterLevelM: p.water_level_m });
  if (id === 'S5') Object.assign(targets, { waterLevelM: p.water_level_m });
  return { id, name: j.name, slug: j.slug, note: j.note, synthetic: true, targets, expectedEffects: j.expected_effects };
});
writeFileSync(path.join(OUT, 'scenarios.json'), JSON.stringify(scenarios, null, 2) + '\n');

// ---- provenance ----
const odbl = 'ODbL 1.0 (© OpenStreetMap contributors)';
const src = (file, extra) => ({ branch: 'data/karthik', commit: sha, file: `geo/data/out/geojson/${file}`, licence: odbl, synthetic: false, ...extra });
const count = (k) => layers[k].features.length;
const provenance = {
  generatedBy: 'packages/geo/scripts/import.mjs',
  source: { repo: 'SETU', branch: 'data/karthik', pr: 16, commit: sha },
  processing: 'Features kept if they intersect majuli_boundary; waterways clipped to boundary bbox + 0.01°; coordinates rounded to 5 dp; simplified with @turf/simplify.',
  layers: {
    island: src('majuli_boundary.geojson', { note: 'OSM administrative outline (includes river channels), not a land-only mask.' }),
    waterbodies: src('waterbodies.geojson', { note: 'OSM natural=water polygons >= 2000 m².' }),
    waterways: src('waterways.geojson', { note: 'OSM waterways; permanent water as mapped, braided channels drift every monsoon.' }),
    roads: src('roads.geojson', { note: 'Trunk/primary/secondary/tertiary(+links)/unclassified only; tracks, paths, footways, service roads, construction/proposed dropped. Sparse in Majuli.' }),
    bridges: src('bridges.geojson', { note: 'OSM bridge=yes ways; no surveyed deck heights.' }),
    places: src('places.geojson', { note: 'Only a few places carry population.' }),
    shelters: src('shelters.geojson', { licence: 'Majuli District Flood Contingency Plan 2026-27 (DDMA Majuli)', note: 'Pre-identified camps, not confirmed open. Capacity and occupancy are NOT published.' }),
    ferries: src('ferries.geojson'),
    ...(bundledMinor ? { 'roads-minor': src('roads.geojson', { note: 'residential/living_street roads (optional layer).' }) } : {}),
    terrain: { branch: 'data/karthik', commit: sha, file: 'geo/data/out/majuli_dem_30m_wgs84.tif', licence: 'Copernicus DEM GLO-30 (ESA/Airbus), free with attribution', synthetic: false, note: 'Hillshade derived at build time (dem.mjs). DSM, ~4 m vertical error.' },
    waterOccurrence: { branch: 'data/karthik', commit: sha, file: 'geo/data/out/majuli_water_occurrence_30m.tif', licence: 'EC JRC/Google Global Surface Water', synthetic: false, note: 'Reference only; not bundled.' },
    scenarios: { branch: 'data/karthik', commit: sha, file: 'geo/data/out/scenarios/S1..S5_*.json', licence: 'Project data', synthetic: true, note: 'SYNTHETIC demonstration scenarios; not reconstructions of real events and not validated against observations.' },
  },
  counts: Object.fromEntries(Object.keys(layers).map((k) => [k, count(k)]).concat(bundledMinor ? [['roads-minor', minor.features.length]] : [])),
  bounds: [round(w), round(s), round(e), round(n)],
};
writeFileSync(path.join(OUT, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n');

// The TS sources embed provenance/scenarios directly so dist/ needs no JSON copy step.
const SRC = path.resolve(OUT, '../src');
writeFileSync(path.join(SRC, 'generated.ts'), `// GENERATED by scripts/import.mjs - do not edit.
import type { GeoProvenance, Scenario } from './types.js';

export const GEO_PROVENANCE: GeoProvenance = ${JSON.stringify(provenance, null, 2)};

export const SCENARIOS: readonly Scenario[] = ${JSON.stringify(scenarios, null, 2)};

export const MAJULI_BOUNDS: [[number, number], [number, number]] = [[${round(w)}, ${round(s)}], [${round(e)}, ${round(n)}]];
`);

let total = 0;
for (const f of readdirSync(OUT)) { const sz = statSync(path.join(OUT, f)).size; if (f.endsWith('.geojson')) total += sz; globalThis.console.log(f.padEnd(24), sz); }
globalThis.console.log('geojson total', total, 'roads-minor candidate', minorSize, bundledMinor ? '(bundled)' : '(skipped)');
