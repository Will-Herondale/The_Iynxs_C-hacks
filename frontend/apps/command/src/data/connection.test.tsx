// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { stubApi } from '../testing/stubApi';
import { ApiProvider, useProjections } from '.';

function Probe() {
  const { connection } = useProjections();
  return <span data-testid="c">{connection}</span>;
}

describe('connection state follows navigator.onLine', () => {
  it('goes offline on window offline and back live on online', async () => {
    render(
      <ApiProvider client={stubApi()}>
        <Probe />
      </ApiProvider>,
    );
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByTestId('c').textContent).toBe('live');
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByTestId('c').textContent).toBe('offline');
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(screen.getByTestId('c').textContent).toBe('live');
  });
});
