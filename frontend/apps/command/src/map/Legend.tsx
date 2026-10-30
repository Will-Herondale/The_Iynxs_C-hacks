import { PassabilityLegend } from '@setu/ui';
import { COLORS } from './layers';

type Swatch = 'line' | 'dashed' | 'dot' | 'halo' | 'area' | 'uncertain' | 'cross';
const ROWS: { title: string; items: { label: string; color: string; swatch: Swatch }[] }[] = [
  {
    title: 'Roads',
    items: [
      { label: 'Open', color: COLORS.roadOpen, swatch: 'line' },
      { label: 'Partial', color: COLORS.roadPartial, swatch: 'line' },
      { label: 'Blocked / impassable', color: COLORS.roadBlocked, swatch: 'dashed' },
      { label: 'Bridge impassable', color: COLORS.roadBlocked, swatch: 'cross' },
      { label: 'Unknown', color: COLORS.roadUnknown, swatch: 'line' },
      { label: 'Blocking this selection', color: COLORS.blocking, swatch: 'line' },
    ],
  },
  {
    title: 'Settlements',
    items: [
      { label: 'Accessible', color: COLORS.accessible, swatch: 'dot' },
      { label: 'Limited', color: COLORS.limited, swatch: 'dot' },
      { label: 'Cut off', color: COLORS.cutOff, swatch: 'halo' },
    ],
  },
  {
    title: 'Routes',
    items: [
      { label: 'Evacuation', color: COLORS.evacuation, swatch: 'line' },
      { label: 'Supply', color: COLORS.supply, swatch: 'line' },
      { label: 'Recalculated', color: COLORS.recalculated, swatch: 'line' },
      { label: 'Refused (unavailable)', color: COLORS.roadBlocked, swatch: 'dashed' },
    ],
  },
  {
    title: 'Other',
    items: [
      { label: 'Flooded (darker = more severe)', color: COLORS.flood, swatch: 'area' },
      { label: 'Flood uncertain', color: COLORS.floodUncertain, swatch: 'uncertain' },
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
      return <span aria-hidden style={{ ...base, width: 12, height: 12, borderRadius: '50%', background: color, border: '2px solid #fff', boxSizing: 'border-box' }} />;
    case 'halo':
      return <span aria-hidden style={{ ...base, width: 16, height: 16, borderRadius: '50%', background: color, boxShadow: `0 0 0 3px ${color}55` }} />;
    case 'uncertain':
      return <span aria-hidden style={{ ...base, width: 18, height: 12, background: `${color}22`, border: `2px dashed ${color}`, boxSizing: 'border-box' }} />;
    case 'cross':
      return <span aria-hidden style={{ ...base, width: 16, height: 16, borderRadius: '50%', background: color, color: '#fff', fontSize: 12, lineHeight: '16px', textAlign: 'center', fontWeight: 700 }}>✕</span>;
    case 'area':
      return <span aria-hidden style={{ ...base, width: 18, height: 12, background: `${color}88`, border: `1px solid ${color}` }} />;
  }
}

export function Legend() {
  return (
    <div
      data-testid="map-legend"
      style={{
        position: 'absolute', left: 8, bottom: 24, zIndex: 2, maxWidth: 240, padding: '6px 10px',
        background: 'rgba(255,255,255,0.94)', color: '#111', borderRadius: 6, fontSize: 12,
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      }}
    >
      <PassabilityLegend />
      <details>
      <summary style={{ cursor: 'pointer', fontWeight: 600, marginTop: 4 }}>More symbols</summary>
      {ROWS.map((g) => (
        <div key={g.title} style={{ marginTop: 6 }}>
          <div style={{ fontWeight: 600 }}>{g.title}</div>
          {g.items.map((i) => (
            <div key={i.label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Mark color={i.color} swatch={i.swatch} />
              <span>{i.label}</span>
            </div>
          ))}
        </div>
      ))}
      </details>
    </div>
  );
}
