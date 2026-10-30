import { Panel } from '@setu/ui';
import { LAYER_NAMES, useLayerVisibility, type LayerName } from '../app';

const LABELS: Record<LayerName, string> = {
  flood: 'Flood extent',
  roads: 'Roads',
  settlements: 'Settlements',
  routes: 'Routes',
  shelters: 'Shelters',
};

export function LayerControls() {
  const { visible, toggle } = useLayerVisibility();
  return (
    <Panel title="Layers">
      <fieldset aria-label="Map layers" style={{ border: 0, margin: 0, padding: 0 }}>
        {LAYER_NAMES.map((layer) => (
          <label key={layer} style={{ display: 'block', padding: '2px 0' }}>
            <input
              type="checkbox"
              data-testid={`layer-toggle-${layer}`}
              checked={visible[layer]}
              aria-checked={visible[layer]}
              onChange={() => toggle(layer)}
            />{' '}
            {LABELS[layer]}
          </label>
        ))}
      </fieldset>
    </Panel>
  );
}
