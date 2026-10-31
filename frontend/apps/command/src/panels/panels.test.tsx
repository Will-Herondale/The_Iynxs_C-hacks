// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { PeopleSnapshot, ProjectionSnapshot } from '@setu/contract';
import { fixtureSnapshot } from '../testing/fixture';
import { SelectionProvider, useSelection, type Selection } from '../app';
import { FeaturePanelView, RoadListView, RouteListView, SettlementListView, ShelterListView } from './index';

let seed: ProjectionSnapshot;
beforeAll(async () => {
  seed = fixtureSnapshot();
});
afterEach(cleanup);

/** Fixture shaped like the server snapshot after R7 full (scripted scenario). */
function afterR7(): ProjectionSnapshot {
  const s = structuredClone(seed);
  s.roads.features.find((f) => f.properties.roadId === 'R7')!.properties.status = 'blocked';
  s.settlements.features.find((f) => f.properties.settlementId === 'S3')!.properties.accessibility = 'cut_off';
  const evac2 = s.routes.features.find((f) => f.properties.routeId === 'EVAC-2')!;
  evac2.properties.status = 'unavailable';
  s.routes.features.push({
    ...evac2, id: 'EVAC-2b',
    properties: { ...evac2.properties, routeId: 'EVAC-2b', status: 'recalculated', etaMin: 31, replacesRouteId: 'EVAC-2' },
  });
  return s;
}

function Probe() {
  const { selected } = useSelection();
  return <output data-testid="probe">{selected ? `${selected.kind}:${selected.id}` : ''}</output>;
}
const wrap = (ui: React.ReactNode, initial?: Selection) => render(<SelectionProvider initial={initial}>{ui}<Probe /></SelectionProvider>);

describe('lists', () => {
  it('sort blocked/cut_off first and expose status attributes', () => {
    wrap(<><RoadListView snapshot={afterR7()} /><SettlementListView snapshot={afterR7()} /><RouteListView snapshot={afterR7()} /><ShelterListView snapshot={afterR7()} /></>);
    expect(screen.getByTestId('road-row-R7').getAttribute('data-status')).toBe('blocked');
    expect(screen.getAllByTestId(/^road-row-/)[0]!.getAttribute('data-testid')).toBe('road-row-R7');
    expect(screen.getByTestId('settlement-row-S3').getAttribute('data-accessibility')).toBe('cut_off');
    expect(screen.getAllByTestId(/^settlement-row-/)[0]!.getAttribute('data-accessibility')).toBe('cut_off');
    expect(screen.getByTestId('route-row-EVAC-2').getAttribute('data-status')).toBe('unavailable');
    expect(screen.getByTestId('route-row-EVAC-2b').getAttribute('data-status')).toBe('recalculated');
    expect(screen.getByTestId('route-row-EVAC-2b').textContent).toContain('replaces EVAC-2');
    expect(screen.getAllByTestId(/^shelter-row-/).length).toBe(seed.shelters.features.length);
  });

  it('clicking a row selects the feature', () => {
    wrap(<><RoadListView snapshot={afterR7()} /><ShelterListView snapshot={afterR7()} /></>);
    fireEvent.click(screen.getByTestId('road-row-R7'));
    expect(screen.getByTestId('probe').textContent).toBe('road:R7');
    fireEvent.click(screen.getByTestId('shelter-row-SH2'));
    expect(screen.getByTestId('probe').textContent).toBe('shelter:SH2');
  });
});

