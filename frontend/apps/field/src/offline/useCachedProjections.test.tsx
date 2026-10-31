// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ApiClient, ProjectionSnapshot } from '@setu/contract';

const sync = vi.hoisted(() => ({ online: true }));
const apiRef = vi.hoisted(() => ({ api: undefined as unknown }));
vi.mock('../sync/index.js', () => ({ useSyncState: () => ({ online: sync.online }) }));
vi.mock('../app/api.js', () => ({ useApi: () => apiRef.api }));

import { cacheDb, writeCachedSnapshot } from './cacheDb.js';
import { useCachedProjections } from './useCachedProjections.js';

const snap = (version: number) => ({ version, generatedAt: '2026-01-01T00:00:00Z' }) as unknown as ProjectionSnapshot;
const mkApi = (getProjections: () => Promise<ProjectionSnapshot>) =>
  ({ getProjections, subscribe: () => () => undefined }) as unknown as ApiClient;

function Probe() {
  const { snapshot, stale, cachedAt } = useCachedProjections();
  return <div data-testid="p" data-version={snapshot?.version ?? ''} data-stale={String(stale)} data-cached={cachedAt ?? ''} />;
}

afterEach(async () => {
  cleanup();
  await cacheDb.projections.clear();
});

describe('useCachedProjections', () => {
  it('fetches online, marks fresh and stores to IndexedDB', async () => {
    sync.online = true;
    apiRef.api = mkApi(async () => snap(3));
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('p').getAttribute('data-version')).toBe('3'));
    expect(screen.getByTestId('p').getAttribute('data-stale')).toBe('false');
    expect((await cacheDb.projections.get('latest'))?.snapshot.version).toBe(3);
  });

  it('serves the cache, stale, when offline', async () => {
    await writeCachedSnapshot(snap(7), 12345);
    sync.online = false;
    const get = vi.fn();
    apiRef.api = mkApi(get);
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('p').getAttribute('data-version')).toBe('7'));
    expect(screen.getByTestId('p').getAttribute('data-stale')).toBe('true');
    expect(screen.getByTestId('p').getAttribute('data-cached')).toBe('12345');
    expect(get).not.toHaveBeenCalled();
  });

  it('falls back to the cache when the fetch fails', async () => {
    await writeCachedSnapshot(snap(5), 1);
    sync.online = true;
    apiRef.api = mkApi(async () => {
      throw new Error('network');
    });
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('p').getAttribute('data-version')).toBe('5'));
    expect(screen.getByTestId('p').getAttribute('data-stale')).toBe('true');
  });

  it('has no snapshot offline with an empty cache', async () => {
    sync.online = false;
    apiRef.api = mkApi(vi.fn());
    render(<Probe />);
    expect(screen.getByTestId('p').getAttribute('data-version')).toBe('');
    expect(screen.getByTestId('p').getAttribute('data-stale')).toBe('true');
  });
});
