// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ProjectionSnapshot } from '@setu/contract';
import { fixtureSnapshot } from '../testing/fixture';
import { SelectionProvider, useSelection } from '../app';
import { FeaturePanelView } from '../panels';
import { RoutesSectionView } from './routes';
import { SettlementsSectionView, settlementRows } from './settlements';

let seed: ProjectionSnapshot;
beforeAll(async () => { seed = fixtureSnapshot(); });
afterEach(cleanup);

function Probe() {
  const { selected } = useSelection();
  return <output data-testid="probe">{selected ? `${selected.kind}:${selected.id}` : ''}</output>;
}
const wrap = (ui: React.ReactNode, initial?: { kind: 'road' | 'settlement' | 'flood'; id: string }) =>
  render(<SelectionProvider {...(initial ? { initial } : {})}>{ui}<Probe /></SelectionProvider>);

function cutOff(): ProjectionSnapshot {
  const s = structuredClone(seed);
  const target = s.settlements.features[0]!.properties;
  target.accessibility = 'cut_off';
  target.cutOffReason = { summary: 'Bridge submerged', blockingFeatureIds: ['BR-1'], sourceEventIds: ['c-1'] };
  target.evacuationDeadline = '2026-10-30T18:00:00Z';
  target.evacuationPriority = 'critical';
  for (const f of s.routes.features) if (f.properties.from === target.settlementId) {
    f.properties.status = 'unavailable';
    f.properties.refusal = { summary: 'BR-1 impassable', blockingFeatureIds: ['BR-1'] };
  }
  return s;
}

describe('settlements section', () => {
  it('shows contract columns, "—" with tooltip for #15 columns, and selects on row click', () => {
    const s = cutOff();
    const id = s.settlements.features[0]!.properties.settlementId;
    wrap(<SettlementsSectionView snapshot={s} now={Date.parse('2026-10-30T12:00:00Z')} />);
    const row = screen.getByTestId(`settlement-row-${id}`);
    expect(within(row).getByTestId(`segment-${id}`).textContent).toBe('BR-1');
    expect(row.textContent).toContain('critical');
    expect(within(row).getByTestId('na-nearest-shelter').getAttribute('title')).toBe('not in contract (#15)');
    expect(within(row).getByTestId('na-travel-time').textContent).toBe('—');
    fireEvent.click(row);
    expect(screen.getByTestId('probe').textContent).toBe(`settlement:${id}`);
  });
  it('sorts and searches', () => {
    const s = cutOff();
    wrap(<SettlementsSectionView snapshot={s} />);
    const first = () => screen.getAllByTestId(/^settlement-row-/)[0]!.getAttribute('data-accessibility');
    expect(first()).toBe('cut_off');
    fireEvent.click(screen.getByTestId('settlements-sort-accessibility'));
    expect(first()).not.toBe('cut_off');
    const name = s.settlements.features[1]!.properties.name;
    fireEvent.change(screen.getByTestId('settlements-search'), { target: { value: name } });
    expect(screen.getAllByTestId(/^settlement-row-/).length).toBeGreaterThanOrEqual(1);
    fireEvent.change(screen.getByTestId('settlements-search'), { target: { value: 'zzzz-none' } });
    expect(screen.queryAllByTestId(/^settlement-row-/)).toHaveLength(0);
  });
  it('flags no-safe-route status from server route statuses', () => {
    const s = cutOff();
    const id = s.settlements.features[0]!.properties.settlementId;
    expect(settlementRows(s).find((r) => r.id === id)!.status).toBe('no-safe-route');
  });
});

describe('route honesty states', () => {
  it('active routes are "Route not verified", with indicative ETA', () => {
    wrap(<RoutesSectionView snapshot={seed} />);
    const rows = screen.getAllByTestId(/^route-row-/).filter((c) => c.getAttribute('data-status') !== 'unavailable');
    expect(rows.length).toBeGreaterThan(0);
    for (const c of rows) {
      expect(c.getAttribute('data-route-state')).toBe('not-verified');
      expect(c.textContent).toContain('Route not verified');
      expect(c.textContent).toContain('indicative, source unconfirmed');
    }
    expect(screen.getByTestId('routes-source-note').textContent).toContain('cannot confirm');
  });
  it('shows "Route calculated" only when the backend marks the computation verified', () => {
    const s = structuredClone(seed);
    const r = s.routes.features[0]!.properties;
    r.status = 'active';
    r.computation = { method: 'road_graph', verified: true, distanceM: 2400, segmentCount: 56, speedMps: 1.3, windowMin: 45 };
    wrap(<RoutesSectionView snapshot={s} />);
    const card = screen.getByTestId(`route-row-${r.routeId}`);
    expect(card.getAttribute('data-route-state')).toBe('calculated');
    expect(card.textContent).toContain('Route calculated');
    expect(card.textContent).toContain('calculated on the road network');
    expect(card.textContent).not.toContain('indicative, source unconfirmed');
    expect(settlementRows(s).find((row) => row.id === r.from)?.statusLabel).toBe('Route calculated');
  });
  it('keeps unverified active routes labelled "not verified"', () => {
    const s = structuredClone(seed);
    const r = s.routes.features[0]!.properties;
    r.status = 'active';
    r.computation = { method: 'road_graph', verified: false };
    wrap(<RoutesSectionView snapshot={s} />);
    const card = screen.getByTestId(`route-row-${r.routeId}`);
    expect(card.getAttribute('data-route-state')).toBe('not-verified');
    expect(card.textContent).toContain('Route not verified');
    expect(card.textContent).toContain('indicative, source unconfirmed');
  });
  it('all routes unavailable -> No safe route; no routes -> No route data (not "no safe route")', () => {
    const s = cutOff();
    const id = s.settlements.features[0]!.properties.settlementId;
    wrap(<RoutesSectionView snapshot={s} />);
    expect(screen.getByTestId(`no-safe-route-${id}`).getAttribute('data-route-state')).toBe('no-safe-route');
    cleanup();
    const n = structuredClone(cutOff());
    n.routes.features = n.routes.features.filter((f) => f.properties.from !== id);
    wrap(<RoutesSectionView snapshot={n} />);
    expect(screen.queryByTestId(`no-safe-route-${id}`)).toBeNull();
    expect(screen.getByTestId(`no-route-data-${id}`).textContent).toContain('No route data');
    expect(settlementRows(n).find((r) => r.id === id)!.routeState).toBe('no-route-data');
  });
});

