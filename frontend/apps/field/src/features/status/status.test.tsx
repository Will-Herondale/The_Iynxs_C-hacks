// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { EventRecord } from '@setu/contract';

vi.mock('../../sync/index.js', () => ({
  useQueue: () => [],
  useSyncState: () => ({ online: true, syncing: false, pendingCount: 0 }),
}));

import { DataAsOf, OriginBadge, StaleWarning } from './index.js';
import { STALE_AMBER_MS, STALE_RED_MS, formatRelative, staleLevel } from './staleness.js';
import { deriveConnectivity, probeBackend } from './connectivity.js';
import { originLabel } from './origin.js';
import { remoteMarkers } from '../map/reportMarkers.js';

afterEach(cleanup);

describe('staleness', () => {
  it('uses named thresholds', () => {
    expect(staleLevel(STALE_AMBER_MS)).toBe('fresh');
    expect(staleLevel(STALE_AMBER_MS + 1)).toBe('amber');
    expect(staleLevel(STALE_RED_MS)).toBe('amber');
    expect(staleLevel(STALE_RED_MS + 1)).toBe('red');
    expect(formatRelative(125 * 60_000)).toBe('2 h 5 min ago');
  });
  it('StaleWarning reflects cachedAt age', () => {
    const { rerender } = render(<StaleWarning cachedAt={Date.now() - 1000} />);
    expect(screen.queryByTestId('stale-warning')).toBeNull();
    rerender(<StaleWarning cachedAt={Date.now() - 20 * 60_000} />);
    expect(screen.getByTestId('stale-warning').getAttribute('data-level')).toBe('amber');
    rerender(<StaleWarning cachedAt={Date.now() - 2 * 3600_000} />);
    expect(screen.getByTestId('stale-warning').getAttribute('data-level')).toBe('red');
  });
  it('DataAsOf shows IST', () => {
    render(<DataAsOf cachedAt={Date.UTC(2026, 9, 30, 9)} />);
    expect(screen.getByTestId('data-as-of').textContent).toContain('IST');
  });
});

describe('connectivity', () => {
  it('derives the four states', () => {
    expect(deriveConnectivity({ online: false, syncing: false, backendReachable: true })).toBe('offline');
    expect(deriveConnectivity({ online: true, syncing: true, backendReachable: true })).toBe('syncing');
    expect(deriveConnectivity({ online: true, syncing: false, backendReachable: false })).toBe('backend-unreachable');
    expect(deriveConnectivity({ online: true, syncing: false, backendReachable: true })).toBe('online');
  });
  it('probe: any HTTP status (404) is reachable; network failure or timeout is not', async () => {
    expect(await probeBackend((async () => new Response('', { status: 404 })) as typeof fetch)).toBe(true);
    expect(await probeBackend((async () => { throw new TypeError('x'); }) as typeof fetch)).toBe(false);
    const hang = ((_u: unknown, init?: RequestInit) =>
      new Promise((_r, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('abort'))))) as typeof fetch;
    expect(await probeBackend(hang, 10)).toBe(false);
  });
});

describe('origin', () => {
  it('labels', () => {
    expect(originLabel('local')).toBe('Local');
    expect(originLabel('local', true)).toBe('Local · Accepted');
    expect(originLabel('remote')).toBe('Remote');
  });
  it('badge carries data-origin and a distinct glyph', () => {
    const { rerender } = render(<OriginBadge origin="local" accepted />);
    const l = screen.getByTestId('origin-badge');
    expect(l.getAttribute('data-origin')).toBe('local');
    expect(l.textContent).toContain('Local · Accepted');
    rerender(<OriginBadge origin="remote" />);
    const r = screen.getByTestId('origin-badge');
    expect(r.getAttribute('data-origin')).toBe('remote');
    expect(r.textContent).not.toContain('●');
  });
  it('remoteMarkers skips events this device created and households', () => {
    const rec = (id: string, type = 'flood_report') =>
      ({ eventId: 'e' + id, serverState: 'applied', receivedAt: '2026-01-01T00:00:00Z', event: { type, clientEventId: id, location: { lat: 26.9, lng: 94.1 } } }) as unknown as EventRecord;
    const m = remoteMarkers([rec('a'), rec('b'), rec('c', 'household_registration')], new Set(['a']));
    expect(m.map((x) => x.clientEventId)).toEqual(['b']);
    expect(m[0]!.origin).toBe('remote');
  });
});
