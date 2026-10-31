// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { render, screen, cleanup, waitFor, act } from '@testing-library/react';
import { reportBackendResult } from '../status/index.js';
import { newClientEventId } from '@setu/contract';
import { enqueue } from '../../sync/index.js';
import { db } from '../../sync/db.js';
import { HomeScreen, homeCounts } from './HomeScreen.js';

afterEach(async () => {
  cleanup();
  act(() => reportBackendResult(true));
  await db.queue.clear();
});

describe('homeCounts', () => {
  it('maps statuses to pending / synced / attention', () => {
    const s = (status: string) => ({ status }) as never;
    expect(homeCounts([s('queued'), s('sending'), s('accepted'), s('synced'), s('conflict'), s('rejected'), s('failed')])).toEqual({
      pending: 3,
      synced: 1,
      attention: 3,
    });
  });
});

describe('<HomeScreen/>', () => {
  it('labels the district as a fixture and shows the empty state', () => {
    render(<HomeScreen />);
    expect(screen.getByTestId('home-district').textContent).toBe('Majuli (demo)');
    expect(screen.getByTestId('home-district-fixture')).toBeTruthy();
    expect(screen.getByTestId('home-new-report').getAttribute('href')).toBe('#/report');
    expect(screen.getByTestId('home-recent-empty')).toBeTruthy();
  });

  it('lists recent items linking to detail and counts pending', async () => {
    const id = newClientEventId();
    await enqueue({
      type: 'water_level',
      clientEventId: id,
      reporterId: 'r',
      deviceId: 'd',
      occurredAt: new Date().toISOString(),
      location: { lat: 26.95, lng: 94.17 },
      levelCm: 120,
      trend: 'steady',
    });
    render(<HomeScreen />);
    await waitFor(() => expect(screen.getAllByTestId('home-recent-item').length).toBe(1));
    expect(screen.getByRole('link', { name: /Water-level observation/ }).getAttribute('href')).toBe(`#/report/${id}`);
    expect(screen.getByTestId('home-count-pending').textContent).toContain('1');
  });

  it('does not say plain "Online" while the server is not responding (matches the header indicator)', () => {
    render(<HomeScreen />);
    expect(screen.getByTestId('home-connectivity').textContent).toContain('Online');
    act(() => reportBackendResult(false));
    const row = screen.getByTestId('home-connectivity');
    expect(row.getAttribute('data-state')).toBe('backend-unreachable');
    expect(row.textContent).toContain('server is not responding');
  });
});
