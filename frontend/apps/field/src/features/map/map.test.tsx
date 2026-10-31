// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ProjectionSnapshot } from '@setu/contract';
import type { QueueItem } from '../../sync/index.js';

const state = vi.hoisted(() => ({ items: [] as unknown[], snapshot: undefined as unknown, online: true }));

vi.mock('maplibre-gl', () => {
  class Marker {
    private el: HTMLElement;
    constructor(o: { element: HTMLElement }) { this.el = o.element; }
    setLngLat() { return this; }
    addTo() { document.body.appendChild(this.el); return this; }
    remove() { this.el.remove(); }
  }
  class MapMock {
    handlers: Record<string, () => void> = {};
    constructor() { setTimeout(() => this.handlers['load']?.(), 0); }
    on(e: string, h: () => void) { this.handlers[e] = h; }
    addControl() {}
    addSource() {}
    addLayer() {}
    getSource() { return { setData() {} }; }
    getZoom() { return 8; }
    remove() {}
  }
  return { default: { Map: MapMock, Marker, NavigationControl: class {} } };
});
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('../../sync/index.js', () => ({
  useQueue: () => state.items,
  useSyncState: () => ({ online: state.online, syncing: false, pendingCount: 0 }),
}));
vi.mock('../../offline/index.js', () => ({
  useCachedProjections: () => ({ snapshot: state.snapshot, cachedAt: 1, stale: true }),
  useRemoteEvents: () => [],
}));

import { MapScreen } from './MapScreen.js';
import { markerState, reportMarkers } from './reportMarkers.js';
import { projectionView } from './projectionLayers.js';

const mk = (id: string, status: string, type = 'road_blockage', extra: Record<string, unknown> = {}) =>
  ({ clientEventId: id, type, event: { type, location: { lat: 26.95, lng: 94.17 }, ...extra }, status, attempts: 0, createdAt: 1, updatedAt: 1 }) as unknown as QueueItem;

const snap = {
  version: 7,
  generatedAt: '2026-01-01T00:00:00+05:30',
  flood: { type: 'FeatureCollection', version: 7, generatedAt: '2026-01-01T00:00:00+05:30', features: [
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[94, 26.9], [94.1, 26.9], [94.1, 27], [94, 26.9]]] }, properties: { areaId: 'A1', depthCm: 40, severity: 3 } },
    { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[94, 26.9], [94.1, 26.9], [94.1, 27], [94, 26.9]]] }, properties: { areaId: 'A2', depthCm: 10, severity: 2, confidence: 'observed' } },
  ] },
  roads: { type: 'FeatureCollection', version: 7, generatedAt: '2026-01-01T00:00:00+05:30', features: [
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[94, 26.9], [94.1, 26.95]] }, properties: { roadId: '284824410', name: 'Bridge X', status: 'blocked', updatedAt: '2026-01-01T00:00:00+05:30', sourceEventIds: [], kind: 'bridge' } },
    { type: 'Feature', geometry: { type: 'LineString', coordinates: [[94, 26.9], [94.1, 26.95]] }, properties: { roadId: 'R2', name: 'Open road', status: 'open', updatedAt: '2026-01-01T00:00:00+05:30', sourceEventIds: [] } },
  ] },
  settlements: { type: 'FeatureCollection', version: 7, generatedAt: '2026-01-01T00:00:00+05:30', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [94.2, 26.97] }, properties: { settlementId: 'S1', name: 'Kamalabari', population: 10, accessibility: 'cut_off', households: 2, needs: [] } },
    { type: 'Feature', geometry: { type: 'Point', coordinates: [94.3, 26.97] }, properties: { settlementId: 'S2', name: 'Fine', population: 10, accessibility: 'accessible', households: 2, needs: [] } },
  ] },
  routes: { type: 'FeatureCollection', version: 7, generatedAt: '2026-01-01T00:00:00+05:30', features: [] },
  shelters: { type: 'FeatureCollection', version: 7, generatedAt: '2026-01-01T00:00:00+05:30', features: [
    { type: 'Feature', geometry: { type: 'Point', coordinates: [94.4, 26.9] }, properties: { shelterId: 'MJ-SH-009', name: 'Camp Nine', capacity: 0, occupancy: 0, open: false } },
  ] },
} as unknown as ProjectionSnapshot;

afterEach(() => { cleanup(); state.items = []; state.snapshot = undefined; state.online = true; });

