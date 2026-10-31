/**
 * Label strategy (chosen): HTML overlay labels — no glyph PBFs, no sprite, no network.
 * MapLibre `text-field` needs glyph URLs, so the style never uses it. createHtmlLabels positions
 * absolutely-placed <div>s over the map canvas using map.project() and re-places them on move/zoom.
 */
import type { LngLat } from './types.js';

export interface LabelFeature {
  id: string;
  lngLat: LngLat;
  text: string;
  /** Used for styling + data-label-kind; e.g. 'settlement' | 'shelter' | 'bridge'. */
  kind?: string;
  /** Label hidden below this zoom. Default 0. */
  minZoom?: number;
  /** Higher wins when labels collide. Default 0. */
  priority?: number;
}

export interface HtmlLabelMap {
  project(l: LngLat): { x: number; y: number };
  getZoom(): number;
  getCanvasContainer(): HTMLElement;
  on(type: string, fn: () => void): unknown;
  off(type: string, fn: () => void): unknown;
}

export interface HtmlLabelOptions {
  className?: string;
  /** Collision cell size in px. Default 90x18 approx boxes. */
  boxWidth?: number;
  boxHeight?: number;
}

export interface HtmlLabelHandle {
  update(): void;
  setFeatures(features: LabelFeature[]): void;
  destroy(): void;
}

/** Pick which labels to show: zoom filter, then greedy priority-ordered box declutter. Pure (testable). */
export function selectVisibleLabels(
  features: LabelFeature[],
  zoom: number,
  project: (l: LngLat) => { x: number; y: number },
  box = { w: 90, h: 18 },
): { feature: LabelFeature; x: number; y: number }[] {
  const out: { feature: LabelFeature; x: number; y: number }[] = [];
  const sorted = features
    .filter((f) => zoom >= (f.minZoom ?? 0))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
  for (const f of sorted) {
    const { x, y } = project(f.lngLat);
    const clash = out.some((o) => Math.abs(o.x - x) < box.w && Math.abs(o.y - y) < box.h);
    if (!clash) out.push({ feature: f, x, y });
  }
  return out;
}

export function createHtmlLabels(map: HtmlLabelMap, features: LabelFeature[], opts: HtmlLabelOptions = {}): HtmlLabelHandle {
  let current = features;
  const root = document.createElement('div');
  root.className = opts.className ?? 'setu-html-labels';
  root.setAttribute('aria-hidden', 'true');
  Object.assign(root.style, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden' });
  map.getCanvasContainer().appendChild(root);

  const update = () => {
    const visible = selectVisibleLabels(current, map.getZoom(), (l) => map.project(l), {
      w: opts.boxWidth ?? 90,
      h: opts.boxHeight ?? 18,
    });
    root.replaceChildren(
      ...visible.map(({ feature, x, y }) => {
        const el = document.createElement('div');
        el.textContent = feature.text;
        el.dataset.labelKind = feature.kind ?? 'place';
        el.dataset.labelId = feature.id;
        Object.assign(el.style, {
          position: 'absolute',
          left: `${x}px`,
          top: `${y}px`,
          transform: 'translate(-50%, 4px)',
          font: '600 11px/1.2 system-ui, sans-serif',
          color: '#1f2933',
          textShadow: '0 0 3px #fff, 0 0 3px #fff, 0 0 3px #fff',
          whiteSpace: 'nowrap',
        });
        return el;
      }),
    );
  };

  map.on('move', update);
  map.on('zoom', update);
  update();

  return {
    update,
    setFeatures(f) {
      current = f;
      update();
    },
    destroy() {
      map.off('move', update);
      map.off('zoom', update);
      root.remove();
    },
  };
}
