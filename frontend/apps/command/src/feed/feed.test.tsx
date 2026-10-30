// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';
import type { ApiClient, EventRecord, ProjectionSnapshot } from '@setu/contract';
import { ApiProvider } from '../data';
import { SelectionProvider, useSelection } from '../app';
import { IncidentFeed } from './IncidentFeed';
import { diffSnapshots } from './diff';
import { feedStatus } from './status';

afterEach(cleanup);

const gen = '2026-01-01T00:00:00+00:00';
const fc = <G, P>(features: { id: string; geometry: G; properties: P }[]) =>
  ({ type: 'FeatureCollection', version: 1, generatedAt: gen, features: features.map((f) => ({ type: 'Feature', ...f })) });
const pt = { type: 'Point', coordinates: [91.7, 26.1] };
const ln = { type: 'LineString', coordinates: [[91.7, 26.1], [91.8, 26.2]] };

function snap(version: number, o: { r7: string; s3: string; evac2: string; evac2b?: boolean }): ProjectionSnapshot {
  return {
    version,
    generatedAt: gen,
    flood: fc([]),
    roads: fc([{ id: 'R7', geometry: ln, properties: { roadId: 'R7', name: 'R7', status: o.r7, updatedAt: gen, sourceEventIds: [] } }]),
    settlements: fc([{ id: 'S3', geometry: pt, properties: { settlementId: 'S3', name: 'S3', population: 1, accessibility: o.s3, households: 1, needs: [] } }]),
    routes: fc([
      { id: 'EVAC-2', geometry: ln, properties: { routeId: 'EVAC-2', from: 'a', to: 'b', kind: 'evacuation', status: o.evac2, etaMin: 5 } },
      ...(o.evac2b ? [{ id: 'EVAC-2b', geometry: ln, properties: { routeId: 'EVAC-2b', from: 'a', to: 'b', kind: 'evacuation', status: 'recalculated', etaMin: 9, replacesRouteId: 'EVAC-2' } }] : []),
    ]),
    shelters: fc([]),
  } as unknown as ProjectionSnapshot;
}

const ev = (id: string, serverState: EventRecord['serverState'], appliedAtVersion?: number, receivedAt = gen): EventRecord => ({
  eventId: `e-${id}`,
  serverState,
  appliedAtVersion,
  receivedAt,
  event: {
    type: 'road_blockage', clientEventId: id, occurredAt: gen, reporterId: 'r', deviceId: 'd',
    location: { lat: 26.1, lng: 91.7 }, roadId: 'R7', blockage: 'full',
  },
});

describe('feedStatus', () => {
  it('never reports synced without server confirmation', () => {
    expect(feedStatus(ev('a', 'accepted'), 10)).toBe('accepted');
    expect(feedStatus(ev('a', 'applied'), 10)).toBe('accepted'); // no appliedAtVersion
    expect(feedStatus(ev('a', 'applied', 5), undefined)).toBe('accepted'); // no snapshot yet
    expect(feedStatus(ev('a', 'applied', 5), 4)).toBe('accepted'); // projection hasn't caught up
    expect(feedStatus(ev('a', 'applied', 5), 5)).toBe('synced');
    expect(feedStatus(ev('a', 'conflict'), 9)).toBe('conflict');
    expect(feedStatus(ev('a', 'rejected'), 9)).toBe('rejected');
  });
});

describe('diffSnapshots', () => {
  it('reports server-side changes only', () => {
    const a = snap(1, { r7: 'open', s3: 'accessible', evac2: 'active' });
    const b = snap(2, { r7: 'blocked', s3: 'cut_off', evac2: 'unavailable', evac2b: true });
    expect(diffSnapshots(a, b).map((c) => c.text)).toEqual([
      'R7 → blocked',
      'S3 → cut_off',
      'EVAC-2 → unavailable',
      'EVAC-2b recalculated',
    ]);
    expect(diffSnapshots(b, b)).toEqual([]);
  });
});

function stub(events: EventRecord[], version: number): ApiClient {
  return {
    submitEvents: async () => [],
    getEventStatus: async () => [],
    getProjections: async () => snap(version, { r7: 'blocked', s3: 'cut_off', evac2: 'unavailable' }),
    listEvents: async () => events,
    subscribe: () => () => {},
  } as unknown as ApiClient;
}

function Sel() {
  const { selected } = useSelection();
  return <div data-testid="sel">{selected ? `${selected.kind}:${selected.id}` : ''}</div>;
}

describe('IncidentFeed', () => {
  it('orders newest first, maps status and links to features', async () => {
    const events = [
      ev('old', 'applied', 2, '2026-01-01T00:00:00+00:00'),
      ev('new', 'applied', 99, '2026-01-01T00:05:00+00:00'),
      ev('bad', 'conflict', undefined, '2026-01-01T00:02:00+00:00'),
    ];
    render(
      <ApiProvider client={stub(events, 3)}>
        <SelectionProvider>
          <IncidentFeed />
          <Sel />
        </SelectionProvider>
      </ApiProvider>,
    );
    const items = await screen.findAllByTestId('incident-item');
    await screen.findAllByRole('status');
    expect(items.map((i) => i.getAttribute('data-client-event-id'))).toEqual(['new', 'bad', 'old']);
    // wait for projections so the version is known
    await new Promise((r) => setTimeout(r, 50));
    const by = (id: string) => screen.getAllByTestId('incident-item').find((i) => i.getAttribute('data-client-event-id') === id)!;
    expect(by('old').getAttribute('data-status')).toBe('synced');
    expect(by('new').getAttribute('data-status')).toBe('accepted'); // applied at v99, snapshot is v3
    expect(by('bad').getAttribute('data-status')).toBe('conflict');
    fireEvent.click(screen.getAllByTestId('incident-link-road-R7')[0]!);
    expect(screen.getByTestId('sel').textContent).toBe('road:R7');
  });
});
