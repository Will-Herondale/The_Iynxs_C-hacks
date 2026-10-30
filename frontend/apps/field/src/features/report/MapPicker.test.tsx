// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MapPicker } from './MapPicker.js';

afterEach(cleanup);

describe('MapPicker', () => {
  it('degrades to a notice when WebGL/maplibre cannot start, never blocking the form', async () => {
    render(<MapPicker value={null} onPick={() => {}} />);
    expect(screen.getByTestId('map-picker')).toBeTruthy();
    await waitFor(() => expect(screen.getByTestId('map-picker-unavailable')).toBeTruthy(), { timeout: 5000 });
  });
});
