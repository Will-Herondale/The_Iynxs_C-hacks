import { useMemo } from 'react';
import type { EventRecord, EventStatus, ProjectionSnapshot } from '@setu/contract';
import { useProjections } from './useProjections';
import { useEvents } from './useEvents';
import { useEventStatuses } from './useEventStatuses';
import { feedStatus, type FeedStatus } from '../feed/status';

/** One report a feature is based on. `record` is undefined if listEvents does not (yet) know the id. */
export interface ProvenanceItem {
  sourceId: string;
  record?: EventRecord;
  /** Strict mapping: 'synced' only when the server confirmed applied at a reached version. */
  status: FeedStatus;
}

/** sourceEventIds the server attached to a feature (any kind), or [] when absent. Pure lookup. */
export function featureSourceEventIds(snap: ProjectionSnapshot | undefined, featureId: string): string[] {
  if (!snap) return [];
  const ids = new Set<string>();
  for (const f of snap.roads.features) if (f.properties.roadId === featureId) f.properties.sourceEventIds.forEach((i) => ids.add(i));
  for (const f of snap.settlements.features)
    if (f.properties.settlementId === featureId) f.properties.cutOffReason?.sourceEventIds?.forEach((i) => ids.add(i));
  for (const f of snap.routes.features)
    if (f.properties.routeId === featureId) f.properties.refusal?.sourceEventIds?.forEach((i) => ids.add(i));
  return [...ids];
}

/** Join source ids with event records (by eventId or clientEventId). Newest report first. */
export function joinProvenance(
  sourceIds: string[],
  records: EventRecord[],
  statuses: Record<string, EventStatus>,
  snapshotVersion: number | undefined,
): ProvenanceItem[] {
  const items = sourceIds.map((sourceId): ProvenanceItem => {
    const record = records.find((r) => r.eventId === sourceId || r.event.clientEventId === sourceId);
    if (!record) return { sourceId, status: 'accepted' };
    const st = statuses[record.event.clientEventId];
    // Prefer the record, but never upgrade beyond what getEventStatus also confirms.
    let status = feedStatus(record, snapshotVersion);
    if (status === 'synced' && st && st.state !== 'applied') status = 'accepted';
    return { sourceId, record, status };
  });
  return items.sort((a, b) => (b.record?.event.occurredAt ?? '').localeCompare(a.record?.event.occurredAt ?? ''));
}

/** "Based on these reports" for a feature id. Lookup only; no projection logic. */
export function useProvenance(featureId: string | undefined): { items: ProvenanceItem[]; isLoading: boolean } {
  const { snapshot, version } = useProjections();
  const { events, isLoading } = useEvents();
  const sourceIds = useMemo(() => (featureId ? featureSourceEventIds(snapshot, featureId) : []), [snapshot, featureId]);
  const clientIds = useMemo(
    () => events.filter((r) => sourceIds.includes(r.eventId) || sourceIds.includes(r.event.clientEventId)).map((r) => r.event.clientEventId),
    [events, sourceIds],
  );
  const { statuses } = useEventStatuses(clientIds);
  const items = useMemo(() => joinProvenance(sourceIds, events, statuses, version), [sourceIds, events, statuses, version]);
  return { items, isLoading };
}
