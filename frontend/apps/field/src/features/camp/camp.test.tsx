// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FieldEvent, PeopleSnapshot, ProjectionSnapshot } from '@setu/contract';
import type { QueueItem } from '../../sync/index.js';

const state = vi.hoisted(() => ({ items: [] as unknown[] }));
const enqueue = vi.hoisted(() => vi.fn(async (e: FieldEvent) => e));

vi.mock('../../sync/index.js', () => ({
  enqueue,
  replace: vi.fn(),
  useQueue: () => state.items as QueueItem[],
  useSyncState: () => ({ online: true, syncing: false, pendingCount: 0 }),
}));

import { CampView, CAMP_KEY } from './CampView.js';

const shelter = (id: string, name: string, capacity: number, occupancy: number, open: boolean) => ({
  type: 'Feature' as const,
  geometry: { type: 'Point' as const, coordinates: [91.7, 26.1] as [number, number] },
  properties: { shelterId: id, name, capacity, occupancy, open },
});
const snapshot = {
  version: 3,
  generatedAt: '2026-10-30T10:00:00.000Z',
  settlements: { type: 'FeatureCollection', features: [] },
  shelters: { type: 'FeatureCollection', features: [shelter('SH1', 'School', 200, 120, true), shelter('SH2', 'Hall', 0, 0, false)] },
} as unknown as ProjectionSnapshot;

const row = (id: string, shelterId: string | undefined, status: string): QueueItem =>
  ({
    clientEventId: id, type: 'household_registration', status, attempts: 0, createdAt: 1, updatedAt: 1,
    event: { type: 'household_registration', headName: `Head ${id}`, members: 3, shelterId },
  }) as unknown as QueueItem;

const personRow = (id: string, campId: string | undefined, status: string): QueueItem =>
  ({
    clientEventId: id, type: 'person_checkin', status, attempts: 0, createdAt: 1, updatedAt: 1,
    event: { type: 'person_checkin', name: `Person ${id}`, ageBand: '18-59', campId },
  }) as unknown as QueueItem;

const remotePeople: PeopleSnapshot = {
  version: 4,
  generatedAt: '2026-10-30T10:00:00.000Z',
  totals: { checkins: 2, individuals: 1, households: 1, campsWithCheckins: 1 },
  autoMergedCount: 0,
  camps: [{ campId: 'SH1', name: 'School', open: true, capacity: 200, occupancy: 120, checkins: 2, households: 1, people: 4, needs: {}, lastCheckinAt: '2026-10-30T10:00:00.000Z' }],
  checkins: [
    { eventId: 'server-household', clientEventId: 'server-h', kind: 'household', personId: 'h1', mergedInto: null, displayName: 'Remote Family', campId: 'SH1', campName: 'School', settlementId: null, householdId: 'h1', members: 4, ageBand: '18-59', sex: 'u', needs: [], vulnerable: null, occurredAt: '2026-10-30T10:00:00.000Z', reporterId: 'other-device' },
  ],
  duplicateSuggestions: [],
};

const store = new Map<string, string>();
const storage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  clear: () => store.clear(),
};

beforeEach(() => { vi.stubGlobal('localStorage', storage); Object.defineProperty(window, 'localStorage', { value: storage, configurable: true }); store.clear(); state.items = []; enqueue.mockClear(); });
afterEach(cleanup);

