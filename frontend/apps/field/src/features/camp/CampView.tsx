import { useEffect, useState } from 'react';
import type { ProjectionSnapshot } from '@setu/contract';
import { Badge, Button, EmptyState, Panel, SyncStatusBadge } from '@setu/ui';
import { HouseholdScreen, DuplicateReviewPlaceholder, campSummary, householdsFromQueue } from '../household/index.js';
import '../household/household.css';
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
  onOpenReport?: (clientEventId: string) => void;
}

const time = (ms: number) => new Date(ms).toLocaleString();

export function campHouseholds(items: QueueItem[], shelterId: string): QueueItem[] {
  return items.filter((i) => i.event.type === 'household_registration' && i.event.shelterId === shelterId);
}

function CampInfo({ shelter, asOf, online }: { shelter: ProjectionSnapshot['shelters']['features'][number]['properties']; asOf?: string; online: boolean }) {
  return (
    <Panel title={shelter.name}>
      <div data-testid="camp-info" data-shelter-id={shelter.shelterId}>
        <p>
          <Badge tone={shelter.open ? 'success' : 'danger'}>{shelter.open ? 'Open' : 'Closed'}</Badge>
        </p>
        <p data-testid="camp-capacity">Capacity and occupancy: <strong>not published</strong> (no source data yet; capacity is not managed here).</p>
        {asOf && !online && <p role="note">Data as of {asOf}. You are offline, so this may be out of date.</p>}
      </div>
    </Panel>
  );
}

export function CampView({ snapshot, cachedAt, online, items, onOpenReport }: CampViewProps) {
  const shelters = snapshot?.shelters.features.map((f) => f.properties) ?? [];
  const [camp, setCamp] = useState(readCamp);
  const live = useQueue();
  const queue = items ?? live;

  useEffect(() => {
    if (camp) writeCamp(camp);
  }, [camp]);

  const chosen = shelters.find((s) => s.shelterId === camp);
  const rows = camp ? campHouseholds(queue, camp) : [];
  const summary = campSummary(householdsFromQueue(queue), camp || undefined);
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
          <Panel title="Camp summary (registered from this device)">
            <dl className="camp-summary" data-testid="camp-summary">
              <div><dt>Registered households</dt><dd data-testid="camp-summary-households">{summary.households}</dd></div>
              <div><dt>Registered people</dt><dd data-testid="camp-summary-people">{summary.people}</dd></div>
              <div><dt>Pending (not yet accepted)</dt><dd data-testid="camp-summary-pending">{summary.pending}</dd></div>
              <div><dt>Awaiting review (conflict)</dt><dd data-testid="camp-summary-review">{summary.awaitingReview}</dd></div>
            </dl>
            {summary.rejected > 0 && <p role="status" data-testid="camp-summary-rejected">{summary.rejected} rejected: open Households to edit and resubmit.</p>}
          </Panel>
          <HouseholdScreen snapshot={snapshot} shelterId={camp} title={`Register household at ${chosen?.name ?? camp}`} formTestId="camp-household-form" />
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
                      {onOpenReport && <> <Button onClick={() => onOpenReport(i.clientEventId)} data-testid="camp-open-report">View report</Button></>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
          <DuplicateReviewPlaceholder />
        </>
      ) : (
        <EmptyState title="Choose a camp to register households" />
      )}
    </>
  );
}
