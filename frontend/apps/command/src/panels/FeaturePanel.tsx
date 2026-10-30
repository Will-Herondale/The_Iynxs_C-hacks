import type { ReactNode } from 'react';
import type { ProjectionSnapshot } from '@setu/contract';
import { Badge, EmptyState, Panel } from '@setu/ui';
import { useSelection, type FeatureKind } from '../app';
import { useProjections } from '../data';
import { ACCESS_TONE, ROAD_TONE, ROUTE_TONE, findFeature, label } from './model';

export interface FeaturePanelProps {
  snapshot?: ProjectionSnapshot;
  /** Called when a source event link is activated (e.g. to scroll the feed). Links also point to #incident-<id>. */
  onSelectEvent?: (clientEventId: string) => void;
}

const TITLES: Record<FeatureKind, string> = { road: 'Road', settlement: 'Settlement', route: 'Route', shelter: 'Shelter', flood: 'Flood area' };

function Props({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', gap: '4px 12px', margin: 0 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt style={{ opacity: 0.7 }}>{k}</dt>
          <dd style={{ margin: 0 }} data-prop={k}>{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Live panel: renders the current server snapshot from useProjections(). */
export function FeaturePanel(props: Omit<FeaturePanelProps, 'snapshot'>) {
  const { snapshot } = useProjections();
  return <FeaturePanelView snapshot={snapshot} {...props} />;
}

export function FeaturePanelView({ snapshot, onSelectEvent }: FeaturePanelProps) {
  const { selected, select } = useSelection();

  if (!selected) {
    return (
      <div data-testid="feature-panel-empty">
        <Panel title="Feature details"><EmptyState title="Nothing selected">Click a feature on the map or a row in a list.</EmptyState></Panel>
      </div>
    );
  }
  const attrs = { 'data-testid': 'feature-panel', 'data-feature-kind': selected.kind, 'data-feature-id': selected.id } as const;
  const found = snapshot ? findFeature(snapshot, selected.kind, selected.id) : undefined;
  const close = <button type="button" onClick={() => select(undefined)} aria-label="Close details">Close</button>;

  if (!snapshot || !found) {
    return (
      <div {...attrs}>
        <Panel title={`${TITLES[selected.kind]} ${selected.id}`}>
          <EmptyState title={snapshot ? 'Not in the current snapshot' : 'Loading…'} />
          {close}
        </Panel>
      </div>
    );
  }

  const link = (kind: FeatureKind, id: string) => (
    <button key={`${kind}-${id}`} type="button" data-testid={`link-${kind}-${id}`} onClick={() => select({ kind, id })} style={{ marginRight: 6 }}>{id}</button>
  );
  const events = (ids: string[]) =>
    ids.length === 0 ? 'none' : ids.map((id) => (
      <a key={id} href={`#incident-${id}`} data-testid="source-event-link" data-client-event-id={id} onClick={() => onSelectEvent?.(id)} style={{ marginRight: 6 }}>{id}</a>
    ));

  let body: ReactNode;
  switch (selected.kind) {
    case 'road': {
      const p = findFeature(snapshot, 'road', selected.id) as import('@setu/contract').RoadProps;
      body = (
        <Props rows={[
          ['roadId', p.roadId], ['name', p.name],
          ['status', <Badge tone={ROAD_TONE[p.status].tone} icon={ROAD_TONE[p.status].icon}>{label(p.status)}</Badge>],
          ['updatedAt', p.updatedAt], ['sourceEventIds', events(p.sourceEventIds)],
        ]} />
      );
      break;
    }
    case 'settlement': {
      const p = findFeature(snapshot, 'settlement', selected.id) as import('@setu/contract').SettlementProps;
      const serving = snapshot.routes.features.filter((f) => f.properties.from === p.settlementId).map((f) => f.properties);
      const shelterIds = [...new Set(serving.map((r) => r.to))];
      body = (
        <>
          <Props rows={[
            ['settlementId', p.settlementId], ['name', p.name], ['population', p.population], ['households', p.households],
            ['needs', p.needs.length ? p.needs.join(', ') : 'none'],
            ['accessibility', <Badge tone={ACCESS_TONE[p.accessibility].tone} icon={ACCESS_TONE[p.accessibility].icon}>{label(p.accessibility)}</Badge>],
            ['routes', serving.length ? serving.map((r) => <span key={r.routeId}>{link('route', r.routeId)}<small>({r.status}) </small></span>) : 'none'],
            ['shelters', shelterIds.length ? shelterIds.map((id) => link('shelter', id)) : 'none'],
          ]} />
        </>
      );
      break;
    }
    case 'route': {
      const p = findFeature(snapshot, 'route', selected.id) as import('@setu/contract').RouteProps;
      body = (
        <Props rows={[
          ['routeId', p.routeId], ['kind', p.kind],
          ['from', link('settlement', p.from)], ['to', link('shelter', p.to)],
          ['etaMin', `${p.etaMin} min`],
          ['status', <Badge tone={ROUTE_TONE[p.status].tone} icon={ROUTE_TONE[p.status].icon}>{label(p.status)}</Badge>],
          ...(p.replacesRouteId ? [['replacesRouteId', <span>replaces {link('route', p.replacesRouteId)}</span>] as [string, ReactNode]] : []),
        ]} />
      );
      break;
    }
    case 'shelter': {
      const p = findFeature(snapshot, 'shelter', selected.id) as import('@setu/contract').ShelterProps;
      const serving = snapshot.routes.features.filter((f) => f.properties.to === p.shelterId).map((f) => f.properties);
      body = (
        <Props rows={[
          ['shelterId', p.shelterId], ['name', p.name],
          ['capacity', p.capacity], ['occupancy', `${p.occupancy} / ${p.capacity}`],
          ['open', <Badge tone={p.open ? 'success' : 'danger'} icon={p.open ? '✓' : '✕'}>{p.open ? 'open' : 'closed'}</Badge>],
          ['routes in', serving.length ? serving.map((r) => link('route', r.routeId)) : 'none'],
        ]} />
      );
      break;
    }
    case 'flood': {
      const p = findFeature(snapshot, 'flood', selected.id) as import('@setu/contract').FloodProps;
      body = <Props rows={[['areaId', p.areaId], ['depthCm', p.depthCm], ['severity', `${p.severity} / 5`]]} />;
      break;
    }
  }

  return (
    <div {...attrs}>
      <Panel title={`${TITLES[selected.kind]} ${selected.id}`}>
        {body}
        <p style={{ marginBottom: 0 }}>{close}</p>
      </Panel>
    </div>
  );
}
