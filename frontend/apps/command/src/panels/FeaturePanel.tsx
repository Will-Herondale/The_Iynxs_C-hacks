import type { ReactNode } from 'react';
import type { EventRecord, ProjectionSnapshot } from '@setu/contract';
import { Badge, EmptyState, Panel } from '@setu/ui';
import { useSelection, type FeatureKind } from '../app';
import { featureSourceEventIds, joinProvenance, useEvents, useProjections, useProvenance, type ProvenanceItem } from '../data';
import { formatDateTime, formatDeadline } from '../app/time';
import { ExplainBlock } from './Explain';
import { FLOOD_CAVEAT, FLOOD_SYNTHETIC_NOTE, MonoId, NotProvided } from './NotProvided';
import { ProvenanceView } from './Provenance';
import { ACCESS_TONE, ROAD_TONE, ROUTE_TONE, findFeature, label } from './model';

export interface FeaturePanelProps {
  snapshot?: ProjectionSnapshot;
  /** Server event records, for the "Based on these reports" lookup (live panel supplies them). */
  records?: EventRecord[];
  /** Called when a source event link is activated (e.g. to scroll the feed). Links also point to #incident-<id>. */
  onSelectEvent?: (clientEventId: string) => void;
  /** Pre-joined provenance (live panel supplies it with confirmed statuses from getEventStatus). */
  provenance?: ProvenanceItem[];
}

const TITLES: Record<FeatureKind, string> = { road: 'Road', settlement: 'Settlement', route: 'Route', shelter: 'Shelter', flood: 'Flood area', report: 'Report' };

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
  const { events } = useEvents();
  const { selected } = useSelection();
  const { items } = useProvenance(selected?.id);
  return <FeaturePanelView snapshot={snapshot} records={events} provenance={items} {...props} />;
}

