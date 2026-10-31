// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ApiClient, EventRecord, ProjectionSnapshot } from '@setu/contract';
import { ApiProvider } from '../data';
import { SelectionProvider } from '../app';
import { AuditView } from './AuditView';
import { EventsFeed } from '../sections/events';
import { recordSnapshot, resetSnapshotHistory } from '../feed/history';
import { resultingChanges } from './changes';
import { affectedIndex, auditStatus, buildAuditRows, delayLabel, featuresAffectedBy } from './model';

afterEach(cleanup);

const gen = '2026-01-01T00:00:00+00:00';
const fc = (features: { id: string; geometry: unknown; properties: unknown }[]) => ({
  type: 'FeatureCollection', version: 1, generatedAt: gen, features: features.map((f) => ({ type: 'Feature', ...f })),
});
const pt = { type: 'Point', coordinates: [91.7, 26.1] };
const ln = { type: 'LineString', coordinates: [[91.7, 26.1], [91.8, 26.2]] };

const snap = (version = 5): ProjectionSnapshot =>
  ({
    version, generatedAt: gen, flood: fc([]),
    roads: fc([{ id: 'B1', geometry: ln, properties: { roadId: 'B1', name: 'Bharalu', status: 'blocked', updatedAt: gen, sourceEventIds: ['e-b1'] } }]),
    settlements: fc([{ id: 'S4', geometry: pt, properties: { settlementId: 'S4', name: 'Kalapahar', population: 1, accessibility: 'cut_off', households: 1, needs: [], cutOffReason: { summary: 'x', blockingFeatureIds: ['B1'], sourceEventIds: ['c-b1'] } } }]),
    routes: fc([{ id: 'EVAC-3', geometry: ln, properties: { routeId: 'EVAC-3', from: 'a', to: 'b', kind: 'evacuation', status: 'unavailable', etaMin: 1, refusal: { summary: 'y', blockingFeatureIds: ['B1'], sourceEventIds: ['e-b1'] } } }]),
    shelters: fc([]),
  }) as unknown as ProjectionSnapshot;

const rec = (id: string, over: Partial<EventRecord> = {}, occurredAt = '2026-01-01T00:00:00+00:00'): EventRecord => ({
  eventId: `e-${id}`,
  serverState: 'applied',
  appliedAtVersion: 5,
  receivedAt: '2026-01-01T00:12:00+00:00',
  event: {
    type: 'road_blockage', clientEventId: `c-${id}`, occurredAt, reporterId: 'vol-1', deviceId: 'dev-1',
    location: { lat: 26.1, lng: 91.7 }, roadId: 'B1', blockage: 'full', cause: 'submerged',
  },
  ...over,
}) as EventRecord;

describe('audit status mapping', () => {
  it('maps strictly', () => {
    expect(auditStatus(rec('a'), 5)).toBe('synced');
    expect(auditStatus(rec('a'), 4)).toBe('accepted'); // applied but version not reached
    expect(auditStatus(rec('a', { appliedAtVersion: undefined }), 9)).toBe('accepted');
    expect(auditStatus(rec('a', { serverState: 'accepted' }), 9)).toBe('accepted');
    expect(auditStatus(rec('a', { serverState: 'conflict' }), 9)).toBe('conflict');
    expect(auditStatus(rec('a', { serverState: 'rejected' }), 9)).toBe('rejected');
  });
});

describe('reverse lookup', () => {
  it('finds features by eventId or clientEventId', () => {
    const idx = affectedIndex(snap());
    expect(featuresAffectedBy(rec('b1'), idx)).toEqual([
      { kind: 'road', id: 'B1' },
      { kind: 'route', id: 'EVAC-3' },
      { kind: 'settlement', id: 'S4' },
    ]);
    expect(featuresAffectedBy(rec('zzz'), idx)).toEqual([]);
    expect(affectedIndex(undefined).size).toBe(0);
  });
});

describe('rows', () => {
  it('sorts newest first and filters', () => {
    const a = rec('a', { receivedAt: '2026-01-01T01:00:00+00:00' });
    const b = rec('b', { receivedAt: '2026-01-01T02:00:00+00:00', serverState: 'rejected' });
    expect(buildAuditRows([a, b], snap()).map((r) => r.rec.eventId)).toEqual(['e-b', 'e-a']);
    expect(buildAuditRows([a, b], snap(), { status: 'rejected' }).map((r) => r.rec.eventId)).toEqual(['e-b']);
    expect(buildAuditRows([a, b], snap(), { type: 'flood_report' })).toEqual([]);
  });
  it('describes offline delay', () => {
    expect(delayLabel(rec('a'))).toBe('reported offline, arrived 12 min later');
    expect(delayLabel(rec('a', { receivedAt: '2026-01-01T00:00:10+00:00' }))).toBe('sent right away');
  });
});

