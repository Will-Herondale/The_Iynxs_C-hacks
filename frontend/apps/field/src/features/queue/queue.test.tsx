// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { QueueItem } from '../../sync/index.js';

const state = vi.hoisted(() => ({ items: [] as unknown[], sync: { online: true, syncing: false, pendingCount: 0 } as Record<string, unknown> }));
const fns = vi.hoisted(() => ({ retry: vi.fn(), discard: vi.fn(), resolveConflict: vi.fn(), syncNow: vi.fn() }));

vi.mock('../../sync/index.js', () => ({
  ...fns,
  useQueue: (f?: string[]) => (state.items as QueueItem[]).filter((i) => !f || f.includes(i.status)),
  useSyncState: () => state.sync,
}));

import { QueueScreen, OnlineStatus, PendingCount, LastSynced, SyncNowButton } from './index.js';

const mk = (id: string, status: string, extra: Partial<QueueItem> = {}) =>
  ({ clientEventId: id, type: 'road_blockage', event: { type: 'road_blockage', roadId: 'R7' }, status, attempts: 1, createdAt: 1, updatedAt: 1, ...extra }) as unknown as QueueItem;

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('QueueScreen', () => {
  it('shows empty state', () => {
    state.items = [];
    render(<QueueScreen />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
  });

  it('renders rows with test ids and actions', () => {
    state.items = [mk('a', 'failed', { lastError: 'boom' }), mk('b', 'rejected'), mk('c', 'synced')];
    const onEdit = vi.fn();
    render(<QueueScreen onEdit={onEdit} />);
    const rows = screen.getAllByTestId('queue-item');
    expect(rows.map((r) => r.getAttribute('data-status'))).toEqual(['failed', 'rejected', 'synced']);
    fireEvent.click(screen.getAllByTestId('queue-retry')[0]!);
    expect(fns.retry).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByTestId('queue-edit'));
    expect(onEdit).toHaveBeenCalled();
    fireEvent.click(screen.getAllByTestId('queue-discard')[0]!);
    expect(fns.discard).not.toHaveBeenCalled(); // never silent
    fireEvent.click(screen.getByRole('button', { name: 'Discard report' }));
    expect(fns.discard).toHaveBeenCalledWith('a');
    expect(rows[2]!.querySelector('[data-testid=queue-discard]')).toBeNull();
  });

  it('conflict panel resolves', async () => {
    state.items = [mk('x', 'conflict', { conflict: { reason: 'road already blocked', serverState: { status: 'blocked' } } })];
    render(<QueueScreen />);
    expect(screen.getByTestId('conflict-panel')).toBeTruthy();
    fireEvent.click(screen.getByTestId('conflict-keep-mine'));
    expect(fns.resolveConflict).toHaveBeenCalledWith('x', 'keep-mine');
    await waitFor(() => expect((screen.getByTestId('conflict-accept-server') as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByTestId('conflict-accept-server'));
    expect(fns.resolveConflict).toHaveBeenCalledWith('x', 'accept-server');
  });

  it('cancelling the discard dialog keeps the report', () => {
    state.items = [mk('a', 'failed')];
    render(<QueueScreen />);
    fireEvent.click(screen.getByTestId('queue-discard'));
    fireEvent.click(screen.getByRole('button', { name: 'Keep report' }));
    expect(fns.discard).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows grouped counts, connectivity and detail links', () => {
    state.sync = { online: false, syncing: false, pendingCount: 2, lastSyncedAt: Date.UTC(2026, 0, 1) };
    state.items = [mk('a', 'queued'), mk('b', 'queued'), mk('c', 'sending'), mk('d', 'synced'), mk('e', 'conflict'), mk('f', 'failed')];
    render(<QueueScreen />);
    const count = (k: string) => screen.getByTestId(`sync-count-${k}`).textContent;
    expect(count('queued')).toBe('2');
    expect(screen.getByTestId('sync-summary').textContent).toContain('Saved locally');
    expect(count('synchronising')).toBe('1');
    expect(count('synced')).toBe('1');
    expect(count('conflict')).toBe('1');
    expect(count('failed')).toBe('1');
    expect(screen.getByTestId('sync-connectivity').getAttribute('data-online')).toBe('false');
    expect(screen.getByTestId('sync-last-success').getAttribute('data-ts')).toBe('2026-01-01T00:00:00.000Z');
    expect(screen.getAllByTestId('queue-detail-link')[0]!.getAttribute('href')).toBe('#/report/a');
    expect((screen.getByTestId('queue-sync-now') as HTMLButtonElement).disabled).toBe(true);
    state.sync = { online: true, syncing: false, pendingCount: 0 };
  });

  it('manual sync calls syncNow when online', () => {
    state.items = [];
    render(<QueueScreen />);
    fireEvent.click(screen.getByTestId('queue-sync-now'));
    expect(fns.syncNow).toHaveBeenCalled();
  });

  it('filters by status', () => {
    state.items = [mk('a', 'queued'), mk('b', 'synced')];
    render(<QueueScreen />);
    fireEvent.click(screen.getByTestId('queue-filter-synced'));
    expect(screen.getAllByTestId('queue-item')).toHaveLength(1);
  });
});

describe('header widgets', () => {
  it('expose test ids', () => {
    state.sync = { online: false, syncing: false, pendingCount: 3, lastSyncedAt: Date.UTC(2026, 0, 1) };
    render(<><OnlineStatus /><PendingCount /><LastSynced /><SyncNowButton /></>);
    expect(screen.getByTestId('online-indicator').getAttribute('data-online')).toBe('false');
    expect(screen.getByTestId('pending-count').textContent).toBe('3');
    expect(screen.getByTestId('last-synced').getAttribute('data-ts')).toBe('2026-01-01T00:00:00.000Z');
    expect((screen.getByTestId('sync-now') as HTMLButtonElement).disabled).toBe(true);
    state.sync = { online: true, syncing: false, pendingCount: 0 };
  });
  it('sync now calls syncNow', () => {
    render(<SyncNowButton />);
    fireEvent.click(screen.getByTestId('sync-now'));
    expect(fns.syncNow).toHaveBeenCalled();
  });
});

describe('status explanations', () => {
  it('explains each status in the brief vocabulary', async () => {
    const { statusExplanation } = await import('./QueueScreen.js');
    expect(statusExplanation('queued', false)).toMatch(/^Saved locally/);
    expect(statusExplanation('queued', true)).toMatch(/^Waiting to sync/);
    expect(statusExplanation('sending', true)).toMatch(/^Synchronising/);
    expect(statusExplanation('accepted', true)).toMatch(/^Synchronising/);
    expect(statusExplanation('synced', true)).toMatch(/^Accepted/);
    expect(statusExplanation('conflict', true)).toMatch(/^Requires review/);
    expect(statusExplanation('rejected', true)).toMatch(/^Rejected/);
    expect(statusExplanation('failed', true)).toMatch(/^Failed — retry available/);
  });

  it('renders the explanation per row and the renamed filters', () => {
    state.sync = { online: false, syncing: false, pendingCount: 1 };
    state.items = [mk('a', 'queued')];
    render(<QueueScreen />);
    expect(screen.getByTestId('queue-item-explain').textContent).toMatch(/^Saved locally/);
    expect(screen.getByTestId('queue-filter-synced').textContent).toBe('Accepted');
    expect(screen.getByTestId('queue-filter-attention').textContent).toBe('Needs attention');
    state.sync = { online: true, syncing: false, pendingCount: 0 };
  });
});
