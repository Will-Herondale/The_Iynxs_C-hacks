import { useEffect, useState } from 'react';
import type { ProjectionSnapshot } from '@setu/contract';
import { Badge, EmptyState, Panel, SyncStatusBadge } from '@setu/ui';
import { HouseholdScreen } from '../household/index.js';
import { useQueue } from '../../sync/index.js';
import type { QueueItem } from '../../sync/index.js';

export const CAMP_KEY = 'setu.field.camp';

export function readCamp(): string {
  try {
    return window.localStorage.getItem(CAMP_KEY) ?? '';
  } catch {
    return '';
  }
}

function writeCamp(id: string): void {
  try {
    window.localStorage.setItem(CAMP_KEY, id);
  } catch {
    // storage unavailable: selection just isn't remembered
  }
}

export interface CampViewProps {
  snapshot?: ProjectionSnapshot;
  cachedAt?: number;
  online: boolean;
  /** Overridable for tests; defaults to the live local queue. */
  items?: QueueItem[];
}

const time = (ms: number) => new Date(ms).toLocaleString();

export function campHouseholds(items: QueueItem[], shelterId: string): QueueItem[] {
  return items.filter((i) => i.event.type === 'household_registration' && i.event.shelterId === shelterId);
}

function CampInfo({ shelter, asOf, online }: { shelter: ProjectionSnapshot['shelters']['features'][number]['properties']; asOf?: string; online: boolean }) {
  const free = Math.max(0, shelter.capacity - shelter.occupancy);
  return (
    <Panel title={shelter.name}>
      <div data-testid="camp-info" data-shelter-id={shelter.shelterId}>
        <p>
          <Badge tone={shelter.open ? 'success' : 'danger'}>{shelter.open ? 'Open' : 'Closed'}</Badge>
        </p>
        <p>
          Occupancy: <strong>{shelter.occupancy}</strong> of <strong>{shelter.capacity}</strong> ({free} places free)
        </p>
        {asOf && !online && <p role="note">Data as of {asOf}. You are offline, so this may be out of date.</p>}
      </div>
    </Panel>
  );
}

export function CampView({ snapshot, cachedAt, online, items }: CampViewProps) {
  const shelters = snapshot?.shelters.features.map((f) => f.properties) ?? [];
  const [camp, setCamp] = useState(readCamp);
  const live = useQueue();
  const queue = items ?? live;

  useEffect(() => {
    if (camp) writeCamp(camp);
  }, [camp]);

  const chosen = shelters.find((s) => s.shelterId === camp);
  const rows = camp ? campHouseholds(queue, camp) : [];
  const asOf = cachedAt !== undefined ? time(cachedAt) : snapshot ? time(Date.parse(snapshot.generatedAt)) : undefined;

  return (
    <>
      <Panel title="Camp">
        <div className="setu-field">
          <label className="setu-field__label" htmlFor="camp-select">Which camp are you at?</label>
          <select id="camp-select" className="setu-field__control" data-testid="camp-select" value={camp} onChange={(e) => setCamp(e.target.value)}>
            <option value="">Choose a camp…</option>
            {camp && !chosen && <option value={camp}>{camp}</option>}
            {shelters.map((s) => <option key={s.shelterId} value={s.shelterId}>{s.shelterId}: {s.name}</option>)}
          </select>
        </div>
        {!snapshot && <p role="status">No camp data on this device yet. Open the app once while online to load the camp list.</p>}
      </Panel>
      {chosen && <CampInfo shelter={chosen} asOf={asOf} online={online} />}
      {camp ? (
        <>
          <HouseholdScreen shelterId={camp} title={`Register household at ${chosen?.name ?? camp}`} formTestId="camp-household-form" />
          <Panel title="Registered at this camp from this device">
            {rows.length === 0 && <EmptyState title="No households yet" />}
            {(
              <ul data-testid="camp-household-list" className="camp-household-list">
                {rows.map((i) => {
                  const h = i.event.type === 'household_registration' ? i.event : undefined;
                  return (
                    <li key={i.clientEventId} data-testid="camp-household-row" data-client-event-id={i.clientEventId} data-status={i.status}>
                      <strong>{h?.headName}</strong> · {h?.members} {h?.members === 1 ? 'person' : 'people'}{' '}
                      <SyncStatusBadge status={i.status} {...{ online }} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </>
      ) : (
        <EmptyState title="Choose a camp to register households" />
      )}
    </>
  );
}
