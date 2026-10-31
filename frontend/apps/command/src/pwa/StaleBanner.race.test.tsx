// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PROJECTIONS_KEY } from '../data';
import { StaleBanner } from './StaleBanner';

afterEach(cleanup);

describe('StaleBanner does not race the projections query', () => {
  it('registers no query/observer of its own on the projections key (an observer without queryFn broke invalidation refetches)', () => {
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><StaleBanner updatedAt={Date.now() - 2 * 3600_000} now={Date.now()} /></QueryClientProvider>);
    expect(qc.getQueryCache().find({ queryKey: PROJECTIONS_KEY })).toBeUndefined();
    expect(screen.getByTestId('stale-warning').getAttribute('data-level')).toBe('red');
  });

  it('shows nothing until it is given an update time', () => {
    const qc = new QueryClient();
    render(<QueryClientProvider client={qc}><StaleBanner /></QueryClientProvider>);
    expect(screen.queryByTestId('stale-warning')).toBeNull();
  });
});
