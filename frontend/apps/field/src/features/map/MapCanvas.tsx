import { useEffect, useRef } from 'react';
import maplibregl, { type GeoJSONSource, type Map as MlMap, type Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { ProjectionSnapshot } from '@setu/contract';
import { addBaseLayers } from '@setu/geo';
import { createBasemapStyle, DISTRICT_BOUNDS } from './basemap.js';
import { EMPTY, PROJ, floodGeoJson, projectionView, roadsGeoJson } from './projectionLayers.js';
import { ORIGIN_SHAPE, originLabel } from '../status/origin.js';
import { MARKER_SHAPE, type ReportMarker } from './reportMarkers.js';
import type { VolunteerPosition } from './useVolunteerPosition.js';

export interface MapCanvasProps {
  snapshot?: ProjectionSnapshot;
  reports: ReportMarker[];
  position?: VolunteerPosition;
  onOpenReport: (clientEventId: string) => void;
}

function el(tag: string, cls: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  if (text) e.textContent = text;
  return e;
}

function reportElement(m: ReportMarker, open: (id: string) => void): HTMLElement {
  const meta = MARKER_SHAPE[m.state];
  const b = el('button', `map-report map-report--${m.state}`) as HTMLButtonElement;
  b.type = 'button';
  b.dataset.testid = `map-report-${m.clientEventId}`;
  b.dataset.state = m.state;
  b.dataset.origin = m.origin;
  const origin = originLabel(m.origin, m.accepted);
  b.setAttribute('aria-label', `${origin}, ${m.title}: ${m.statusLabel}.${m.origin === 'local' ? ' Open report details.' : ''}`);
  b.append(
    el('span', 'map-report__glyph', meta.glyph),
    el('span', 'map-report__origin', ORIGIN_SHAPE[m.origin].glyph),
    el('span', 'map-report__label', `${origin} · ${m.statusLabel}`),
  );
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    if (m.origin === 'local') open(m.clientEventId);
  });
  return b;
}

/** MapLibre canvas. Imperative; data comes only from props (cached server snapshot + local queue). */
export function MapCanvas({ snapshot, reports, position, onOpenReport }: MapCanvasProps) {
  const host = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MlMap | null>(null);
  const readyRef = useRef(false);
  const markers = useRef<Marker[]>([]);
  const openRef = useRef(onOpenReport);
  openRef.current = onOpenReport;
  const latest = useRef({ snapshot, reports, position });
  latest.current = { snapshot, reports, position };

  const render = () => {
    const map = mapRef.current;
    if (!map || !readyRef.current) return;
    const { snapshot: snap, reports: reps, position: pos } = latest.current;
    (map.getSource(PROJ.floodSrc) as GeoJSONSource | undefined)?.setData(snap ? floodGeoJson(snap) : EMPTY);
    (map.getSource(PROJ.roadsSrc) as GeoJSONSource | undefined)?.setData(snap ? roadsGeoJson(snap) : EMPTY);
    markers.current.forEach((m) => m.remove());
    markers.current = [];
    const add = (node: HTMLElement, lng: number, lat: number) =>
      markers.current.push(new maplibregl.Marker({ element: node }).setLngLat([lng, lat]).addTo(map));
    if (snap) {
      for (const s of projectionView(snap).cutOff) {
        const n = el('div', `map-settlement map-settlement--${s.accessibility}`, `${s.accessibility === 'cut_off' ? '⊘ Cut off' : '△ Limited access'}: ${s.name}`);
        n.dataset.testid = `map-settlement-${s.id}`;
        add(n, s.lng, s.lat);
      }
    }
    for (const r of reps) add(reportElement(r, (id) => openRef.current(id)), r.lng, r.lat);
    if (pos) {
      const n = el('div', 'map-you', '◉ You');
      n.dataset.testid = 'map-you';
      n.title = pos.accuracyM !== undefined ? `Accuracy about ${Math.round(pos.accuracyM)} m` : 'Accuracy unknown';
      add(n, pos.lng, pos.lat);
    }
  };

  useEffect(() => {
    if (!host.current) return;
    let map: MlMap;
    try {
      map = new maplibregl.Map({
        container: host.current,
        style: createBasemapStyle(),
        bounds: DISTRICT_BOUNDS,
        fitBoundsOptions: { padding: 12 },
        maxBounds: [
          [DISTRICT_BOUNDS[0][0] - 0.3, DISTRICT_BOUNDS[0][1] - 0.3],
          [DISTRICT_BOUNDS[1][0] + 0.3, DISTRICT_BOUNDS[1][1] + 0.3],
        ],
        attributionControl: { compact: true },
      });
    } catch {
      return; // no WebGL: the textual map data below remains
    }
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    map.on('load', () => {
      void addBaseLayers(map as never).catch(() => undefined); // bundled GeoJSON, works offline
      map.addSource(PROJ.floodSrc, { type: 'geojson', data: EMPTY });
      map.addSource(PROJ.roadsSrc, { type: 'geojson', data: EMPTY });
      // Blue = water. Observed: solid outline; modelled/synthetic: lighter fill + dashed outline.
      map.addLayer({
        id: PROJ.floodFill,
        type: 'fill',
        source: PROJ.floodSrc,
        paint: { 'fill-color': '#1565c0', 'fill-opacity': ['case', ['get', 'observed'], 0.45, 0.2] },
      });
      map.addLayer({
        id: PROJ.floodLine,
        type: 'line',
        source: PROJ.floodSrc,
        filter: ['==', ['get', 'observed'], true],
        paint: { 'line-color': '#0d47a1', 'line-width': 2 },
      });
      map.addLayer({
        id: PROJ.floodLineModelled,
        type: 'line',
        source: PROJ.floodSrc,
        filter: ['!=', ['get', 'observed'], true],
        paint: { 'line-color': '#0d47a1', 'line-width': 2, 'line-dasharray': [2, 2] },
      });
      // Red solid = blocked, orange dashed = partial (dash pattern is not data-driven, hence two layers).
      map.addLayer({
        id: PROJ.roadLine,
        type: 'line',
        source: PROJ.roadsSrc,
        filter: ['==', ['get', 'status'], 'blocked'],
        paint: { 'line-color': '#c62828', 'line-width': 5 },
      });
      map.addLayer({
        id: PROJ.roadLinePartial,
        type: 'line',
        source: PROJ.roadsSrc,
        filter: ['!=', ['get', 'status'], 'blocked'],
        paint: { 'line-color': '#ef6c00', 'line-width': 5, 'line-dasharray': [1, 1.5] },
      });
      readyRef.current = true;
      render();
    });
    return () => {
      readyRef.current = false;
      markers.current.forEach((m) => m.remove());
      markers.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(render, [snapshot, reports, position]);

  return <div ref={host} className="map-canvas" data-testid="map-canvas" role="application" aria-label="District map (works offline)" />;
}
