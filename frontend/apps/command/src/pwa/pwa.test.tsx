// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StaleBanner } from './StaleBanner';
import { staleLevel } from './staleness';

afterEach(cleanup);
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

describe('Command StaleBanner', () => {
  it('thresholds', () => {
    expect(staleLevel(16 * 60_000)).toBe('amber');
    expect(staleLevel(61 * 60_000)).toBe('red');
  });
  it('shows nothing when fresh, amber and red when aged', () => {
    const now = Date.now();
    const { rerender } = wrap(<StaleBanner updatedAt={now - 60_000} now={now} />);
    expect(screen.queryByTestId('stale-warning')).toBeNull();
    rerender(<QueryClientProvider client={new QueryClient()}><StaleBanner updatedAt={now - 20 * 60_000} now={now} /></QueryClientProvider>);
    expect(screen.getByTestId('stale-warning').getAttribute('data-level')).toBe('amber');
    rerender(<QueryClientProvider client={new QueryClient()}><StaleBanner updatedAt={now - 2 * 3600_000} now={now} /></QueryClientProvider>);
    expect(screen.getByTestId('stale-warning').getAttribute('data-level')).toBe('red');
  });
});
