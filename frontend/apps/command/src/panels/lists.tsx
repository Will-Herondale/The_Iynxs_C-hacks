import type { ReactNode } from 'react';
import type { ProjectionSnapshot } from '@setu/contract';
import { Badge, EmptyState, Panel } from '@setu/ui';
import { useSelection, type FeatureKind } from '../app';
import { useProjections } from '../data';
import {
  ACCESS_TONE, ROAD_TONE, ROUTE_TONE, label, roads, routes, settlements, shelters,
} from './model';

interface ListProps {
  snapshot?: ProjectionSnapshot;
}

/** Wrap a snapshot-taking view into a live component bound to useProjections(). */
function live(View: (p: ListProps) => ReactNode) {
  return function Live() {
    const { snapshot } = useProjections();
    return <>{View({ snapshot })}</>;
  };
}

function Row({ testId, kind, id, attrs, children }: {
  testId: string; kind: FeatureKind; id: string; attrs?: Record<string, string>; children: ReactNode;
}) {
  const { selected, select } = useSelection();
  const isSel = selected?.kind === kind && selected.id === id;
  return (
    <li>
      <button
        type="button"
        className="panel-row"
        data-testid={testId}
        aria-pressed={isSel}
        onClick={() => select({ kind, id })}
        style={{
          display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left',
          padding: '6px 8px', cursor: 'pointer', color: 'inherit', background: isSel ? 'rgba(120,160,255,.2)' : 'transparent',
          border: 0, borderLeft: `3px solid ${isSel ? 'currentColor' : 'transparent'}`,
        }}
        {...attrs}
      >
        {children}
      </button>
    </li>
  );
}

const listStyle = { listStyle: 'none', margin: 0, padding: 0 } as const;

function Block({ title, empty, children }: { title: string; empty: boolean; children: ReactNode }) {
  return (
    <Panel title={title}>
      {empty ? <EmptyState title="No data yet" /> : <ul style={listStyle}>{children}</ul>}
    </Panel>
  );
}

export function RoadListView({ snapshot: s }: ListProps) {
  const items = s ? roads(s) : [];
  return (
    <Block title="Roads" empty={items.length === 0}>
      {items.map((r) => (
        <Row key={r.roadId} testId={`road-row-${r.roadId}`} kind="road" id={r.roadId} attrs={{ 'data-status': r.status }}>
          <span><strong>{r.roadId}</strong> {r.name}</span>
          <Badge tone={ROAD_TONE[r.status].tone} icon={ROAD_TONE[r.status].icon}>{label(r.status)}</Badge>
        </Row>
      ))}
    </Block>
  );
}

export function SettlementListView({ snapshot: s }: ListProps) {
  const items = s ? settlements(s) : [];
  return (
    <Block title="Settlements" empty={items.length === 0}>
      {items.map((p) => (
        <Row key={p.settlementId} testId={`settlement-row-${p.settlementId}`} kind="settlement" id={p.settlementId} attrs={{ 'data-accessibility': p.accessibility }}>
          <span><strong>{p.settlementId}</strong> {p.name}</span>
          <Badge tone={ACCESS_TONE[p.accessibility].tone} icon={ACCESS_TONE[p.accessibility].icon}>{label(p.accessibility)}</Badge>
        </Row>
      ))}
    </Block>
  );
}

export function RouteListView({ snapshot: s }: ListProps) {
  const items = s ? routes(s) : [];
  return (
    <Block title="Routes" empty={items.length === 0}>
      {items.map((p) => (
        <Row key={p.routeId} testId={`route-row-${p.routeId}`} kind="route" id={p.routeId} attrs={{ 'data-status': p.status }}>
          <span>
            <strong>{p.routeId}</strong> {p.from}→{p.to} · {p.etaMin} min
            {p.replacesRouteId ? ` · replaces ${p.replacesRouteId}` : ''}
          </span>
          <Badge tone={ROUTE_TONE[p.status].tone} icon={ROUTE_TONE[p.status].icon}>{label(p.status)}</Badge>
        </Row>
      ))}
    </Block>
  );
}

export function ShelterListView({ snapshot: s }: ListProps) {
  const items = s ? shelters(s) : [];
  return (
    <Block title="Shelters" empty={items.length === 0}>
      {items.map((p) => (
        <Row key={p.shelterId} testId={`shelter-row-${p.shelterId}`} kind="shelter" id={p.shelterId} attrs={{ 'data-open': String(p.open) }}>
          <span><strong>{p.shelterId}</strong> {p.name} · {p.occupancy}/{p.capacity}</span>
          <Badge tone={p.open ? 'success' : 'danger'} icon={p.open ? '✓' : '✕'}>{p.open ? 'open' : 'closed'}</Badge>
        </Row>
      ))}
    </Block>
  );
}
export const RoadList = live(RoadListView);
export const SettlementList = live(SettlementListView);
export const RouteList = live(RouteListView);
export const ShelterList = live(ShelterListView);