describe('FeaturePanel', () => {
  it('road: all props and source event links', () => {
    const s = afterR7();
    s.roads.features.find((f) => f.properties.roadId === 'R7')!.properties.sourceEventIds = ['evt-1'];
    wrap(<FeaturePanelView snapshot={s} />, { kind: 'road', id: 'R7' });
    const p = screen.getByTestId('feature-panel');
    expect(p.getAttribute('data-feature-kind')).toBe('road');
    expect(p.getAttribute('data-feature-id')).toBe('R7');
    expect(p.textContent).toContain('blocked');
    const link = within(p).getByTestId('source-event-link');
    expect(link.getAttribute('href')).toBe('#incident-evt-1');
  });

  it('settlement: households, needs, accessibility, serving routes and shelters', () => {
    wrap(<FeaturePanelView snapshot={afterR7()} />, { kind: 'settlement', id: 'S3' });
    const p = screen.getByTestId('feature-panel');
    expect(p.textContent).toContain('cut off');
    expect(p.textContent).toContain('households');
    expect(within(p).getByTestId('link-route-EVAC-2')).toBeTruthy();
    expect(within(p).getByTestId('link-shelter-SH2')).toBeTruthy();
    fireEvent.click(within(p).getByTestId('link-route-EVAC-2'));
    expect(screen.getByTestId('probe').textContent).toBe('route:EVAC-2');
  });

  it('route: from/to, eta, status, replaces', () => {
    wrap(<FeaturePanelView snapshot={afterR7()} />, { kind: 'route', id: 'EVAC-2b' });
    const p = screen.getByTestId('feature-panel');
    expect(p.textContent).toContain('S3');
    expect(p.textContent).toContain('SH2');
    expect(p.getAttribute('data-route-state')).toBe('not-verified');
    expect(p.textContent).toContain('Route not verified');
    expect(p.textContent).toContain('31 min');
    expect(p.textContent).toContain('indicative, source unconfirmed');
    expect(p.textContent).toContain('recalculated');
    expect(p.textContent).toContain('replaces EVAC-2');
  });

  it('shelter: pre-identified (open:false, 0/0) is neutral, never closed or 0/0', () => {
    const s = afterR7();
    Object.assign(s.shelters.features[0]!.properties, { open: false, capacity: 0, occupancy: 0 });
    const id = s.shelters.features[0]!.properties.shelterId;
    wrap(<FeaturePanelView snapshot={s} />, { kind: 'shelter', id });
    const p = screen.getByTestId('feature-panel');
    expect(p.getAttribute('data-shelter-status')).toBe('pre-identified');
    expect(p.textContent).toContain('Pre-identified · not confirmed');
    expect(p.textContent).toContain('not published');
    expect(p.textContent).not.toContain('closed');
    expect(p.textContent).not.toMatch(/0 \/ 0/);
    expect(p.querySelector('[data-class="SYNTHETIC"]')).toBeTruthy();
  });

  it('shelter: only open===true shows Open (reported)', () => {
    const s = afterR7();
    Object.assign(s.shelters.features[0]!.properties, { open: true, capacity: 100, occupancy: 5 });
    wrap(<FeaturePanelView snapshot={s} />, { kind: 'shelter', id: s.shelters.features[0]!.properties.shelterId });
    const p = screen.getByTestId('feature-panel');
    expect(p.getAttribute('data-shelter-status')).toBe('open-reported');
    expect(p.textContent).toContain('Open (reported)');
  });

  it('shows server-backed field counts separately from shelter occupancy', () => {
    const s = afterR7();
    const shelterId = s.shelters.features[0]!.properties.shelterId;
    const people: PeopleSnapshot = {
      version: 1,
      generatedAt: '2026-10-30T10:00:00.000Z',
      totals: { checkins: 1, individuals: 0, households: 1, campsWithCheckins: 1 },
      autoMergedCount: 0,
      camps: [{ campId: shelterId, name: 'Camp', open: true, capacity: 100, occupancy: 20, checkins: 1, households: 1, people: 4, needs: { water: 1 }, lastCheckinAt: '2026-10-30T10:00:00.000Z' }],
      checkins: [],
      duplicateSuggestions: [],
    };
    wrap(<FeaturePanelView snapshot={s} people={people} />, { kind: 'shelter', id: shelterId });
    const p = screen.getByTestId('feature-panel');
    expect(p.textContent).toContain('shelter-reported occupancy');
    expect(p.textContent).toContain('field households');
    expect(p.textContent).toContain('field people');
    expect(p.textContent).toContain('4');
  });

  it('flood area: depth and severity', () => {
    const f = seed.flood.features[0]!.properties;
    wrap(<FeaturePanelView snapshot={seed} />, { kind: 'flood', id: f.areaId });
    const p = screen.getByTestId('feature-panel');
    expect(p.getAttribute('data-feature-kind')).toBe('flood');
    expect(p.textContent).toContain(`${f.severity} / 5`);
    expect(p.textContent).toContain('depthCm');
  });

  it('shows an empty state with no selection', () => {
    wrap(<FeaturePanelView snapshot={seed} />);
    expect(screen.queryByTestId('feature-panel')).toBeNull();
    expect(screen.getByTestId('feature-panel-empty')).toBeTruthy();
  });
});

describe('synthetic features (properties.synthetic from the backend)', () => {
  it('tags flagged settlement, route and shelter rows as SYNTHETIC and leaves real ones untagged', () => {
    const s = structuredClone(seed);
    s.settlements.features[0]!.properties.synthetic = true;
    s.routes.features[0]!.properties.synthetic = true;
    s.shelters.features[0]!.properties.synthetic = true;
    const sId = s.settlements.features[0]!.properties.settlementId;
    const rId = s.routes.features[0]!.properties.routeId;
    const hId = s.shelters.features[0]!.properties.shelterId;
    wrap(<><SettlementListView snapshot={s} /><RouteListView snapshot={s} /><ShelterListView snapshot={s} /></>);
    for (const id of [`settlement-row-${sId}`, `route-row-${rId}`, `shelter-row-${hId}`]) {
      const row = screen.getByTestId(id);
      expect(row.getAttribute('data-class')).toBe('synthetic');
      expect(within(row).getByTestId('data-class-tag').textContent).toContain('SYNTHETIC');
    }
    const other = s.settlements.features[1]!.properties.settlementId;
    expect(screen.getByTestId(`settlement-row-${other}`).getAttribute('data-class')).toBeNull();
  });
});