export function FeaturePanelView({ snapshot, records, onSelectEvent, provenance }: FeaturePanelProps) {
  const { selected, select } = useSelection();

  if (!selected) {
    return (
      <div data-testid="feature-panel-empty">
        <Panel title="Feature details"><EmptyState title="Nothing selected">Click a feature on the map or a row in a list.</EmptyState></Panel>
      </div>
    );
  }
  const attrs = { 'data-testid': 'feature-panel', 'data-feature-kind': selected.kind, 'data-feature-id': selected.id } as const;
  const close = <button type="button" onClick={() => select(undefined)} aria-label="Close details">Close</button>;
  if (selected.kind === 'report') {
    return (
      <div {...attrs}>
        <Panel title={`Report ${selected.id}`}>
          <p data-testid="feature-panel-report">Report details are shown in Reports &amp; Events.</p>
          {close}
        </Panel>
      </div>
    );
  }
  const found = snapshot ? findFeature(snapshot, selected.kind, selected.id) : undefined;

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
      // Flood confidence is shown only when the server's own flood areas carry it; no spatial join is done here.
      const confs = [...new Set(snapshot.flood.features.map((f) => f.properties.confidence).filter(Boolean))];
      const roadFlood = p.status !== 'open' && confs.length ? (
        <span data-testid="road-flood-confidence">{confs.join(' / ')} <small>(flood areas in snapshot)</small></span>
      ) : undefined;
      body = (
        <Props rows={[
          ['roadId', <MonoId>{p.roadId}</MonoId>], ['name', p.name],
          ['status', <Badge tone={ROAD_TONE[p.status].tone} icon={ROAD_TONE[p.status].icon}>{label(p.status)}</Badge>],
          ...(p.kind ? [['kind', p.kind] as [string, ReactNode]] : []),
          ['passability', p.passability ?? <NotProvided field="passability" short />],
          ['reason', p.reason ?? <NotProvided field="reason" short />],
          ['original observation', events(p.sourceEventIds)],
          ...(roadFlood ? [['flood confidence', roadFlood] as [string, ReactNode]] : []),
          ['travel time', <NotProvided field="travel-time" />],
          ['water depth', <NotProvided field="depth" />],
          ['valid until', <NotProvided field="validity" />],
          ['updatedAt', <time dateTime={p.updatedAt}>{formatDateTime(p.updatedAt)}</time>],
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
            ['settlementId', <MonoId>{p.settlementId}</MonoId>], ['name', p.name], ['population', p.population], ['households', p.households],
            ['needs', p.needs.length ? p.needs.join(', ') : 'none'],
            ['accessibility', <Badge tone={ACCESS_TONE[p.accessibility].tone} icon={ACCESS_TONE[p.accessibility].icon}>{label(p.accessibility)}</Badge>],
            ['routes', serving.length ? serving.map((r) => <span key={r.routeId}>{link('route', r.routeId)}<small>({r.status}) </small></span>) : 'none'],
            ['shelters', shelterIds.length ? shelterIds.map((id) => link('shelter', id)) : 'none'],
            ['evacuationDeadline', p.evacuationDeadline ? <time dateTime={p.evacuationDeadline}>{formatDeadline(p.evacuationDeadline)}</time> : 'none set'],
            ['evacuationPriority', p.evacuationPriority ?? 'none set'],
            ['supporting observations', events(p.cutOffReason?.sourceEventIds ?? [])],
            ['latest safe departure', <NotProvided field="latest-departure" short />],
            ['first failing segment', <NotProvided field="first-failing-segment" short />],
          ]} />
          {p.cutOffReason && p.accessibility === 'cut_off' && (
            <ExplainBlock testId={`explain-cutoff-${p.settlementId}`} title="Why cut off" reason={p.cutOffReason} snapshot={snapshot} />
          )}
        </>
      );
      break;
    }
    case 'route': {
      const p = findFeature(snapshot, 'route', selected.id) as import('@setu/contract').RouteProps;
      body = (
        <>
        <Props rows={[
          ['routeId', p.routeId], ['kind', p.kind],
          ['from', link('settlement', p.from)], ['to', link('shelter', p.to)],
          ['etaMin', `${p.etaMin} min`],
          ['status', <Badge tone={ROUTE_TONE[p.status].tone} icon={ROUTE_TONE[p.status].icon}>{label(p.status)}</Badge>],
          ...(p.replacesRouteId ? [['replacesRouteId', <span>replaces {link('route', p.replacesRouteId)}</span>] as [string, ReactNode]] : []),
        ]} />
        {p.refusal && p.status === 'unavailable' && (
          <ExplainBlock testId={`explain-refusal-${p.routeId}`} title="Why this route is refused" reason={p.refusal} snapshot={snapshot} />
        )}
        </>
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
      body = (
        <>
          <Props rows={[
            ['areaId', <MonoId>{p.areaId}</MonoId>], ['depthCm', p.depthCm], ['severity', `${p.severity} / 5`],
            ['confidence', p.confidence
              ? <Badge tone={p.confidence === 'observed' ? 'info' : 'warning'} icon={p.confidence === 'observed' ? '◉' : '◌'}>{p.confidence}</Badge>
              : <NotProvided field="confidence" short />],
          ]} />
          <p data-testid="flood-synthetic-note" style={{ margin: '8px 0 0' }}><strong>SYNTHETIC</strong> — {FLOOD_SYNTHETIC_NOTE}</p>
          <p data-testid="flood-caveat" style={{ margin: '4px 0 0', fontWeight: 600 }}>{FLOOD_CAVEAT}</p>
        </>
      );
      break;
    }
  }

  return (
    <div {...attrs}>
      <Panel title={`${TITLES[selected.kind]} ${selected.id}`}>
        {body}
        {(selected.kind === 'road' || selected.kind === 'settlement' || selected.kind === 'route') && (
          <ProvenanceView featureId={selected.id} items={provenance ?? joinProvenance(featureSourceEventIds(snapshot, selected.id), records ?? [], {}, snapshot.version)} />
        )}
        <p style={{ marginBottom: 0 }}>{close}</p>
      </Panel>
    </div>
  );
}
