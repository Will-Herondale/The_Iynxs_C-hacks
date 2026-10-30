// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MapLayerControls, MapLayersProvider, useMapLayers } from './toggles';
import { TOGGLE_IDS, toggleDataClass } from './layers';
import { Legend } from './Legend';

afterEach(cleanup);

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

describe('data class tags', () => {
  it('tags every layer toggle with a single-source class; flood is EXPERIMENTAL', () => {
    render(<MapLayersProvider><MapLayerControls /></MapLayersProvider>);
    for (const id of TOGGLE_IDS) expect(screen.getByTestId(`layer-toggle-${id}`).closest('label')?.getAttribute('data-class')).toBe(toggleDataClass(id));
    expect(toggleDataClass('roads')).toBe('REAL');
    expect(toggleDataClass('shelters')).toBe('SYNTHETIC');
    expect(toggleDataClass('flood')).toBe('EXPERIMENTAL');
    expect(screen.getByTestId('layer-toggle-flood').closest('label')?.textContent).toContain('Modelled · EXPERIMENTAL');
  });
});

describe('Legend', () => {
  it('shows unverified routes (dashed amber ?), pre-identified shelters and class tags', () => {
    render(<Legend />);
    const items = screen.getAllByTestId('map-legend-item');
    expect(items.find((i) => i.getAttribute('data-route-state') === 'not-verified')?.textContent).toContain('Route (not verified)');
    expect(items.find((i) => i.getAttribute('data-route-state') === 'refused')?.textContent).toContain('✕');
    expect(items.find((i) => i.getAttribute('data-shelter-status') === 'pre-identified')?.textContent).toContain('Pre-identified · not confirmed');
    const legend = screen.getByTestId('map-legend');
    expect(legend.textContent).not.toContain('Evacuation (active)');
    expect(legend.querySelector('[data-class="EXPERIMENTAL"]')).toBeTruthy();
    expect(legend.querySelector('[data-class="REAL"]')).toBeTruthy();
  });

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
