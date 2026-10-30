import { useEffect, useRef, useState } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type MapMouseEvent } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEvents, useProjections } from '../data';
import { useSelection } from '../app';
import {
  ALWAYS_LAYERS, COLORS, EMPTY_FC, GROUP_NAMES, INTERACTIVE_LAYERS, KIND_GROUP, MAP_LAYERS, SOURCE_IDS, TOGGLE_IDS, TOGGLE_LAYERS,
  featureToSelection, idsFilter, selectionFilter, snapshotSources,
} from './layers';
import { BASE_BOUNDS, baseLayerIds, loadBasemap, offlineStyle } from './basemap';
import { selectionBounds } from './bounds';
import { blockingByGroup, blockingIds, buildMarkers, type MarkerSpec } from './markers';
import { observationsToGeoJSON, registerObservationIcons } from './observations';
import { useMapLayers } from './toggles';
import { Legend } from './Legend';

const CLICK_TOLERANCE_PX = 6;

function markerElement(m: MarkerSpec, onSelect: () => void): HTMLElement {
  const el = document.createElement('div');
  el.dataset.testid = `map-marker-${m.featureId}`;
  el.dataset.markerKind = m.kind;
  if (m.passability) el.dataset.passability = m.passability;
  el.style.cssText = 'display:flex;flex-direction:column;align-items:center;cursor:pointer;font:600 12px system-ui,sans-serif;';
  const label = document.createElement('span');
  label.textContent = m.label;
  const tone = m.cutOff || m.impassable ? COLORS.critical : m.kind === 'shelter' ? COLORS.shelterOpen : '#212121';
  label.style.cssText = `background:#fff;color:${tone};border:1.5px solid ${tone};border-radius:4px;padding:1px 5px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.4);`;
  if (m.kind === 'bridge') {
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = m.impassable ? '✕' : '≍';
    icon.style.cssText = m.impassable
      ? `width:34px;height:34px;border-radius:50%;background:${COLORS.critical};color:#fff;border:3px solid #fff;display:flex;align-items:center;justify-content:center;font-size:24px;line-height:1;box-shadow:0 0 0 3px ${COLORS.critical},0 2px 6px rgba(0,0,0,.5);`
      : `width:26px;height:26px;border-radius:4px;background:${COLORS.warning};color:#fff;border:2px solid #fff;display:flex;align-items:center;justify-content:center;font-size:18px;line-height:1;`;
    el.append(icon, label);
  } else {
    label.style.marginTop = m.kind === 'settlement' ? '26px' : '14px';
    el.append(label);
  }
  el.addEventListener('click', (e) => { e.stopPropagation(); onSelect(); });
  return el;
}

interface MarkerEntry { marker: maplibregl.Marker; sig: string; toggle: MarkerSpec['toggle'] }

/**
 * MapLibre map. Created once; snapshot/event changes only call setData on existing sources
 * (and only for collections whose data actually changed). Renders server projections as-is.
 * The basemap is bundled (@setu/geo): no tile server, nothing leaves the machine.
 */