describe('routes section', () => {
  it('lists status, eta, refusal and filters by origin/destination', () => {
    const s = structuredClone(seed);
    const r = s.routes.features[0]!.properties;
    r.status = 'unavailable';
    r.refusal = { summary: 'Bridge impassable', blockingFeatureIds: [] };
    wrap(<RoutesSectionView snapshot={s} />);
    const card = screen.getByTestId(`route-row-${r.routeId}`);
    // An unavailable route has no ETA: the backend sends etaMin 0, which would read as 'arrives instantly'.
    expect(card.textContent).toContain('No ETA (route unavailable)');
    expect(card.textContent).not.toContain(`${r.etaMin} min`);
    expect(card.getAttribute('data-route-state')).toBe('refused');
    expect(within(card).getByTestId(`explain-refusal-${r.routeId}`).textContent).toContain('Bridge impassable');
    fireEvent.change(screen.getByTestId('routes-filter-origin'), { target: { value: r.from } });
    for (const c of screen.getAllByTestId(/^route-row-/)) expect(c.textContent).toBeTruthy();
    expect(screen.queryAllByTestId(/^route-row-/).length).toBe(s.routes.features.filter((f) => f.properties.from === r.from).length);
    const other = s.shelters.features.map((f) => f.properties.shelterId).find((id) => id !== r.to)!;
    fireEvent.change(screen.getByTestId('routes-filter-destination'), { target: { value: other } });
    expect(screen.queryAllByTestId(/^route-row-/).length).toBe(s.routes.features.filter((f) => f.properties.from === r.from && f.properties.to === other).length);
  });
  it('shows alternative / replaces links', () => {
    const s = structuredClone(seed);
    const [a, b] = s.routes.features.map((f) => f.properties);
    a!.status = 'unavailable';
    b!.status = 'recalculated';
    b!.replacesRouteId = a!.routeId;
    wrap(<RoutesSectionView snapshot={s} />);
    expect(screen.getByTestId(`route-replaces-${b!.routeId}`).textContent).toContain(a!.routeId);
    expect(screen.getByTestId(`route-alternative-${a!.routeId}`).textContent).toContain(b!.routeId);
  });
  it('renders the explicit "No safe route" state when every route is unavailable', () => {
    const s = cutOff();
    const id = s.settlements.features[0]!.properties.settlementId;
    wrap(<RoutesSectionView snapshot={s} />);
    expect(screen.getByTestId(`no-safe-route-${id}`).textContent).toContain('No safe route');
  });
  it('does not show it when a route is usable', () => {
    wrap(<RoutesSectionView snapshot={seed} />);
    expect(screen.queryAllByTestId(/^no-safe-route-/).length).toBe(
      seed.settlements.features.filter((f) => f.properties.accessibility === 'cut_off').length,
    );
  });
});

describe('panels: not-provided states', () => {
  it('road panel shows #15 placeholders and original observation', () => {
    const s = structuredClone(seed);
    const road = s.roads.features[0]!.properties;
    road.sourceEventIds = ['c-9'];
    wrap(<FeaturePanelView snapshot={s} />, { kind: 'road', id: road.roadId });
    expect(screen.getByTestId('not-provided-travel-time').textContent).toBe('Not provided by backend (#15)');
    expect(screen.getByTestId('not-provided-depth')).toBeTruthy();
    expect(screen.getByTestId('not-provided-validity')).toBeTruthy();
    expect(screen.getAllByTestId('source-event-link')[0]!.getAttribute('data-client-event-id')).toBe('c-9');
  });
  it('settlement panel shows why cut off, deadline and #15 placeholders', () => {
    const s = cutOff();
    const id = s.settlements.features[0]!.properties.settlementId;
    wrap(<FeaturePanelView snapshot={s} />, { kind: 'settlement', id });
    expect(screen.getByTestId(`explain-cutoff-${id}`).textContent).toContain('Bridge submerged');
    expect(screen.getByTestId('not-provided-latest-departure').textContent).toBe('Not provided (#15)');
    expect(screen.getByTestId('not-provided-first-failing-segment')).toBeTruthy();
  });
  it('flood panel carries the synthetic note and DEM caveat', () => {
    const flood = seed.flood.features[0]!.properties;
    wrap(<FeaturePanelView snapshot={seed} />, { kind: 'flood', id: flood.areaId });
    expect(screen.getByTestId('flood-caveat').textContent).toBe('DEM-threshold approximation — not a validated hydraulic simulation');
    expect(screen.getByTestId('flood-synthetic-note').textContent).toContain('SYNTHETIC');
  });
});
