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

export { formatIndicativeEta, ROUTE_STATE_META };
