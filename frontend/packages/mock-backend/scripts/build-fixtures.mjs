#!/usr/bin/env node
/**
 * BUILD-TIME ONLY — SYNTHETIC FIXTURE GENERATION. Never imported by an app, never run in a browser.
 *
 * Precomputes the static evacuation-route geometry that the Majuli mock seed serves. A small
 * Dijkstra runs ONCE here over the bundled @setu/geo road network (roads + roads-minor + bridges),
 * for a handful of settlement→shelter pairs chosen to exercise Karthik's scenarios:
 *   S1  bridge 284824410 submerged   → baseline route crosses it, alternate avoids it
 *   S2  road 1074461062 blocked      → baseline route to MJ-SH-009 crosses it, alternate avoids it
 *   S4  Auniati (10692764768) cut off → routes exist in the baseline; the seed marks them all unavailable
 * The runtime mock never routes: it flips pre-baked `status` on these static features.
 *
 * Travel time (etaMin) is length / class speed — an authored estimate, not a traffic or flood-aware
 * model. Routes are SYNTHETIC. The S4 reachability check below uses the interim DEM-threshold flood
 * mask (also synthetic) and is recorded in the output, not hidden.
 *
 * Inputs : packages/geo/data/*.geojson, packages/mock-backend/fixtures/flood-83.8.json (from dem.mjs)
 * Output : packages/mock-backend/fixtures/routes.json
 * Usage  : node packages/mock-backend/scripts/build-fixtures.mjs   (run dem.mjs first)
 */
import process from 'node:process';
import console from 'node:console';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const GEO = resolve(args['geo-data'] ?? join(here, '../../geo/data'));
const FIX = resolve(args.fixtures ?? join(here, '../src/seed/fixtures'));
mkdirSync(FIX, { recursive: true });
const read = (dir, f) => JSON.parse(readFileSync(join(dir, f), 'utf8'));

const S1_BRIDGE = '284824410';
const S2_ROAD = '1074461062';
const S2_SHELTER = 'MJ-SH-009';
const AUNIATI = '10692764768';
// km/h by OSM class — authored estimates for a synthetic ETA.
const SPEED = { trunk: 50, primary: 50, secondary: 40, tertiary: 35, unclassified: 25, residential: 20 };

