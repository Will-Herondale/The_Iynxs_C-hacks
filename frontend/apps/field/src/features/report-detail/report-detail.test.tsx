// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { newClientEventId } from '@setu/contract';
import type { FieldEvent } from '@setu/contract';
import { db, } from '../../sync/db.js';
import type { QueueItem } from '../../sync/db.js';
import { replace } from '../../sync/queue.js';
import { ReportDetailScreen, ReportDetailView } from './ReportDetail.js';
import { formatIst, syncLabel } from './format.js';

const ev = (over: Partial<FieldEvent> = {}): FieldEvent => ({
  clientEventId: newClientEventId(), occurredAt: '2026-10-30T03:30:00.000Z', reporterId: 'r', deviceId: 'd',
  location: { lat: 26.95, lng: 94.17 }, type: 'road_blockage', roadId: '284824410', blockage: 'full', cause: 'submerged', ...over,
} as FieldEvent);
const item = (e: FieldEvent, over: Partial<QueueItem> = {}): QueueItem => ({
  clientEventId: e.clientEventId, type: e.type, event: e, status: 'queued', attempts: 0, createdAt: Date.parse('2026-10-30T03:45:00Z'), updatedAt: 1, ...over,
});

beforeEach(async () => { await db.queue.clear(); await db.archive.clear(); });
afterEach(cleanup);

describe('syncLabel', () => {
  it('uses the spec vocabulary', () => {
    expect(syncLabel('queued', false)).toBe('Saved locally');
    expect(syncLabel('queued', true)).toBe('Waiting to sync');
    expect(syncLabel('sending', true)).toBe('Synchronising');
    expect(syncLabel('accepted', true)).toBe('Synchronising');
    expect(syncLabel('synced', true)).toBe('Accepted');
    expect(syncLabel('conflict', true)).toBe('Requires review');
    expect(syncLabel('rejected', true)).toBe('Rejected');
    expect(syncLabel('failed', true)).toBe('Failed — retry available');
  });
  it('formats IST', () => expect(formatIst('2026-10-30T03:30:00Z')).toContain('09:00'));
});

describe('ReportDetailView', () => {
  it('shows ids, category, payload, observed vs submitted time, and ack', () => {
    const e = ev();
    render(<ReportDetailView online item={item(e, { status: 'synced', eventId: 'evt-9', acceptedAtVersion: 12 })} />);
    expect(screen.getByTestId('detail-client-event-id').textContent).toBe(e.clientEventId);
    expect(screen.getByTestId('detail-event-id').textContent).toBe('evt-9');
    expect(screen.getByTestId('detail-status').textContent).toContain('Accepted');
    expect(screen.getByTestId('detail-ack').textContent).toContain('12');
    expect(screen.getByTestId('detail-payload').textContent).toContain('284824410');
    expect(screen.getByTestId('detail-payload').textContent).toContain('submerged');
    expect(screen.getByTestId('detail-observed').textContent).toContain('09:00');
    expect(screen.getByTestId('detail-submitted').textContent).toContain('09:15');
    expect(screen.getByRole('heading', { name: 'Submerged bridge or crossing' }) ?? true).toBeTruthy();
  });
  it('offline queued item: Saved locally, no ack, manual location', () => {
    render(<ReportDetailView online={false} item={item(ev())} />);
    expect(screen.getByTestId('detail-status').textContent).toContain('Saved locally');
    expect(screen.getByTestId('detail-ack-none')).toBeTruthy();
    expect(screen.getByTestId('detail-location').textContent).toContain('Manually placed');
  });
  it('conflict shows review reason; rejected shows errors and edit action', () => {
    const calls: string[] = [];
    const { rerender } = render(<ReportDetailView online item={item(ev(), { status: 'conflict', conflict: { reason: 'Server says open' } })} />);
    expect(screen.getByTestId('detail-review').textContent).toContain('Server says open');
    expect(screen.getByTestId('detail-status').textContent).toContain('Requires review');
    rerender(<ReportDetailView online item={item(ev(), { status: 'rejected', validationErrors: [{ path: 'roadId', message: 'Unknown road' }] })} onEdit={(i) => calls.push(i.clientEventId)} />);
    expect(screen.getByTestId('detail-review').textContent).toContain('Unknown road');
    fireEvent.click(screen.getByTestId('detail-edit'));
    expect(calls).toHaveLength(1);
  });
  it('missing item renders a not-found state', () => {
    render(<ReportDetailView online item={undefined} />);
    expect(screen.getByText('Report not found')).toBeTruthy();
  });
});

describe('ReportDetailScreen provenance (live queue)', () => {
  it('links replacement and original both ways after a rejected→edit replacement', async () => {
    const orig = ev();
    await db.queue.add(item(orig, { status: 'rejected' }));
    const next = await replace(orig.clientEventId, orig);
    const opened: string[] = [];
    const { rerender } = render(<ReportDetailScreen clientEventId={next.clientEventId} onOpen={(i) => opened.push(i)} />);
    await waitFor(() => expect(screen.getByTestId('provenance-supersedes')).toBeTruthy());
    fireEvent.click(screen.getByTestId('provenance-open-original'));
    expect(opened).toEqual([orig.clientEventId]);

    rerender(<ReportDetailScreen clientEventId={orig.clientEventId} onOpen={(i) => opened.push(i)} />);
    await waitFor(() => expect(screen.getByTestId('provenance-superseded')).toBeTruthy());
    expect(screen.getByTestId('detail-status').textContent).toContain('Superseded');
    fireEvent.click(screen.getByTestId('provenance-open-replacement'));
    expect(opened[1]).toBe(next.clientEventId);
  });
});