export function MapView() {
  const { snapshot, version } = useProjections();
  const { events } = useEvents();
  const { visible } = useMapLayers();
  const { selected, select } = useSelection();

  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const selectRef = useRef(select);
  selectRef.current = select;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const eventsRef = useRef(events);
  eventsRef.current = events;
  const markersRef = useRef(new Map<string, MarkerEntry>());
  const lastData = useRef(new Map<string, unknown>());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!container.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: container.current,
        bounds: BASE_BOUNDS,
        fitBoundsOptions: { padding: 24 },
        attributionControl: { compact: true, customAttribution: 'Basemap: bundled OpenStreetMap-derived data (offline)' },
        style: offlineStyle(),
      });
    } catch {
      // No WebGL (e.g. jsdom, blocked GPU): the lists and panels still work.
      return;
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
    map.on('error', () => {});

    map.on('load', () => {
      void loadBasemap(map).catch(() => {});
      for (const group of GROUP_NAMES) map.addSource(SOURCE_IDS[group], { type: 'geojson', data: EMPTY_FC });
      registerObservationIcons(map);
      for (const layer of MAP_LAYERS) map.addLayer(layer);

      for (const id of INTERACTIVE_LAYERS) {
        map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
      }
      setReady(true);
    });

    map.on('click', (e: MapMouseEvent) => {
      const { x, y } = e.point;
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [[x - CLICK_TOLERANCE_PX, y - CLICK_TOLERANCE_PX], [x + CLICK_TOLERANCE_PX, y + CLICK_TOLERANCE_PX]];
      const hits = map.queryRenderedFeatures(box, { layers: INTERACTIVE_LAYERS.filter((l) => map.getLayer(l)) });
      // Topmost interactive layer wins: order hits by INTERACTIVE_LAYERS priority.
      const rank = (id: string) => INTERACTIVE_LAYERS.indexOf(id);
      const ordered = [...hits].sort((a, b) => rank(a.layer.id) - rank(b.layer.id));
      for (const f of ordered) {
        const sel = featureToSelection(f.layer.id, f.properties);
        if (sel) return selectRef.current(sel);
      }
      selectRef.current(undefined);
    });

    const markers = markersRef.current;
    const data = lastData.current;
    return () => {
      mapRef.current = null;
      for (const e of markers.values()) e.marker.remove();
      markers.clear();
      data.clear();
      setReady(false);
      map.remove();
    };
  }, []);

  // Update sources in place; skip collections whose data did not change (the road layer is large).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const set = (id: string, data: unknown) => {
      if (lastData.current.get(id) === data) return;
      lastData.current.set(id, data);
      (map.getSource(id) as GeoJSONSource | undefined)?.setData(data as never);
    };
    if (snapshot) {
      const data = snapshotSources(snapshot);
      for (const group of GROUP_NAMES) if (group !== 'observations') set(SOURCE_IDS[group], data[group]);
    }
  }, [ready, snapshot]);

  // Report locations (listEvents).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource(SOURCE_IDS.observations) as GeoJSONSource | undefined)?.setData(observationsToGeoJSON(events) as never);
  }, [ready, events]);

  // Bridge / cut-off settlement / shelter labels: reconcile by key, touch only changed markers.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !snapshot) return;
    const existing = markersRef.current;
    const seen = new Set<string>();
    for (const m of buildMarkers(snapshot)) {
      seen.add(m.key);
      const sig = JSON.stringify(m);
      const prev = existing.get(m.key);
      if (prev?.sig === sig) continue;
      prev?.marker.remove();
      const marker = new maplibregl.Marker({
        element: markerElement(m, () => selectRef.current({ kind: m.featureKind, id: m.featureId })),
        anchor: 'center',
      }).setLngLat([m.lng, m.lat]).addTo(map);
      existing.set(m.key, { marker, sig, toggle: m.toggle });
    }
    for (const [key, e] of existing) {
      if (!seen.has(key)) { e.marker.remove(); existing.delete(key); }
    }
  }, [ready, snapshot]);

  // Marker visibility follows the layer toggles.
  useEffect(() => {
    for (const e of markersRef.current.values()) e.marker.getElement().style.display = visible[e.toggle] ? '' : 'none';
  }, [visible, snapshot, ready]);

  // Pulse the red halo behind cut-off settlements (skipped for reduced-motion users).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    if (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = setInterval(() => {
      if (!map.getLayer('settlements-halo') || !visible.cutoff) return;
      const k = (Math.sin(Date.now() / 350) + 1) / 2;
      map.setPaintProperty('settlements-halo', 'circle-radius', 18 + k * 12);
      map.setPaintProperty('settlements-halo', 'circle-opacity', 0.45 - k * 0.3);
    }, 100);
    return () => clearInterval(t);
  }, [ready, visible.cutoff]);

  // Highlight the features blocking the selected settlement/route (server-provided ids).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const by = blockingByGroup(snapshot, blockingIds(snapshot, selected));
    map.setFilter('roads-blocking', idsFilter('roads', by.roads));
    map.setFilter('flood-blocking', idsFilter('flood', by.flood));
  }, [ready, snapshot, selected]);

  // Layer toggles -> visibility of overlay and basemap layers.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const t of TOGGLE_IDS) {
      for (const id of [...TOGGLE_LAYERS[t], ...baseLayerIds(t)]) {
        if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible[t] ? 'visible' : 'none');
      }
    }
    for (const id of ALWAYS_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', 'visible');
  }, [ready, visible]);

  // Highlight the selection and bring it into view (routes: the whole geometry).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const group of GROUP_NAMES) {
      const id = selected && KIND_GROUP[selected.kind] === group ? selected.id : undefined;
      map.setFilter(`${group}-selected`, selectionFilter(group, id));
    }
    const b = selectionBounds(snapshotRef.current, eventsRef.current, selected);
    if (!b) return;
    const view = map.getBounds();
    if (view.contains(b[0]) && view.contains(b[1])) return;
    if (b[0][0] === b[1][0] && b[0][1] === b[1][1]) map.easeTo({ center: b[0], zoom: Math.max(map.getZoom(), 12), duration: 600 });
    else map.fitBounds(b, { padding: 80, maxZoom: 14, duration: 600 });
  }, [ready, selected]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 320 }}>
      <div
        ref={container}
        data-testid="map"
        data-projection-version={version ?? ''}
        role="application"
        aria-label="Situation map"
        style={{ position: 'absolute', inset: 0 }}
      />
      <Legend />
    </div>
  );
}
