import { useMemo, useState } from 'react';
import type { ProjectionSnapshot, RouteProps } from '@setu/contract';
import { Badge, EmptyState, Panel } from '@setu/ui';
import { useSelection } from '../../app';
import { useProjections } from '../../data';
import { ExplainBlock } from '../../panels/Explain';
import { MonoId } from '../../panels/NotProvided';
import { ROUTE_TONE, label } from '../../panels/model';
import { allRoutes, filterRoutes, hasNoSafeRoute } from './model';

const small = { fontSize: '0.85em', opacity: 0.85 } as const;

export function NoSafeRoute({ settlementId, name }: { settlementId: string; name: string }) {
  return (
    <div role="alert" data-testid={`no-safe-route-${settlementId}`} style={{ border: '2px solid #c62828', borderRadius: 6, padding: '8px 12px', margin: '6px 0' }}>
      <strong>⛔ No safe route</strong> — {name} (<MonoId>{settlementId}</MonoId>): every evacuation route is unavailable according to the server.
    </div>
  );
}

export function RoutesSectionView({ snapshot }: { snapshot?: ProjectionSnapshot }) {
  const { selected, select } = useSelection();
  const [origin, setOrigin] = useState('');
  const [destination, setDestination] = useState('');

  const routes = useMemo(() => (snapshot ? allRoutes(snapshot) : []), [snapshot]);
  const settlements = snapshot?.settlements.features.map((f) => f.properties) ?? [];
  const shelters = snapshot?.shelters.features.map((f) => f.properties) ?? [];
  const nameOf = (id: string) => settlements.find((s) => s.settlementId === id)?.name ?? id;
  const shelterName = (id: string) => shelters.find((s) => s.shelterId === id)?.name ?? id;
  const shown = useMemo(() => filterRoutes(routes, { origin, destination }), [routes, origin, destination]);
  const byId = (id: string): RouteProps | undefined => routes.find((r) => r.routeId === id);
  const noSafe = settlements.filter((p) => snapshot && hasNoSafeRoute(snapshot, p) && (!origin || p.settlementId === origin));

  if (!snapshot) return <div data-testid="routes-section"><Panel title="Routes & Evacuation"><EmptyState title="Loading…" /></Panel></div>;

  return (
    <div data-testid="routes-section" className="cmd-section">
      <Panel title="Routes & Evacuation">
        <p style={{ ...small, margin: '0 0 8px' }} data-testid="routes-source-note">Routes are computed by the backend; this view only displays them. Travel time shown is the server&apos;s etaMin.</p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
          <label>Origin settlement{' '}
            <select data-testid="routes-filter-origin" value={origin} onChange={(e) => setOrigin(e.target.value)}>
              <option value="">All</option>
              {settlements.map((s) => <option key={s.settlementId} value={s.settlementId}>{s.name} ({s.settlementId})</option>)}
            </select>
          </label>
          <label>Destination shelter{' '}
            <select data-testid="routes-filter-destination" value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="">All</option>
              {shelters.map((s) => <option key={s.shelterId} value={s.shelterId}>{s.name} ({s.shelterId})</option>)}
            </select>
          </label>
          <span data-testid="routes-count" aria-live="polite">{shown.length} of {routes.length} routes</span>
        </div>

        {noSafe.map((p) => <NoSafeRoute key={p.settlementId} settlementId={p.settlementId} name={p.name} />)}

        {shown.length === 0 ? (
          <EmptyState title="No routes match">{routes.length === 0 ? 'The backend has not published any routes.' : 'Clear the filters to see all routes.'}</EmptyState>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {shown.map((r) => {
              const isSel = selected?.kind === 'route' && selected.id === r.routeId;
              const replaced = r.replacesRouteId ? byId(r.replacesRouteId) : undefined;
              const alternative = routes.find((x) => x.replacesRouteId === r.routeId);
              return (
                <li key={r.routeId} data-testid={`route-row-${r.routeId}`} data-status={r.status} data-selected={isSel} style={{ padding: '8px', borderBottom: '1px solid rgba(128,128,128,.3)', borderLeft: `3px solid ${isSel ? 'currentColor' : 'transparent'}` }}>
                  <button type="button" data-testid={`route-select-${r.routeId}`} aria-pressed={isSel} onClick={() => select({ kind: 'route', id: r.routeId })} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 8, justifyContent: 'space-between', width: '100%' }}>
                    <span><MonoId>{r.routeId}</MonoId> {nameOf(r.from)} → {shelterName(r.to)} <small>({r.kind})</small></span>
                    <span>
                      <span data-testid={`route-eta-${r.routeId}`}>{r.etaMin} min</span>{' '}
                      <Badge tone={ROUTE_TONE[r.status].tone} icon={ROUTE_TONE[r.status].icon}>{label(r.status)}</Badge>
                    </span>
                  </button>
                  {r.replacesRouteId && (
                    <div style={small} data-testid={`route-replaces-${r.routeId}`}>
                      Alternative that replaces <button type="button" onClick={() => select({ kind: 'route', id: r.replacesRouteId! })}>{r.replacesRouteId}</button>
                      {replaced ? ` (${label(replaced.status)})` : ''}
                    </div>
                  )}
                  {alternative && (
                    <div style={small} data-testid={`route-alternative-${r.routeId}`}>
                      Alternative: <button type="button" onClick={() => select({ kind: 'route', id: alternative.routeId })}>{alternative.routeId}</button> ({alternative.etaMin} min, {label(alternative.status)})
                    </div>
                  )}
                  {r.refusal && r.status === 'unavailable' && (
                    <ExplainBlock testId={`explain-refusal-${r.routeId}`} title="Why this route is refused" reason={r.refusal} snapshot={snapshot} />
                  )}
                  {r.status === 'unavailable' && !r.refusal && <div style={small} data-testid={`refusal-missing-${r.routeId}`}>Refusal reason: Not provided by backend</div>}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export function RoutesSection() {
  const { snapshot } = useProjections();
  return <RoutesSectionView {...(snapshot ? { snapshot } : {})} />;
}
