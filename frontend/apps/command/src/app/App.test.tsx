// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { stubApi } from '../testing/stubApi';
import type { ApiClient } from '@setu/contract';

// MapLibre needs WebGL; the dashboard wiring is what is under test here.
vi.mock('../map', async () => {
  const t = await import('../map/toggles');
  return { MapLayersProvider: t.MapLayersProvider, MapView: () => <div data-testid="map"><t.MapLayerControls /></div> };
});

import { App } from './App';
import { TOGGLE_IDS } from '../map/layers';

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
    expect(screen.queryByTestId('overview-simtime')).toBeNull();
    for (const id of ['affected', 'disconnected', 'impassable', 'unavailable-routes', 'pending', 'evac']) expect(screen.getByTestId(`overview-count-${id}`)).toBeTruthy();
  });

  it('renders all 10 layer toggles on the map and they toggle', () => {
    render(<App client={seeded()} />);
    fireEvent.click(screen.getByTestId('nav-map'));
    expect(TOGGLE_IDS).toHaveLength(10);
    for (const id of TOGGLE_IDS) expect(screen.getByTestId(`layer-toggle-${id}`)).toBeTruthy();
    const flood = screen.getByTestId('layer-toggle-flood') as HTMLInputElement;
    fireEvent.click(flood);
    expect(flood.checked).toBe(false);
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
