import type { ProjectionSnapshot, RouteProps, ShelterProps } from '@setu/contract';
import { ROUTE_STATE_META, formatIndicativeEta, routeState, shelterStatus, type RouteState, type ShelterStatusInfo } from '@setu/geo';
import { Badge, type BadgeTone } from '@setu/ui';

/** Display adapters over the shared honesty rules (@setu/geo). Nothing here computes a route or an ETA. */

const ROUTE_BADGE_TONE: Record<'neutral' | 'warn' | 'critical', BadgeTone> = { neutral: 'neutral', warn: 'warning', critical: 'danger' };

/** State of one route, given its settlement's evacuation routes as context. */
export function routeStateOf(snapshot: ProjectionSnapshot | undefined, r: RouteProps): RouteState {
  const settlementRoutes = snapshot?.routes.features.map((f) => f.properties).filter((x) => x.from === r.from && x.kind === 'evacuation') ?? [];
  return routeState(r, { settlementRoutes });
}

export function RouteStateBadge({ state }: { state: RouteState }) {
  const m = ROUTE_STATE_META[state];
  return <span data-route-state={state} title={m.explanation}><Badge tone={ROUTE_BADGE_TONE[m.tone]} icon={m.icon}>{m.label}</Badge></span>;
}

/** `data-shelter-status` value (TEST_IDS): open-reported | closed-reported | pre-identified. */
export function shelterAttr(info: ShelterStatusInfo): string {
  return info.status === 'preidentified' ? 'pre-identified' : info.status;
}

export const shelterInfo = (p: ShelterProps): ShelterStatusInfo => shelterStatus(p);

export function ShelterStatusBadge({ info }: { info: ShelterStatusInfo }) {
  return (
    <span data-shelter-status={shelterAttr(info)}>
      <Badge tone={info.tone === 'ok' ? 'success' : 'neutral'} icon={info.icon}>{info.label}</Badge>
    </span>
  );
}

/** "capacity not published" / "12 / 40". Never 0/0. */
export function shelterCounts(info: ShelterStatusInfo, p: ShelterProps): string {
  return info.confirmed || p.capacity > 0 ? `${info.occupancyText} / ${info.capacityText}` : 'capacity and occupancy not published';
}

/** ETA text: an unavailable route has no ETA (the backend sends etaMin 0, which would read as 'arrives instantly'). */
export function routeEtaText(p: { status: string; etaMin?: number | null }): string {
  return p.status === 'unavailable' ? 'No ETA (route unavailable)' : formatIndicativeEta(p.etaMin);
}

/** Backend-provided route reason, shown verbatim and labelled as such. Hidden when it only repeats the refusal summary. */
export function RouteReason({ routeId, reason, refusalSummary }: { routeId: string; reason?: string | undefined; refusalSummary?: string | undefined }) {
  if (!reason || reason === refusalSummary) return null;
  return (
    <div data-testid={`route-reason-${routeId}`} style={{ fontSize: '0.9em', margin: '4px 0' }}>
      <strong>Backend reason:</strong> {reason} <small>(backend-provided, not verified here)</small>
    </div>
  );
}

export { formatIndicativeEta, ROUTE_STATE_META };
