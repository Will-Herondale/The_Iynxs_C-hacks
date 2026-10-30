// @vitest-environment jsdom
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { stubApi } from '../testing/stubApi';

vi.mock('../map', async () => {
  const t = await import('../map/toggles');
  return { MapLayersProvider: t.MapLayersProvider, MapView: () => <div data-testid="map" /> };
});

import { App } from './App';

afterEach(cleanup);

describe('shell layout', () => {
  it('keeps the workspace as the flexible last row even when the ApiStatus strip renders', async () => {
    const { container } = render(<App client={stubApi()} />);
    await waitFor(() => expect(screen.getByText(/No data yet/)).toBeTruthy());
    const root = container.querySelector('.cmd-root')!;
    expect(root.lastElementChild?.classList.contains('cmd-workspace')).toBe(true);
    // 4 children (header, status, summary, workspace): a fixed 3-row grid pushed the workspace below the viewport.
    const css = readFileSync(resolve(__dirname, 'app.css'), 'utf8');
    const rule = css.match(/\.cmd-root \{[^}]*\}/)![0];
    expect(rule).toContain('flex-direction: column');
    expect(rule).not.toContain('grid-template-rows');
    expect(css).toMatch(/\.cmd-root > \.cmd-workspace \{[^}]*flex: 1 1 0[^}]*min-height: 0/);
  });
});
