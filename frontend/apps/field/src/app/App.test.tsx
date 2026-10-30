// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { stubApi } from '../testing/stubApi';
import { ApiProvider } from './api.js';
import { App } from './App.js';

vi.mock('maplibre-gl', () => ({ default: { Map: class { on() {} addControl() {} remove() {} }, Marker: class {}, NavigationControl: class {} } }));
vi.mock('maplibre-gl/dist/maplibre-gl.css', () => ({}));
vi.mock('../pwa/register.js', () => ({ registerServiceWorker: () => {}, useUpdateAvailable: () => ({ available: false, reload: () => {}, dismiss: () => {} }) }));

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

describe('<App/> v3 shell', () => {
  it('defaults to Home and exposes the five tabs', () => {
    render(
      <ApiProvider api={stubApi()}>
        <App />
      </ApiProvider>,
    );
    expect(screen.getByTestId('home-screen')).toBeTruthy();
    for (const id of ['nav-home', 'nav-report', 'nav-map', 'nav-households', 'nav-sync']) expect(screen.getByTestId(id)).toBeTruthy();
    expect(screen.getByTestId('nav-home').getAttribute('aria-current')).toBe('page');
  });

  it('keeps old #/queue and #/household hashes working', () => {
    window.location.hash = '#/queue';
    const { unmount } = render(
      <ApiProvider api={stubApi()}>
        <App />
      </ApiProvider>,
    );
    expect(screen.getByTestId('nav-sync').getAttribute('aria-current')).toBe('page');
    unmount();
    window.location.hash = '#/household';
    render(
      <ApiProvider api={stubApi()}>
        <App />
      </ApiProvider>,
    );
    expect(screen.getByTestId('nav-households').getAttribute('aria-current')).toBe('page');
  });

  it('has nav-camp that routes to the camp screen', () => {
    window.location.hash = '#/camp';
    render(
      <ApiProvider api={stubApi()}>
        <App />
      </ApiProvider>,
    );
    expect(screen.getByTestId('nav-camp').getAttribute('aria-current')).toBe('page');
    expect(screen.getByTestId('camp-select')).toBeTruthy();
  });

  it('shows the offline banner only while offline', () => {
    sync.online = false;
    render(
      <ApiProvider api={stubApi()}>
        <App />
      </ApiProvider>,
    );
    expect(screen.getByTestId('offline-banner').textContent).toContain('saved locally');
  });
});
