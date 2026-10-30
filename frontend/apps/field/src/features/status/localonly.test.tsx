// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

const sync = { online: true };
vi.mock('../../sync/index.js', () => ({
  useQueue: () => [],
  useSyncState: () => ({ online: sync.online, syncing: false, pendingCount: 0 }),
}));

import { LocalOnlyNotice } from './index.js';
import { HEALTH_PATH, probeBackend, reportBackendResult } from './connectivity.js';

afterEach(() => { cleanup(); sync.online = true; reportBackendResult(true); });

describe('probeBackend', () => {
  it('probes the BACKEND /health (base URL + path), never the app origin', async () => {
    const urls: string[] = [];
    const f = (async (u: RequestInfo | URL) => { urls.push(String(u)); return new Response('', { status: 200 }); }) as typeof fetch;
    expect(HEALTH_PATH).toBe('/health');
    expect(await probeBackend(f, 1000, 'https://api.example.test')).toBe(true);
    expect(urls).toEqual(['https://api.example.test/health']);
  });
});

describe('LocalOnlyNotice', () => {
  it('is hidden while online and the backend is reachable', () => {
    render(<LocalOnlyNotice />);
    expect(screen.queryByTestId('local-only-notice')).toBeNull();
  });

  it('says an offline device only knows its own information, not the district-wide picture', () => {
    sync.online = false;
    render(<LocalOnlyNotice />);
    const n = screen.getByTestId('local-only-notice');
    expect(n.getAttribute('data-reason')).toBe('offline');
    expect(n.textContent).toContain('only knows what is saved on it');
    expect(n.textContent).toContain('not the district-wide situation');
    expect(n.textContent).toContain('Local (this device)');
    expect(n.textContent).toContain('District (synced)');
  });

  it('also shows when the browser is online but the backend is unreachable', () => {
    render(<LocalOnlyNotice />);
    act(() => reportBackendResult(false));
    expect(screen.getByTestId('local-only-notice').getAttribute('data-reason')).toBe('backend-unreachable');
  });
});