describe('reportMarkers', () => {
  it('maps queue status onto distinct marker states', () => {
    expect(markerState('queued')).toBe('pending');
    expect(markerState('sending')).toBe('pending');
    expect(markerState('failed')).toBe('pending');
    expect(markerState('synced')).toBe('accepted');
    expect(markerState('conflict')).toBe('review');
    expect(markerState('rejected')).toBe('rejected');
  });
  it('skips households and uses spec labels', () => {
    const m = reportMarkers([mk('a', 'queued'), mk('h', 'queued', 'household_registration'), mk('c', 'synced', 'road_blockage', { cause: 'submerged' })], false);
    expect(m.map((x) => x.clientEventId)).toEqual(['a', 'c']);
    expect(m[0]!.statusLabel).toBe('Saved locally');
    expect(m[1]!.statusLabel).toBe('Accepted');
    expect(m[1]!.title).toBe('Submerged crossing');
  });
});

describe('projectionView', () => {
  it('lists only blocked roads, labelled flood, and non-accessible settlements', () => {
    const v = projectionView(snap);
    expect(v.blockedRoads.map((r) => r.id)).toEqual(['284824410']);
    expect(v.blockedRoads[0]!.kind).toBe('bridge');
    expect(v.flood.map((f) => f.label)).toEqual(['Modelled · EXPERIMENTAL', 'Observed']);
    expect(v.cutOff.map((s) => s.name)).toEqual(['Kamalabari']);
  });
});

describe('MapScreen', () => {
  it('renders offline with an honest empty projection state', () => {
    state.online = false;
    render(<MapScreen />);
    expect(screen.getByTestId('map-offline-note').textContent).toContain('Offline');
    expect(screen.getByText('No projection saved on this device yet')).toBeTruthy();
    expect(screen.getByTestId('map-canvas')).toBeTruthy();
  });

  it('declutters shelter labels at district zoom: glyph only, names hidden, except demo (synthetic) shelters', async () => {
    const s = structuredClone(snap);
    s.shelters.features[0]!.properties.synthetic = true;
    state.snapshot = s;
    state.items = [];
    render(<MapScreen onOpenReport={vi.fn()} />);
    await vi.waitFor(() => expect(document.querySelectorAll('[data-testid^="map-shelter-"]:not([data-testid="map-shelter-list"])').length).toBeGreaterThan(0));
    // The mock map reports zoom 8 (< SHELTER_NAME_ZOOM): zoomed-out class on the canvas.
    expect(screen.getByTestId('map-canvas').classList.contains('map-canvas--zoomed-out')).toBe(true);
    const markers = [...document.querySelectorAll<HTMLElement>('[data-testid^="map-shelter-"]:not([data-testid="map-shelter-list"])')];
    for (const m of markers) {
      expect(m.querySelector('.map-shelter__glyph')).not.toBeNull();
      expect(m.querySelector('.map-shelter__name')).not.toBeNull(); // present in the DOM for screen readers/zoom-in; hidden by CSS when zoomed out
      expect(m.getAttribute('aria-label')).toContain(':');
    }
    expect(markers[0]!.classList.contains('map-shelter--always-named')).toBe(true);
    expect(markers.slice(1).every((m) => !m.classList.contains('map-shelter--always-named'))).toBe(true);
  });

  it('shows cached projection lists and distinct pending vs accepted reports; tap opens detail', async () => {
    state.snapshot = snap;
    state.items = [mk('p1', 'queued'), mk('a1', 'synced')];
    const open = vi.fn();
    render(<MapScreen onOpenReport={open} />);
    expect(screen.getByTestId('map-blocked-list').textContent).toContain('Bridge X');
    expect(screen.getByTestId('map-flood-list').textContent).toContain('EXPERIMENTAL');
    const shel = screen.getByTestId('map-shelter-list');
    expect(shel.textContent).toContain('Pre-identified · not confirmed');
    expect(shel.textContent).toContain('capacity not published');
    expect(shel.textContent).not.toMatch(/Closed|0 of 0/);
    expect(screen.getByTestId('map-key-shelter').textContent).toContain('pre-identified');
    expect(screen.getByTestId('map-key-routes').textContent).toContain('not published');
    expect(screen.getAllByTestId('data-class-tag').map((e) => e.getAttribute('data-class'))).toEqual(expect.arrayContaining(['REAL', 'SYNTHETIC', 'EXPERIMENTAL']));
    expect(screen.getByTestId('map-cutoff-list').textContent).toContain('Kamalabari');
    const links = screen.getAllByTestId('map-report-link');
    expect(links.map((l) => l.closest('li')!.getAttribute('data-state'))).toEqual(['pending', 'accepted']);
    fireEvent.click(links[1]!);
    expect(open).toHaveBeenCalledWith('a1');
    // on-map markers render after the style "loads"
    await vi.waitFor(() => expect(document.querySelector('[data-state="accepted"].map-report')).toBeTruthy());
    const marker = document.querySelector('[data-state="pending"].map-report') as HTMLElement;
    expect(marker.textContent).toContain('Waiting to sync');
    fireEvent.click(marker);
    expect(open).toHaveBeenCalledWith('p1');
  });
});
