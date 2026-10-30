// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MapLayerControls, MapLayersProvider, useMapLayers } from './toggles';
import { TOGGLE_IDS } from './layers';
import { Legend } from './Legend';

function Probe() {
  const { visible } = useMapLayers();
  return <output data-testid="probe">{JSON.stringify(visible)}</output>;
}

describe('MapLayerControls', () => {
  it('renders one independent checkbox per layer', () => {
    render(<MapLayersProvider><MapLayerControls /><Probe /></MapLayersProvider>);
    for (const id of TOGGLE_IDS) expect((screen.getByTestId(`layer-toggle-${id}`) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByTestId('layer-toggle-flood'));
    const state = JSON.parse(screen.getByTestId('probe').textContent ?? '{}') as Record<string, boolean>;
    expect(state.flood).toBe(false);
    expect(state.blocked).toBe(true);
    expect(state.routes).toBe(true);
    expect((screen.getByTestId('layer-toggle-flood') as HTMLInputElement).getAttribute('aria-checked')).toBe('false');
  });
});

describe('Legend', () => {
  it('labels observed vs modelled flood, marks scenario data SYNTHETIC and carries the caveat', () => {
    render(<Legend />);
    const legend = screen.getByTestId('map-legend');
    expect(legend.textContent).toContain('Flood — observed');
    expect(legend.textContent).toContain('Flood — modelled');
    expect(screen.getByTestId('map-legend-synthetic').textContent).toBe('SYNTHETIC');
    expect(screen.getByTestId('map-legend-flood-caveat').textContent).toContain('not a validated hydraulic simulation');
    expect(legend.textContent).toContain('Requires review');
    expect(legend.textContent).toContain('Cut off');
  });
});
