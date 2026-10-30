// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { EventRecord, ProjectionSnapshot } from '@setu/contract';
import { createApiClientWithMock } from '@setu/mock-backend';
import { SelectionProvider, useSelection, type Selection } from '../app';
import {
  EvacDeadlinesView, FeaturePanelView, ProvenanceView, RoadListView, RouteListView, SettlementListView, evacDeadlines, joinProvenance,
} from './index';

let seed: ProjectionSnapshot;
beforeAll(async () => {
  seed = await createApiClientWithMock().getProjections();
});
afterEach(cleanup);

const NOW = new Date('2026-10-30T12:00:00Z');

function afterB1(): ProjectionSnapshot {
  const s = structuredClone(seed);
  const b1 = structuredClone(s.roads.features[0]!);
  b1.id = 'B1';
  b1.properties = {
    ...b1.properties, roadId: 'B1', name: 'Bharalu Bridge', status: 'blocked', kind: 'bridge', passability: 'impassable',
    reason: 'Submerged by floodwater', sourceEventIds: ['c-1'],
  };
  s.roads.features.push(b1);
  const s4 = s.settlements.features.find((f) => f.properties.settlementId === 'S4')!.properties;
  s4.accessibility = 'cut_off';
  s4.cutOffReason = { summary: 'Bharalu Bridge is submerged; the only road out is gone.', blockingFeatureIds: ['B1'], sourceEventIds: ['c-1'] };
  s4.evacuationDeadline = '2026-10-30T18:00:00Z';
  s4.evacuationPriority = 'critical';
  const s2 = s.settlements.features.find((f) => f.properties.settlementId === 'S2')!.properties;
  s2.evacuationDeadline = '2026-10-30T20:00:00Z';
  const evac3 = s.routes.features.find((f) => f.properties.routeId === 'EVAC-3')!.properties;
  evac3.status = 'unavailable';
  evac3.refusal = { summary: 'B1 is impassable.', blockingFeatureIds: ['B1'] };
  return s;
}

function Probe() {
  const { selected } = useSelection();
  return <output data-testid="probe">{selected ? `${selected.kind}:${selected.id}` : ''}</output>;
}
const wrap = (ui: React.ReactNode, initial?: Selection) => render(<SelectionProvider initial={initial}>{ui}<Probe /></SelectionProvider>);

describe('road rows', () => {
  it('expose kind/passability/reason and list blocked bridges first', () => {
    const s = afterB1();
    s.roads.features.find((f) => f.properties.roadId === 'R1')!.properties.status = 'blocked';
    wrap(<RoadListView snapshot={s} />);
    const rows = screen.getAllByTestId(/^road-row-/);
    expect(rows[0]!.getAttribute('data-testid')).toBe('road-row-B1');
    expect(rows[0]!.getAttribute('data-kind')).toBe('bridge');
    expect(rows[0]!.getAttribute('data-passability')).toBe('impassable');
    expect(rows[0]!.textContent).toContain('Submerged by floodwater');
    expect(screen.getByTestId('road-row-R2').getAttribute('data-kind')).toBe('road');
    expect(screen.getByTestId('road-row-R2').hasAttribute('data-passability')).toBe(false);
  });
});

describe('explanations', () => {
  it('cut-off and refusal blocks render with links that select the blocking feature', () => {
    const s = afterB1();
    wrap(<><SettlementListView snapshot={s} /><RouteListView snapshot={s} /></>);
    const cut = screen.getByTestId('explain-cutoff-S4');
    expect(cut.textContent).toContain('only road out is gone');
    fireEvent.click(within(cut).getByTestId('blocking-link-B1'));
    expect(screen.getByTestId('probe').textContent).toBe('road:B1');
    const ref = screen.getByTestId('explain-refusal-EVAC-3');
    expect(ref.textContent).toContain('B1 is impassable');
    expect(within(cut).getByTestId('source-event-link').getAttribute('href')).toBe('#incident-c-1');
  });

  it('degrades gracefully when the optional fields are absent', () => {
    wrap(<><SettlementListView snapshot={seed} /><RouteListView snapshot={seed} /></>);
    expect(screen.queryByTestId(/^explain-/)).toBeNull();
  });

  it('feature panel shows the same blocks', () => {
    wrap(<FeaturePanelView snapshot={afterB1()} />, { kind: 'settlement', id: 'S4' });
    expect(screen.getByTestId('explain-cutoff-S4')).toBeTruthy();
  });
});

describe('evac deadlines', () => {
  it('sorts soonest first and shows priority and time left', () => {
    const s = afterB1();
    expect(evacDeadlines(s).map((p) => p.settlementId)).toEqual(['S4', 'S2']);
    wrap(<EvacDeadlinesView snapshot={s} now={NOW} />);
    const ids = screen.getAllByTestId(/^deadline-/).map((e) => e.getAttribute('data-testid'));
    expect(ids).toEqual(['deadline-S4', 'deadline-S2']);
    expect(screen.getByTestId('deadline-S4').textContent).toContain('6 h 0 min left');
    expect(screen.getByTestId('priority-S4').textContent).toContain('critical');
  });

  it('shows an empty state without deadlines', () => {
    wrap(<EvacDeadlinesView snapshot={seed} />);
    expect(screen.queryByTestId(/^deadline-/)).toBeNull();
  });
});

describe('provenance', () => {
  const rec = (applied: number | undefined, state: EventRecord['serverState'] = 'applied'): EventRecord => ({
    eventId: 'e1', receivedAt: '2026-10-30T10:00:00Z', serverState: state, ...(applied !== undefined ? { appliedAtVersion: applied } : {}),
    event: {
      type: 'road_blockage', clientEventId: 'c-1', occurredAt: '2026-10-30T09:48:00Z', reporterId: 'vol-7', deviceId: 'dev-3',
      location: { lat: 26.1, lng: 91.7 }, roadId: 'B1', blockage: 'full', cause: 'submerged',
    },
  } as EventRecord);

  it('joins ids with records; synced only when version confirmed', () => {
    expect(joinProvenance(['c-1'], [rec(5)], {}, 5)[0]!.status).toBe('synced');
    expect(joinProvenance(['c-1'], [rec(6)], {}, 5)[0]!.status).toBe('accepted');
    expect(joinProvenance(['c-1'], [rec(undefined, 'accepted')], {}, 9)[0]!.status).toBe('accepted');
    expect(joinProvenance(['zz'], [rec(5)], {}, 5)[0]).toEqual({ sourceId: 'zz', status: 'accepted' });
  });

  it('renders type, reporter, device and status badge', () => {
    wrap(<ProvenanceView featureId="B1" items={joinProvenance(['c-1', 'zz'], [rec(5)], {}, 5)} />);
    const p = screen.getByTestId('provenance-B1');
    expect(p.textContent).toContain('Road blockage');
    expect(p.textContent).toContain('vol-7');
    expect(p.textContent).toContain('dev-3');
    expect(within(p).getByRole('status').getAttribute('data-status')).toBe('synced');
    expect(p.textContent).toContain('details not loaded');
  });
});
