// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, fireEvent } from '@testing-library/react';
import { createMockApiClient, resetMock } from '@setu/mock-backend';
import type { ApiClient } from '@setu/contract';

// MapLibre needs WebGL; the dashboard wiring is what is under test here.
vi.mock('../map', () => ({ MapView: () => <div data-testid="map" /> }));

import { App } from './App';

afterEach(() => {
  cleanup();
  resetMock();
});

function seeded(over: Partial<ApiClient> = {}): ApiClient {
  resetMock();
  return { ...createMockApiClient(), ...over };
}

describe('<App/> dashboard', () => {
  it('renders header stats, lists, and selects a feature on row click', async () => {
    render(<App client={seeded()} />);
    await waitFor(() => expect(screen.getByTestId('stat-cut-off').textContent).toBe('0'));
    expect(screen.getByTestId('stat-blocked-roads').textContent).toBe('0');
    expect(Number(screen.getByTestId('stat-active-routes').textContent)).toBeGreaterThan(0);
    expect(screen.getByTestId('connection-status').dataset.state).toBe('live');
    for (const id of ['layer-toggle-flood', 'layer-toggle-roads', 'layer-toggle-settlements', 'layer-toggle-routes', 'layer-toggle-shelters', 'incident-feed', 'map']) {
      expect(screen.getByTestId(id)).toBeTruthy();
    }
    fireEvent.click(await screen.findByTestId('road-row-R7'));
    const panel = await screen.findByTestId('feature-panel');
    expect(panel.dataset.featureKind).toBe('road');
    expect(panel.dataset.featureId).toBe('R7');
  });

  it('shows polling in connection-status when subscribe fails', async () => {
    render(<App client={seeded({ subscribe: () => { throw new Error('no push'); } })} />);
    await waitFor(() => expect(screen.getByTestId('connection-status').dataset.state).toBe('polling'));
  });
});