function client(events: EventRecord[]): ApiClient {
  return {
    submitEvents: async () => [],
    getEventStatus: async () => [],
    getProjections: async () => snap(),
    listEvents: async () => events,
    subscribe: () => () => {},
  };
}

describe('AuditView', () => {
  it('renders rows with attributes and switches to map on feature click', async () => {
    const onShow = vi.fn();
    render(
      <ApiProvider client={client([rec('b1')])}>
        <SelectionProvider>
          <AuditView onShowFeature={onShow} />
        </SelectionProvider>
      </ApiProvider>,
    );
    const row = await screen.findByTestId('audit-row');
    expect(row.dataset.eventId).toBe('e-b1');
    expect(row.dataset.clientEventId).toBe('c-b1');
    expect(row.dataset.status).toBe('synced');
    fireEvent.click(await within(row).findByTestId('audit-feature-settlement-S4'));
    expect(onShow).toHaveBeenCalledWith({ kind: 'settlement', id: 'S4' });
  });
});

describe('filters', () => {
  const a = rec('a', { receivedAt: '2026-01-01T01:00:00+00:00' });
  const h = {
    ...rec('h', { receivedAt: '2026-01-01T03:00:00+00:00' }),
    event: { type: 'household_registration', clientEventId: 'c-h', occurredAt: '2026-01-01T02:59:00+00:00', reporterId: 'v', deviceId: 'd', location: { lat: 26.1, lng: 91.7 }, householdId: '5b6f3a42-8c4e-4d8e-9a43-0d8b1d1a9a11', headName: 'X', members: 2, vulnerable: { elderly: false, children: false, disabled: false, medical: false }, settlementId: 'AUNIATI', needs: [] },
  } as unknown as EventRecord;
  it('filters by location (payload or affected) and time range', () => {
    expect(buildAuditRows([a, h], snap(), { location: 'auni' }).map((r) => r.rec.eventId)).toEqual(['e-h']);
    expect(buildAuditRows([a, h], snap(), { location: 's4' }).map((r) => r.rec.eventId)).toEqual([]);
    expect(buildAuditRows([a, h], snap(), { location: 'b1' }).map((r) => r.rec.eventId)).toEqual(['e-a']);
    expect(buildAuditRows([a, h], snap(), { from: '2026-01-01T02:00:00+00:00' }).map((r) => r.rec.eventId)).toEqual(['e-h']);
    expect(buildAuditRows([a, h], snap(), { to: '2026-01-01T02:00:00+00:00' }).map((r) => r.rec.eventId)).toEqual(['e-a']);
  });
});

describe('resultingChanges', () => {
  it('diffs held snapshots around appliedAtVersion; null when not observed', () => {
    resetSnapshotHistory();
    expect(resultingChanges(rec('b1'), snap(5)).diff).toBeNull();
    const before = snap(4);
    (before.roads.features[0] as { properties: { status: string } }).properties.status = 'open';
    recordSnapshot(before);
    recordSnapshot(snap(5));
    const r = resultingChanges(rec('b1'), snap(5));
    expect(r.diff?.map((c) => c.text)).toEqual(['B1 → blocked']);
    expect(r.affected.map((f) => f.id)).toContain('B1');
    expect(resultingChanges(rec('b1', { serverState: 'accepted' }), snap(5)).diff).toBeNull();
  });
});

describe('EventsFeed', () => {
  it('windows long histories and opens the drawer with payload', () => {
    const many = Array.from({ length: 500 }, (_, i) =>
      rec(`n${i}`, { receivedAt: new Date(Date.UTC(2026, 0, 1) + i * 60_000).toISOString() }),
    );
    render(
      <SelectionProvider>
        <EventsFeed events={many} snapshot={snap()} />
      </SelectionProvider>,
    );
    const items = screen.getAllByTestId('feed-item');
    expect(items.length).toBeLessThan(40);
    expect(items[0]?.dataset.eventId).toBe('e-n499');
    fireEvent.click(screen.getByTestId('feed-open-e-n499'));
    expect(screen.getByTestId('event-payload').textContent).toContain('"clientEventId": "c-n499"');
    expect(screen.getByTestId('event-changes')).toBeTruthy();
    fireEvent.click(screen.getByTestId('event-drawer-close'));
    expect(screen.queryByTestId('event-drawer')).toBeNull();
  });
});
