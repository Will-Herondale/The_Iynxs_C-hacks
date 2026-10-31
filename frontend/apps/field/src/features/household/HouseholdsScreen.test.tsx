// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { FieldEvent, ProjectionSnapshot } from '@setu/contract';
import type { QueueItem } from '../../sync/index.js';

const enqueue = vi.hoisted(() => vi.fn(async (e: FieldEvent) => e));
vi.mock('../../sync/index.js', () => ({
  enqueue,
  replace: vi.fn(),
  useQueue: () => [],
  useSyncState: () => ({ online: true, syncing: false, pendingCount: 0 }),
}));

import { HouseholdsScreen } from './HouseholdsScreen.js';

const snapshot = {
  settlements: { features: [{ properties: { settlementId: '1001', name: 'Kamalabari' } }] },
  shelters: { features: [{ properties: { shelterId: 'MJ-SH-009', name: 'Garamur School' } }] },
} as unknown as ProjectionSnapshot;

const item = (cid: string, name: string, status: string, over: Record<string, unknown> = {}, createdAt = 1): QueueItem =>
  ({
    clientEventId: cid, type: 'household_registration', status, attempts: 0, createdAt, updatedAt: createdAt,
    event: { type: 'household_registration', householdId: `hh-${cid}`, headName: name, members: 3, needs: ['water'], vulnerable: { elderly: true, children: false, disabled: false, medical: false }, ...over },
  }) as unknown as QueueItem;

afterEach(cleanup);

describe('HouseholdsScreen', () => {
  const items = [
    item('a', 'Asha', 'queued', { settlementId: '1001', shelterId: 'MJ-SH-009' }, 1),
    item('b', 'Bimal', 'rejected', {}, 2),
  ];

  it('lists, searches by name/village/camp and shows the 7-label status badge', () => {
    render(<HouseholdsScreen snapshot={snapshot} items={items} online />);
    expect(screen.getAllByTestId('household-row')).toHaveLength(2);
    const search = screen.getByTestId('households-search');
    fireEvent.change(search, { target: { value: 'kamala' } });
    const rows = screen.getAllByTestId('household-row');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain('Asha');
    expect(rows[0]!.textContent).toContain('Garamur School');
    expect(within(rows[0]!).getAllByTestId('sync-status-label')[0]).toBeTruthy();
    fireEvent.change(search, { target: { value: 'zzz' } });
    expect(screen.getByTestId('households-no-match')).toBeTruthy();
  });

  it('shows registration history and opens a report detail', () => {
    const open = vi.fn();
    render(<HouseholdsScreen snapshot={snapshot} items={items} online onOpenReport={open} />);
    const row = screen.getAllByTestId('household-row')[1]!;
    expect(within(row).getAllByTestId('household-history-item')).toHaveLength(1);
    fireEvent.click(within(row).getByTestId('household-open-detail'));
    expect(open).toHaveBeenCalledWith('a');
  });

  it('shows the blocked duplicate-review and member-name placeholders, never matching', () => {
    render(<HouseholdsScreen snapshot={snapshot} items={items} online />);
    expect(screen.getByTestId('household-duplicates-blocked').textContent).toContain('not available yet');
    expect(screen.getByTestId('household-member-names-blocked-summary').textContent).toContain('not recorded yet');
  });

  it('registers a household offline: origin village and camp come from cached data, then is saved locally', async () => {
    render(<HouseholdsScreen snapshot={snapshot} items={[]} online={false} />);
    fireEvent.click(screen.getByTestId('households-register'));
    expect(screen.getByTestId('household-member-names-blocked').textContent).toContain('not recorded yet');
    expect(screen.getByTestId('household-id').textContent).toMatch(/^[0-9a-f-]{36}$/);
    fireEvent.change(screen.getByTestId('household-headName'), { target: { value: 'Dolly' } });
    fireEvent.change(screen.getByTestId('household-members'), { target: { value: '5' } });
    fireEvent.change(screen.getByTestId('household-settlementId'), { target: { value: '1001' } });
    fireEvent.change(screen.getByTestId('household-shelterId'), { target: { value: 'MJ-SH-009' } });
    fireEvent.change(screen.getByTestId('field-lat'), { target: { value: '26.95' } });
    fireEvent.change(screen.getByTestId('field-lng'), { target: { value: '94.17' } });
    fireEvent.click(screen.getByTestId('household-submit'));
    await waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(enqueue.mock.calls[0]![0]).toMatchObject({ headName: 'Dolly', members: 5, settlementId: '1001', shelterId: 'MJ-SH-009' });
    expect(await screen.findByTestId('households-saved')).toBeTruthy();
  });

  it('says so when no village list is cached', () => {
    render(<HouseholdsScreen items={[]} online={false} startRegistering />);
    expect(screen.getByTestId('household-places-missing')).toBeTruthy();
  });
});