describe('CampView', () => {
  it('lists shelters and shows info for the chosen one, remembered in localStorage', () => {
    render(<CampView snapshot={snapshot} cachedAt={Date.UTC(2026, 9, 30, 9)} online />);
    const select = screen.getByTestId('camp-select') as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['', '__none__', 'SH1', 'SH2']);
    fireEvent.change(select, { target: { value: 'SH1' } });
    const info = screen.getByTestId('camp-info');
    expect(info.getAttribute('data-shelter-id')).toBe('SH1');
    expect(info.textContent).toContain('Open (reported)');
    expect(info.getAttribute('data-shelter-status')).toBe('open-reported');
    expect(info.textContent).toContain('120 of 200');
    expect(info.textContent).not.toContain('Data as of');
    expect(window.localStorage.getItem(CAMP_KEY)).toBe('SH1');
  });

  it('shows open:false 0/0 as pre-identified, not closed, with no counts', () => {
    render(<CampView snapshot={snapshot} online />);
    fireEvent.change(screen.getByTestId('camp-select'), { target: { value: 'SH2' } });
    const info = screen.getByTestId('camp-info');
    expect(info.getAttribute('data-shelter-status')).toBe('pre-identified');
    expect(info.textContent).toContain('Pre-identified · not confirmed');
    expect(info.textContent).not.toContain('Closed');
    expect(screen.getByTestId('camp-capacity').textContent).toContain('not published');
    expect(info.textContent).not.toMatch(/50 of 50|0 of 0/);
  });

  it('restores the remembered camp and shows "data as of" and pre-identified offline', () => {
    window.localStorage.setItem(CAMP_KEY, 'SH2');
    render(<CampView snapshot={snapshot} cachedAt={Date.UTC(2026, 9, 30, 9)} online={false} />);
    const info = screen.getByTestId('camp-info');
    expect(info.getAttribute('data-shelter-id')).toBe('SH2');
    expect(info.textContent).toContain('Pre-identified · not confirmed');
    expect(info.textContent).toContain('Data as of');
  });

  it('degrades with no cached snapshot', () => {
    render(<CampView online={false} />);
    expect(screen.getByText(/No camp data on this device/)).toBeTruthy();
    expect(screen.queryByTestId('camp-info')).toBeNull();
    expect(screen.queryByTestId('camp-household-form')).toBeNull();
  });

  it('registers a household with the shelterId set', async () => {
    window.localStorage.setItem(CAMP_KEY, 'SH1');
    render(<CampView snapshot={snapshot} online />);
    fireEvent.change(screen.getByTestId('household-headName'), { target: { value: 'Asha' } });
    fireEvent.change(screen.getByTestId('field-lat'), { target: { value: '26.14' } });
    fireEvent.change(screen.getByTestId('field-lng'), { target: { value: '91.73' } });
    fireEvent.click(screen.getByTestId('household-submit'));
    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(enqueue.mock.calls[0]![0]).toMatchObject({ type: 'household_registration', headName: 'Asha', shelterId: 'SH1' });
  });

  it('checks in an individual person at the selected camp', async () => {
    window.localStorage.setItem(CAMP_KEY, 'SH1');
    render(<CampView snapshot={snapshot} online />);
    fireEvent.change(screen.getByTestId('person-name'), { target: { value: 'Anita Das' } });
    fireEvent.change(screen.getByTestId('person-ageBand'), { target: { value: '60+' } });
    fireEvent.change(screen.getByTestId('person-sex'), { target: { value: 'f' } });
    fireEvent.change(screen.getByTestId('person-lat'), { target: { value: '26.14' } });
    fireEvent.change(screen.getByTestId('person-lng'), { target: { value: '91.73' } });
    fireEvent.click(screen.getByTestId('person-submit'));
    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(enqueue.mock.calls[0]![0]).toMatchObject({
      type: 'person_checkin',
      name: 'Anita Das',
      campId: 'SH1',
      ageBand: '60+',
      sex: 'f',
    });
  });

  it('lists only this camp\'s individual check-ins and counts them', () => {
    window.localStorage.setItem(CAMP_KEY, 'SH1');
    state.items = [personRow('p1', 'SH1', 'queued'), personRow('p2', 'SH2', 'synced')];
    render(<CampView snapshot={snapshot} online={false} />);
    const rows = screen.getAllByTestId('camp-person-row');
    expect(rows.map((r) => r.getAttribute('data-client-event-id'))).toEqual(['p1']);
    expect(screen.getByTestId('camp-summary-individuals').textContent).toBe('1');
  });

  it('lists only this camp\'s households with their status', () => {    window.localStorage.setItem(CAMP_KEY, 'SH1');
    state.items = [row('a', 'SH1', 'queued'), row('b', 'SH2', 'synced'), row('c', undefined, 'synced'), row('d', 'SH1', 'synced')];
    render(<CampView snapshot={snapshot} online={false} />);
    const rows = screen.getAllByTestId('camp-household-row');
    expect(rows.map((r) => r.getAttribute('data-client-event-id'))).toEqual(['a', 'd']);
    expect(rows.map((r) => r.getAttribute('data-status'))).toEqual(['queued', 'synced']);
    expect(within(rows[0]!).getByText(/Head a/)).toBeTruthy();
    expect(screen.getByTestId('camp-household-list')).toBeTruthy();
  });

  it('summarises the camp: households, people, pending, awaiting review; reported-open counts only', () => {
    window.localStorage.setItem(CAMP_KEY, 'SH1');
    state.items = [row('a', 'SH1', 'queued'), row('b', 'SH1', 'conflict'), row('c', 'SH1', 'synced'), row('d', 'SH2', 'queued')].map((r, i) => {
      const it = r as unknown as { event: Record<string, unknown> };
      it.event.householdId = `h${i}`;
      return r;
    });
    render(<CampView snapshot={snapshot} online />);
    expect(screen.getByTestId('camp-summary-households').textContent).toBe('3');
    expect(screen.getByTestId('camp-summary-people').textContent).toBe('9');
    expect(screen.getByTestId('camp-summary-pending').textContent).toBe('1');
    expect(screen.getByTestId('camp-summary-review').textContent).toBe('1');
    expect(screen.getByTestId('camp-capacity').textContent).toContain('120 of 200');
    expect(screen.getByTestId('household-duplicates-blocked').textContent).toContain('not available yet');
  });

  it('shows server-confirmed households from another device without double-counting local synced rows', () => {
    window.localStorage.setItem(CAMP_KEY, 'SH1');
    state.items = [row('server-h', 'SH1', 'synced'), row('local-pending', 'SH1', 'queued')];
    render(<CampView snapshot={snapshot} online people={remotePeople} />);
    expect(screen.getByTestId('camp-people-source').textContent).toContain('all devices');
    expect(screen.getByTestId('camp-summary-households').textContent).toBe('2');
    expect(screen.getByTestId('camp-summary-people').textContent).toBe('7');
    const householdRows = screen.getAllByTestId('camp-household-row');
    expect(householdRows).toHaveLength(2);
    expect(screen.getByText('Remote Family')).toBeTruthy();
    expect(householdRows[0]!.getAttribute('data-source')).toBe('server');
  });

  it('offers "Not in a camp" and shows the individual form; the camp list can be searched', () => {
    render(<CampView snapshot={snapshot} cachedAt={Date.UTC(2026, 9, 30, 9)} online />);
    const select = screen.getByTestId('camp-select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '__none__' } });
    expect(screen.getByTestId('camp-individual-form')).toBeTruthy();
    expect(screen.getByTestId('individual-note').textContent).toContain('household of one');
    expect(screen.queryByTestId('camp-person-form')).toBeNull();
  });
});