// ---- graph ------------------------------------------------------------------
const roadFeatures = [...read(GEO, 'roads.geojson').features, ...read(GEO, 'roads-minor.geojson').features, ...read(GEO, 'bridges.geojson').features].filter(
  (f) => f.properties.highway !== 'construction' && f.geometry.type === 'LineString',
);
const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`;
const nodes = new Map(); // key -> {id, lon, lat, edges:[{to, id(osm), m, h}]}
const node = (p) => {
  const k = key(p);
  if (!nodes.has(k)) nodes.set(k, { k, lon: p[0], lat: p[1], edges: [] });
  return nodes.get(k);
};
const hav = (a, b) => {
  const R = 6371008.8, r = Math.PI / 180;
  const dLat = (b[1] - a[1]) * r, dLon = (b[0] - a[0]) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
const seen = new Set();
for (const f of roadFeatures) {
  const osm = String(f.properties.osm_id);
  const dedupe = `${osm}|${f.geometry.coordinates.length}|${key(f.geometry.coordinates[0])}`;
  if (seen.has(dedupe)) continue; // a bridge appears in both roads and bridges layers
  seen.add(dedupe);
  const c = f.geometry.coordinates;
  const speed = SPEED[f.properties.highway] ?? 20;
  for (let i = 1; i < c.length; i++) {
    const a = node(c[i - 1]), b = node(c[i]);
    const m = hav(c[i - 1], c[i]);
    if (a === b) continue;
    const e = { m, h: m / ((speed * 1000) / 3600), osm, mid: [(c[i - 1][0] + c[i][0]) / 2, (c[i - 1][1] + c[i][1]) / 2] };
    a.edges.push({ ...e, to: b });
    b.edges.push({ ...e, to: a });
  }
}
const nodeList = [...nodes.values()];

function nearestNode(lon, lat) {
  let best = null, bd = Infinity;
  for (const n of nodeList) {
    const d = (n.lon - lon) ** 2 + ((n.lat - lat) * 1.0) ** 2;
    if (d < bd) { bd = d; best = n; }
  }
  return best;
}

/** Dijkstra by travel time. `blocked(edge)` removes edges. Returns {path:[node], edges:[edge], seconds, meters} | null. */
function route(src, dst, blocked = () => false) {
  const dist = new Map([[src, 0]]);
  const prev = new Map();
  const done = new Set();
  const heap = [[0, src]];
  const push = (it) => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0]; const last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [d, u] = pop();
    if (done.has(u)) continue;
    done.add(u);
    if (u === dst) break;
    for (const e of u.edges) {
      if (blocked(e)) continue;
      const nd = d + e.h;
      if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, [u, e]); push([nd, e.to]); }
    }
  }
  if (!dist.has(dst)) return null;
  const path = [dst], edges = [];
  for (let u = dst; u !== src;) { const [p, e] = prev.get(u); edges.unshift(e); path.unshift(p); u = p; }
  return { path, edges, seconds: dist.get(dst), meters: edges.reduce((s, e) => s + e.m, 0) };
}
const reachable = (src, blocked) => {
  const seenN = new Set([src]);
  const st = [src];
  while (st.length) for (const e of st.pop().edges) if (!blocked(e) && !seenN.has(e.to)) { seenN.add(e.to); st.push(e.to); }
  return seenN;
};

// ---- endpoints --------------------------------------------------------------
const settlements = read(GEO, 'places.geojson').features
  .filter((f) => ['village', 'hamlet', 'town'].includes(f.properties.place))
  .map((f) => ({ id: String(f.properties.osm_id), name: f.properties.name, n: nearestNode(...f.geometry.coordinates) }));
const shelters = read(GEO, 'shelters.geojson').features.map((f) => ({ id: f.properties.shelter_id, name: f.properties.name, n: nearestNode(...f.geometry.coordinates) }));
const sById = new Map(settlements.map((s) => [s.id, s]));
const bridgeBlocked = (e) => e.osm === S1_BRIDGE;
// Karthik's S2 closes 200 m of this road, but the contract's unit is the whole road (roadId), so the
// whole road is treated as blocked, matching what the mock's scripted rule does at runtime.
const roadBlocked = (e) => e.osm === S2_ROAD;
const usesRoad = (r, id) => r.edges.some((e) => e.osm === id);
const giant = reachable(settlements[0].n, () => false);

// all baseline pairs
const pairs = [];
for (const s of settlements) for (const h of shelters) {
  if (!giant.has(s.n) || !giant.has(h.n) || s.n === h.n) continue;
  const base = route(s.n, h.n);
  if (base) pairs.push({ s, h, base });
}

// ---- choose scenario pairs ---------------------------------------------------
const out = [];
const notes = [];
function geometry(r) { return { type: 'LineString', coordinates: r.path.map((n) => [n.lon, n.lat]) }; }
function viaRoads(r) { return [...new Set(r.edges.map((e) => e.osm))]; }
function add(routeId, s, h, r, extra) {
  out.push({
    routeId, from: s.id, to: h.id, fromName: s.name, toName: h.name, kind: 'evacuation',
    etaMin: Math.max(1, Math.round(r.seconds / 60)), lengthM: Math.round(r.meters), viaRoadIds: viaRoads(r),
    geometry: geometry(r), ...extra,
  });
}

// S2: baseline to MJ-SH-009 crossing road 1074461062; alternate = same shelter if reachable else best other shelter.
const s2 = pairs.filter((p) => p.h.id === S2_SHELTER && usesRoad(p.base, S2_ROAD)).sort((a, b) => a.base.seconds - b.base.seconds);
let s2Pair = s2[0];
if (!s2Pair) {
  // fall back: any settlement whose route to the shelter exists (S2 edge may not lie on a shortest path)
  notes.push('S2: no shortest path to MJ-SH-009 crosses road 1074461062');
}
if (s2Pair) {
  const p = s2Pair;
  add(`rt-${p.s.id}-${p.h.id}`, p.s, p.h, p.base, { scenario: 'S2', role: 'baseline', crosses: [S2_ROAD] });
  const sameShelter = route(p.s.n, p.h.n, roadBlocked);
  if (sameShelter) {
    add(`rt-${p.s.id}-${p.h.id}-alt-s2`, p.s, p.h, sameShelter, { scenario: 'S2', role: 'alternate', replaces: `rt-${p.s.id}-${p.h.id}`, avoids: [S2_ROAD] });
  } else {
    const others = shelters.filter((h) => h.id !== S2_SHELTER && giant.has(h.n)).map((h) => ({ h, r: route(p.s.n, h.n, roadBlocked) })).filter((x) => x.r).sort((a, b) => a.r.seconds - b.r.seconds);
    if (others.length) add(`rt-${p.s.id}-${others[0].h.id}-alt-s2`, p.s, others[0].h, others[0].r, { scenario: 'S2', role: 'alternate', replaces: `rt-${p.s.id}-${p.h.id}`, avoids: [S2_ROAD], note: 'MJ-SH-009 unreachable without the closed road; alternate goes to another shelter' });
  }
}

// S1: pair whose baseline crosses the bridge and has the shortest alternate; prefer the shortest alternate detour.
const s1 = pairs
  .filter((p) => usesRoad(p.base, S1_BRIDGE))
  .map((p) => ({ ...p, alt: route(p.s.n, p.h.n, bridgeBlocked) }))
  .filter((p) => p.alt && p.h.id !== S2_SHELTER && p.s.id !== AUNIATI && !out.some((r) => r.from === p.s.id))
  .sort((a, b) => a.base.seconds - b.base.seconds);
const s1Affected = [...new Set(pairs.filter((p) => usesRoad(p.base, S1_BRIDGE)).map((p) => p.s.id))];
if (s1.length) {
  const p = s1[0];
  add(`rt-${p.s.id}-${p.h.id}`, p.s, p.h, p.base, { scenario: 'S1', role: 'baseline', crosses: [S1_BRIDGE] });
  add(`rt-${p.s.id}-${p.h.id}-alt-s1`, p.s, p.h, p.alt, { scenario: 'S1', role: 'alternate', replaces: `rt-${p.s.id}-${p.h.id}`, avoids: [S1_BRIDGE] });
} else notes.push('S1: no settlement→shelter pair with a baseline crossing the bridge AND an alternate; see s1Affected');

// S4: Auniati — two nearest-by-time baseline shelters. Seed marks every one unavailable.
const au = sById.get(AUNIATI);
const auRoutes = pairs.filter((p) => p.s.id === AUNIATI).sort((a, b) => a.base.seconds - b.base.seconds);
for (const p of auRoutes.slice(0, 2)) add(`rt-${p.s.id}-${p.h.id}`, p.s, p.h, p.base, { scenario: 'S4', role: 'baseline' });

// Control: a settlement not affected by S1/S2/S4 stays active.
const used = new Set(out.map((r) => r.from));
const control = pairs.filter((p) => !used.has(p.s.id) && !s1Affected.includes(p.s.id) && !usesRoad(p.base, S1_BRIDGE) && !usesRoad(p.base, S2_ROAD)).sort((a, b) => a.base.seconds - b.base.seconds)[0];
if (control) add(`rt-${control.s.id}-${control.h.id}`, control.s, control.h, control.base, { scenario: 'none', role: 'control' });

// ---- S4 reachability check against the interim flood mask -------------------
let s4Check = { checked: false };
try {
  const flood = read(FIX, 'flood-83.8.json');
  const inRing = (x, y, ring) => { let c = false; for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) { const [xi, yi] = ring[i], [xj, yj] = ring[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
  const polys = flood.features.map((f) => { const r = f.geometry.coordinates[0]; const xs = r.map((p) => p[0]), ys = r.map((p) => p[1]); return { f, r, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)], holes: f.geometry.coordinates.slice(1) }; });
  const flooded = (x, y) => polys.some((p) => x >= p.bb[0] && x <= p.bb[2] && y >= p.bb[1] && y <= p.bb[3] && inRing(x, y, p.r) && !p.holes.some((h) => inRing(x, y, h)));
  const memo = new Map();
  const edgeFlooded = (e) => { const k = e.mid.join(); if (!memo.has(k)) memo.set(k, flooded(...e.mid)); return memo.get(k); };
  const closed = (e) => bridgeBlocked(e) || roadBlocked(e) || edgeFlooded(e);
  const reach = reachable(au.n, closed);
  const shelterResults = shelters.map((h) => ({ shelterId: h.id, reachable: reach.has(h.n), shelterFlooded: flooded(h.n.lon, h.n.lat) }));
  const ok = shelterResults.filter((r) => r.reachable && !r.shelterFlooded);
  s4Check = {
    checked: true, mask: 'flood-83.8.json (synthetic interim DEM mask)', closures: [S1_BRIDGE, S2_ROAD, 'edges whose midpoint is in the 83.8 m mask'],
    auniatiStartFlooded: flooded(au.n.lon, au.n.lat), safeReachableShelters: ok.map((r) => r.shelterId), noSafeRoute: ok.length === 0,
  };
  if (ok.length) notes.push(`S4: graph check still reaches ${ok.length} shelter(s) with the 83.8 m mask; the scripted S4 rule asserts "no safe route" by scenario design (synthetic engineered cut-off)`);
} catch (e) {
  notes.push(`S4 check skipped: ${e.message}`);
}


// ---- seed fixtures ----------------------------------------------------------
const feat = (geometry, properties) => ({ type: 'Feature', geometry, properties });
const fc = (features) => ({ type: 'FeatureCollection', features });
const CURATED = new Set(['trunk', 'trunk_link', 'primary', 'secondary', 'tertiary']);
const bridgeLayer = read(GEO, 'bridges.geojson').features;
const bridgeIds = new Set(bridgeLayer.map((f) => String(f.properties.osm_id)));
const allWays = new Map(); // osm_id -> feature (roads/minor first, bridges override geometry-equal duplicates)
for (const f of roadFeatures) if (!allWays.has(String(f.properties.osm_id))) allWays.set(String(f.properties.osm_id), f);
const curatedIds = new Set([S1_BRIDGE, S2_ROAD]);
for (const f of roadFeatures) if (CURATED.has(f.properties.highway)) curatedIds.add(String(f.properties.osm_id));
for (const f of bridgeLayer) if (CURATED.has(f.properties.highway) && f.properties.length_m >= 30) curatedIds.add(String(f.properties.osm_id));
for (const r of out) for (const id of r.viaRoadIds) curatedIds.add(id); // every route's roads resolve in the roads layer
const roadsFc = fc(
  [...curatedIds].filter((id) => allWays.has(id)).map((id) => {
    const f = allWays.get(id);
    const isBridge = bridgeIds.has(id);
    const name = f.properties.name || (isBridge ? `Unnamed bridge (OSM ${id})` : `Unnamed ${f.properties.highway} road (OSM ${id})`);
    return feat(f.geometry, { roadId: id, name, kind: isBridge ? 'bridge' : 'road' });
  }),
);
const settlementsFc = fc(
  read(GEO, 'places.geojson').features
    .filter((f) => ['village', 'hamlet', 'town'].includes(f.properties.place))
    // population is published for ~1 of 62 places and not carried into the bundle: 0 = "not published"
    .map((f) => feat(f.geometry, { settlementId: String(f.properties.osm_id), name: f.properties.name, population: 0 })),
);
const sheltersFc = fc(read(GEO, 'shelters.geojson').features.map((f) => feat(f.geometry, { shelterId: f.properties.shelter_id, name: f.properties.name })));
const routesFc = fc(
  out.map((r) => feat(r.geometry, {
    routeId: r.routeId, from: r.from, to: r.to, etaMin: r.etaMin, lengthM: r.lengthM, viaRoadIds: r.viaRoadIds,
    role: r.role === 'alternate' ? 'alternate' : 'baseline', scenario: r.scenario,
    ...(r.replaces ? { replacesRouteId: r.replaces } : {}), ...(r.note ? { note: r.note } : {}),
  })),
);
// roadId -> settlements whose shortest evacuation path crosses it (S1) / that the S2 route serves
const affectedSettlements = {
  [S1_BRIDGE]: [...new Set(pairs.filter((p) => usesRoad(p.base, S1_BRIDGE)).map((p) => p.s.id))],
  // only the settlement whose route to the S2 shelter is the scripted S2 baseline
  [S2_ROAD]: s2Pair ? [s2Pair.s.id] : [],
};
const notesJson = {
  synthetic: true,
  generatedBy: 'packages/mock-backend/scripts/build-fixtures.mjs',
  note: 'SYNTHETIC fixture. Routes precomputed once at build time by Dijkstra over the bundled OSM road graph (travel time = length / authored class speed). Not live routing, not flood-aware, not validated.',
  speedsKmh: SPEED,
  affectedSettlements,
  /** Settlements whose snapped node is not in the main connected road component (no route offered, none faked). */
  settlementsWithoutRoute: settlements.filter((s) => !pairs.some((p) => p.s === s)).map((s) => ({ id: s.id, name: s.name })),
  s4Check,
  notes,
};
for (const [name, v] of [['roads', roadsFc], ['settlements', settlementsFc], ['shelters', sheltersFc], ['routes', routesFc], ['NOTES', notesJson]]) {
  writeFileSync(join(FIX, `${name}.json`), JSON.stringify(v));
}
console.log(`fixtures: roads ${roadsFc.features.length}, settlements ${settlementsFc.features.length}, shelters ${sheltersFc.features.length}, routes ${routesFc.features.length}`);
for (const r of out) console.log(' ', r.routeId, r.scenario, r.role, `${r.etaMin} min`, `${r.lengthM} m`);
console.log('affectedSettlements', JSON.stringify(affectedSettlements), '\ns4Check', JSON.stringify(s4Check), '\nnotes', notes);
