// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FieldEvent, ProjectionSnapshot } from '@setu/contract';
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
  shelters: { type: 'FeatureCollection', features: [shelter('SH1', 'School', 200, 120, true), shelter('SH2', 'Hall', 50, 50, false)] },
} as unknown as ProjectionSnapshot;

const row = (id: string, shelterId: string | undefined, status: string): QueueItem =>
  ({
    clientEventId: id, type: 'household_registration', status, attempts: 0, createdAt: 1, updatedAt: 1,
    event: { type: 'household_registration', headName: `Head ${id}`, members: 3, shelterId },
  }) as unknown as QueueItem;

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
    expect([...select.options].map((o) => o.value)).toEqual(['', 'SH1', 'SH2']);
    fireEvent.change(select, { target: { value: 'SH1' } });
    const info = screen.getByTestId('camp-info');
    expect(info.getAttribute('data-shelter-id')).toBe('SH1');
    expect(info.textContent).toContain('120');
    expect(info.textContent).toContain('200');
    expect(info.textContent).toContain('Open');
    expect(info.textContent).not.toContain('Data as of');
    expect(window.localStorage.getItem(CAMP_KEY)).toBe('SH1');
  });

  it('restores the remembered camp and shows "data as of" and Closed offline', () => {
    window.localStorage.setItem(CAMP_KEY, 'SH2');
    render(<CampView snapshot={snapshot} cachedAt={Date.UTC(2026, 9, 30, 9)} online={false} />);
    const info = screen.getByTestId('camp-info');
    expect(info.getAttribute('data-shelter-id')).toBe('SH2');
    expect(info.textContent).toContain('Closed');
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

  it('lists only this camp\'s households with their status', () => {
    window.localStorage.setItem(CAMP_KEY, 'SH1');
    state.items = [row('a', 'SH1', 'queued'), row('b', 'SH2', 'synced'), row('c', undefined, 'synced'), row('d', 'SH1', 'synced')];
    render(<CampView snapshot={snapshot} online={false} />);
    const rows = screen.getAllByTestId('camp-household-row');
    expect(rows.map((r) => r.getAttribute('data-client-event-id'))).toEqual(['a', 'd']);
    expect(rows.map((r) => r.getAttribute('data-status'))).toEqual(['queued', 'synced']);
    expect(within(rows[0]!).getByText(/Head a/)).toBeTruthy();
    expect(screen.getByTestId('camp-household-list')).toBeTruthy();
  });
});
