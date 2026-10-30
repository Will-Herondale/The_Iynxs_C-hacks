// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { stubApi } from '../testing/stubApi';
import type { ApiClient } from '@setu/contract';

// MapLibre needs WebGL; the dashboard wiring is what is under test here.
vi.mock('../map', () => ({ MapView: () => <div data-testid="map" /> }));

import { App } from './App';

afterEach(() => {
  cleanup();
});

function seeded(over: Partial<ApiClient> = {}): ApiClient {
  return stubApi(over);
}

describe('<App/> dashboard', () => {
  it('renders the situation strip counts, section nav and the Overview', async () => {
    render(<App client={seeded()} />);
    await waitFor(() => expect(screen.getByTestId('stat-cut-off').textContent).toBe('0'));
    expect(screen.getByTestId('stat-blocked-roads').textContent).toBe('0');
    expect(screen.getByTestId('stat-active-routes').textContent).toBe('0');
    expect(screen.getByTestId('connection-status').dataset.state).toBe('live');
    expect(screen.getByTestId('situation-summary')).toBeTruthy();
    for (const id of ['nav-overview', 'nav-map', 'nav-settlements', 'nav-routes', 'nav-events', 'nav-audit']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    expect(screen.getByTestId('nav-overview').getAttribute('aria-current')).toBe('page');
    expect(await screen.findByTestId('overview')).toBeTruthy();
    expect(screen.getByTestId('overview-simtime').textContent).toBe('Not provided by backend');
    for (const id of ['affected', 'disconnected', 'impassable', 'pending', 'evac']) expect(screen.getByTestId(`overview-count-${id}`)).toBeTruthy();
  });

  it('switches sections and keeps the map mounted', async () => {
    render(<App client={seeded()} />);
    fireEvent.click(screen.getByTestId('nav-map'));
    expect(screen.getByTestId('map')).toBeTruthy();
    expect(screen.queryByTestId('overview')).toBeNull();
    fireEvent.click(screen.getByTestId('nav-settlements'));
    expect(screen.getByTestId('section-settlements')).toBeTruthy();
    fireEvent.click(screen.getByTestId('nav-audit'));
    expect(screen.getByTestId('section-audit')).toBeTruthy();
    expect(screen.getByTestId('map')).toBeTruthy();
  });

  it('shows polling in connection-status when subscribe fails', async () => {
    render(<App client={seeded({ subscribe: () => { throw new Error('no push'); } })} />);
    await waitFor(() => expect(screen.getByTestId('connection-status').dataset.state).toBe('polling'));
  });
});
