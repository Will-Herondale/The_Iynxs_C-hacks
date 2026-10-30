// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { createApiClientWithMock } from '@setu/mock-backend';
import { ApiProvider } from './api.js';
import { App } from './App.js';

const sync = vi.hoisted(() => ({ online: true }));
vi.mock('../sync/index.js', async (orig) => ({
  ...(await orig<typeof import('../sync/index.js')>()),
  useSyncState: () => ({ online: sync.online, syncing: false, pendingCount: 0 }),
}));

afterEach(() => {
  cleanup();
  sync.online = true;
  vi.restoreAllMocks();
  window.location.hash = '';
});

describe('<App/> wave 3', () => {
  it('has nav-camp that routes to the camp screen', () => {
    window.location.hash = '#/camp';
    render(
      <ApiProvider api={createApiClientWithMock()}>
        <App />
      </ApiProvider>,
    );
    expect(screen.getByTestId('nav-camp').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('camp-select')).toBeTruthy();
  });

  it('shows the offline banner only while offline', () => {
    sync.online = false;
    render(
      <ApiProvider api={createApiClientWithMock()}>
        <App />
      </ApiProvider>,
    );
    expect(screen.getByTestId('offline-banner').textContent).toContain('reports are saved on this device');
  });
});
