// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import type { ApiClient, ProjectionSnapshot } from '@setu/contract';
import { ApiProvider, makeQueryClient, useProjections } from './index';

const fc = <T,>(features: T[] = []) => ({ type: 'FeatureCollection' as const, version: 1, generatedAt: '2026-01-01T00:00:00Z', features });
const snap = (version: number): ProjectionSnapshot => ({
  version,
  generatedAt: '2026-01-01T00:00:00Z',
  flood: fc() as ProjectionSnapshot['flood'],
  roads: fc() as ProjectionSnapshot['roads'],
  settlements: fc() as ProjectionSnapshot['settlements'],
  routes: fc() as ProjectionSnapshot['routes'],
  shelters: fc() as ProjectionSnapshot['shelters'],
});

function fakeClient(over: Partial<ApiClient> = {}): ApiClient {
  return {
    submitEvents: vi.fn(async () => []),
    getEventStatus: vi.fn(async () => []),
    getProjections: vi.fn(async () => snap(1)),
    listEvents: vi.fn(async () => []),
    subscribe: vi.fn(() => () => {}),
    ...over,
  };
}

function Probe() {
  const p = useProjections();
  return <div data-testid="p" data-conn={p.connection} data-v={p.version ?? ''} />;
}
const mount = (client: ApiClient) =>
  render(<ApiProvider client={client} queryClient={makeQueryClient()}><Probe /></ApiProvider>);

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useProjections', () => {
  it('refetches when subscribe reports a version bump', async () => {
    let notify: (v: number) => void = () => {};
    let v = 1;
    const client = fakeClient({
      getProjections: vi.fn(async () => snap(v)),
      subscribe: vi.fn((cb) => { notify = cb; return () => {}; }),
    });
    mount(client);
    await waitFor(() => expect(screen.getByTestId('p').dataset.v).toBe('1'));
    expect(screen.getByTestId('p').dataset.conn).toBe('live');
    v = 2;
    act(() => notify(2));
    await waitFor(() => expect(screen.getByTestId('p').dataset.v).toBe('2'));
    expect(client.getProjections).toHaveBeenCalledTimes(2);
  });

  it('falls back to polling every 5s when subscribe throws', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const client = fakeClient({ subscribe: vi.fn(() => { throw new Error('no sse'); }) });
    mount(client);
    await waitFor(() => expect(screen.getByTestId('p').dataset.conn).toBe('polling'));
    const before = (client.getProjections as ReturnType<typeof vi.fn>).mock.calls.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(5100); });
    expect((client.getProjections as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before);
  });

  it('reports offline when fetching fails but keeps last snapshot', async () => {
    let fail = false;
    let notify: (v: number) => void = () => {};
    const client = fakeClient({
      getProjections: vi.fn(async () => { if (fail) throw new Error('net'); return snap(3); }),
      subscribe: vi.fn((cb) => { notify = cb; return () => {}; }),
    });
    mount(client);
    await waitFor(() => expect(screen.getByTestId('p').dataset.v).toBe('3'));
    fail = true;
    act(() => notify(4));
    await waitFor(() => expect(screen.getByTestId('p').dataset.conn).toBe('unavailable'));
    expect(screen.getByTestId('p').dataset.v).toBe('3');
  });
});
