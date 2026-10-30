import { PassabilityLegend } from '@setu/ui';
import { COLORS } from './layers';
import { OBSERVATION_STATES } from './observations';

type Swatch = 'line' | 'dashed' | 'dot' | 'halo' | 'area' | 'modelled' | 'uncertain' | 'cross' | 'ring' | 'diamond';
interface Item { label: string; color: string; swatch: Swatch; synthetic?: boolean }

export const LEGEND_ROWS: { title: string; items: Item[] }[] = [
  {
    title: 'Flood',
    items: [
      { label: 'Flood — observed (solid)', color: COLORS.observedFlood, swatch: 'area' },
      { label: 'Flood — modelled (dashed)', color: COLORS.modelledFlood, swatch: 'modelled', synthetic: true },
      { label: 'Flood — uncertain', color: COLORS.warning, swatch: 'uncertain' },
    ],
  },
  {
    title: 'Roads',
    items: [
      { label: 'Open', color: COLORS.safe, swatch: 'line' },
      { label: 'Partial (warning)', color: COLORS.warning, swatch: 'line' },
      { label: 'Blocked / impassable', color: COLORS.critical, swatch: 'dashed' },
      { label: 'Bridge impassable', color: COLORS.critical, swatch: 'cross' },
      { label: 'Unknown', color: COLORS.grey, swatch: 'line' },
      { label: 'Blocking this selection', color: COLORS.blocking, swatch: 'line' },
    ],
  },
  {
    title: 'Settlements',
    items: [
      { label: 'Accessible', color: COLORS.safe, swatch: 'dot' },
      { label: 'Limited', color: COLORS.warning, swatch: 'dot' },
      { label: 'Cut off (grey, red halo)', color: COLORS.grey, swatch: 'halo' },
    ],
  },
  {
    title: 'Routes',
    items: [
      { label: 'Evacuation (active)', color: COLORS.safe, swatch: 'line' },
      { label: 'Supply', color: COLORS.routeSupply, swatch: 'line' },
      { label: 'Recalculated (alternative)', color: COLORS.safe, swatch: 'line' },
      { label: 'Refused (unavailable)', color: COLORS.grey, swatch: 'dashed' },
    ],
  },
  {
    title: 'Reports (observations)',
    items: [
      { label: OBSERVATION_STATES.applied.label, color: OBSERVATION_STATES.applied.color, swatch: 'dot' },
      { label: OBSERVATION_STATES.accepted.label, color: OBSERVATION_STATES.accepted.color, swatch: 'ring' },
      { label: OBSERVATION_STATES.conflict.label, color: OBSERVATION_STATES.conflict.color, swatch: 'diamond' },
      { label: OBSERVATION_STATES.rejected.label, color: OBSERVATION_STATES.rejected.color, swatch: 'cross' },
    ],
  },
  {
    title: 'Shelters',
    items: [
      { label: 'Shelter (open)', color: COLORS.shelterOpen, swatch: 'dot' },
      { label: 'Shelter (closed)', color: COLORS.shelterClosed, swatch: 'dot' },
    ],
  },
];

function Mark({ color, swatch }: { color: string; swatch: Swatch }) {
  const base = { display: 'inline-block', flex: 'none' } as const;
  switch (swatch) {
    case 'line':
      return <span aria-hidden style={{ ...base, width: 20, height: 4, background: color, borderRadius: 2 }} />;
    case 'dashed':
      return <span aria-hidden style={{ ...base, width: 20, height: 0, borderTop: `4px dashed ${color}` }} />;
    case 'dot':
      return <span aria-hidden style={{ ...base, width: 12, height: 12, borderRadius: '50%', background: color, border: '2px solid #fff', boxSizing: 'border-box', boxShadow: '0 0 0 1px #888' }} />;
    case 'ring':
      return <span aria-hidden style={{ ...base, width: 12, height: 12, borderRadius: '50%', background: '#fff', border: `3px solid ${color}`, boxSizing: 'border-box' }} />;
    case 'diamond':
      return <span aria-hidden style={{ ...base, width: 10, height: 10, background: color, transform: 'rotate(45deg)', margin: 1 }} />;
    case 'halo':
      return <span aria-hidden style={{ ...base, width: 16, height: 16, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${COLORS.critical}` }} />;
    case 'modelled':
      return <span aria-hidden style={{ ...base, width: 18, height: 12, background: `${color}55`, border: `2px dashed ${COLORS.water}`, boxSizing: 'border-box' }} />;
    case 'uncertain':
      return <span aria-hidden style={{ ...base, width: 18, height: 12, background: `${color}22`, border: `2px dashed ${color}`, boxSizing: 'border-box' }} />;
    case 'cross':
      return <span aria-hidden style={{ ...base, width: 16, height: 16, borderRadius: '50%', background: color, color: '#fff', fontSize: 12, lineHeight: '16px', textAlign: 'center', fontWeight: 700 }}>✕</span>;
    case 'area':
      return <span aria-hidden style={{ ...base, width: 18, height: 12, background: `${color}aa`, border: `2px solid ${color}`, boxSizing: 'border-box' }} />;
  }
}

/** Local stand-in until @setu/ui exports SyntheticTag; same wording and role. */
function SyntheticNote() {
  return (
    <span
      data-testid="map-legend-synthetic"
      title="Synthetic scenario data. Not a real observation or a validated simulation."
      style={{ marginLeft: 4, padding: '0 4px', border: `1px solid ${COLORS.review}`, color: COLORS.review, borderRadius: 3, fontSize: 10, fontWeight: 700, letterSpacing: 0.5 }}
    >
      SYNTHETIC
    </span>
  );
}

export function Legend() {
  // Collapsed on short screens so the legend never covers the map at 1366x768.
  const startOpen = typeof window === 'undefined' ? true : window.innerHeight >= 800;
  return (
    <div
      data-testid="map-legend"
      style={{
        position: 'absolute', left: 8, bottom: 24, zIndex: 2, maxWidth: 260, maxHeight: '60%', overflowY: 'auto', padding: '6px 10px',
        background: 'rgba(255,255,255,0.94)', color: '#111', borderRadius: 6, fontSize: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }}
    >
      <details open={startOpen}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Legend</summary>
        <PassabilityLegend />
        {LEGEND_ROWS.map((g) => (
          <div key={g.title} style={{ marginTop: 6 }}>
            <div style={{ fontWeight: 600 }}>{g.title}</div>
            {g.items.map((i) => (
              <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                <Mark color={i.color} swatch={i.swatch} />
                <span>{i.label}{i.synthetic && <SyntheticNote />}</span>
              </div>
            ))}
            {g.title === 'Flood' && (
              <div data-testid="map-legend-flood-caveat" style={{ marginTop: 3, fontSize: 11, color: '#444' }}>
                Modelled flood is a DEM-threshold approximation — not a validated hydraulic simulation. Scenario-derived data is SYNTHETIC.
              </div>
            )}
          </div>
        ))}
      </details>
    </div>
  );
}
