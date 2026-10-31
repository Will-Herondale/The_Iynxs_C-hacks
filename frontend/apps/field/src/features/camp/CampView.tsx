import { useEffect, useState } from 'react';
import type { PeopleSnapshot, ProjectionSnapshot } from '@setu/contract';
import { Badge, Button, EmptyState, Panel, SyncStatusBadge } from '@setu/ui';
import { HouseholdScreen, DuplicateReviewPlaceholder, campSummary, householdsFromQueue } from '../household/index.js';
import '../household/household.css';
import { PersonCheckinScreen } from '../people/index.js';
import { SearchSelect } from '../wizard/index.js';
import { DataAsOf, StaleWarning } from '../status/index.js';
import { useQueue } from '../../sync/index.js';
import type { QueueItem } from '../../sync/index.js';
import { shelterCounts, shelterStatus } from '../map/honesty.js';

export const CAMP_KEY = 'setu.field.camp';
/** Select value for a person who is not in any camp. */
export const NO_CAMP = '__none__';

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
  /** Server-confirmed records from all devices; local queue rows are layered on top. */
  people?: PeopleSnapshot;
  peopleUnavailable?: boolean;
  /** Overridable for tests; defaults to the live local queue. */
  items?: QueueItem[];
  onOpenReport?: (clientEventId: string) => void;
}

const time = (ms: number) => new Date(ms).toLocaleString();

export function campHouseholds(items: QueueItem[], shelterId: string): QueueItem[] {
  return items.filter((i) => i.event.type === 'household_registration' && i.event.shelterId === shelterId);
}

export function campPeople(items: QueueItem[], campId: string): QueueItem[] {
  return items.filter((i) => i.event.type === 'person_checkin' && i.event.campId === campId);
}

function CampInfo({ shelter, asOf, online }: { shelter: ProjectionSnapshot['shelters']['features'][number]['properties']; asOf?: string; online: boolean }) {
  const st = shelterStatus(shelter);
  const counts = shelterCounts(shelter);
  return (
    <Panel title={shelter.name}>
      <div data-testid="camp-info" data-shelter-id={shelter.shelterId} data-shelter-status={st.status}>
        <p>
          <Badge tone={st.status === 'open-reported' ? 'success' : 'neutral'}>{st.status === 'open-reported' ? '✓ ' : '◌ '}{st.label}</Badge>
        </p>
        <p data-testid="camp-capacity">Capacity and occupancy: <strong>{counts}</strong>{counts === 'not published' ? ' (no source data yet; capacity is not managed here).' : '.'}</p>
        {asOf && !online && <p role="note">Data as of {asOf}. You are offline, so this may be out of date.</p>}
      </div>
    </Panel>
  );
}

export function CampView({ snapshot, cachedAt, online, items, people, peopleUnavailable, onOpenReport }: CampViewProps) {
  const shelters = snapshot?.shelters.features.map((f) => f.properties) ?? [];
  const [camp, setCamp] = useState(readCamp);
  const live = useQueue();
  const queue = items ?? live;

  useEffect(() => {
    if (camp) writeCamp(camp);
  }, [camp]);

  const chosen = shelters.find((s) => s.shelterId === camp);
  const noCamp = camp === NO_CAMP;
  const rows = camp ? campHouseholds(queue, camp) : [];
  const peopleRows = camp ? campPeople(queue, camp) : [];
  const summary = campSummary(householdsFromQueue(queue), camp || undefined);
  const remoteCamp = people?.camps.find((c) => c.campId === camp);
  const remoteRecords = people?.checkins.filter((r) => r.campId === camp) ?? [];
  const remoteClientIds = new Set(remoteRecords.map((r) => r.clientEventId).filter((id): id is string => !!id));
  const localOnlyHouseholds = rows.filter((i) => i.status !== 'rejected' && !remoteClientIds.has(i.clientEventId));
  const localOnlyPeople = peopleRows.filter((i) => i.status !== 'rejected' && !remoteClientIds.has(i.clientEventId));
  const serverBacked = !!people;
  const householdCount = serverBacked
    ? (remoteCamp?.households ?? remoteRecords.filter((r) => r.kind === 'household').length) + localOnlyHouseholds.length
    : summary.households;
  const personCount = serverBacked
    ? (remoteCamp?.people ?? remoteRecords.reduce((n, r) => n + r.members, 0)) + localOnlyHouseholds.reduce((n, i) => n + (i.event.type === 'household_registration' ? i.event.members : 0), 0) + localOnlyPeople.length
    : summary.people;
  const individualCount = serverBacked
    ? remoteRecords.filter((r) => r.kind === 'person').length + localOnlyPeople.length
    : peopleRows.length;
  const asOf = cachedAt !== undefined ? time(cachedAt) : snapshot ? time(Date.parse(snapshot.generatedAt)) : undefined;

  return (
    <>
      <Panel title="Camp">
        <StaleWarning cachedAt={cachedAt ?? (snapshot ? Date.parse(snapshot.generatedAt) : undefined)} />
        <p><DataAsOf cachedAt={cachedAt} /></p>
        <div className="setu-field">
          <label className="setu-field__label" htmlFor="camp-select">Which camp are you at?</label>
          <SearchSelect
            what="camps" emptyLabel="Choose a camp…" selected={camp}
            options={[
              { value: NO_CAMP, label: 'Not in a camp (register an individual)' },
              ...(camp && !chosen && !noCamp ? [{ value: camp, label: camp }] : []),
              ...shelters.map((s) => ({ value: s.shelterId, label: `${s.shelterId}: ${s.name}` })),
            ]}
            selectProps={{ id: 'camp-select', className: 'setu-field__control', 'data-testid': 'camp-select', value: camp, onChange: (e) => setCamp(e.target.value) }}
          />
        </div>
        {!snapshot && <p role="status">No camp data on this device yet. Open the app once while online to load the camp list.</p>}
      </Panel>
      {chosen && <CampInfo shelter={chosen} asOf={asOf} online={online} />}
      {noCamp ? (
        <HouseholdScreen snapshot={snapshot} individual title="Register an individual who is not in a camp" formTestId="camp-individual-form" />
      ) : camp ? (
        <>
          <Panel title={serverBacked ? 'Camp summary (all synced devices)' : 'Camp summary (registered from this device)'}>
            {serverBacked && <p role="note" data-testid="camp-people-source">Includes server-confirmed registrations from all devices, plus this device&apos;s unsynced queue.</p>}
            {peopleUnavailable && !serverBacked && <p role="status" data-testid="camp-people-unavailable">Shared people data is unavailable; showing this device&apos;s queue.</p>}
            <dl className="camp-summary" data-testid="camp-summary">
              <div><dt>Registered households</dt><dd data-testid="camp-summary-households">{householdCount}</dd></div>
              <div><dt>Registered people</dt><dd data-testid="camp-summary-people">{personCount}</dd></div>
              <div><dt>Individual check-ins</dt><dd data-testid="camp-summary-individuals">{individualCount}</dd></div>
              <div><dt>Pending (not yet accepted)</dt><dd data-testid="camp-summary-pending">{summary.pending}</dd></div>
              <div><dt>Awaiting review (conflict)</dt><dd data-testid="camp-summary-review">{summary.awaitingReview}</dd></div>
            </dl>
            {summary.rejected > 0 && <p role="status" data-testid="camp-summary-rejected">{summary.rejected} rejected: open Households to edit and resubmit.</p>}
          </Panel>
          <HouseholdScreen snapshot={snapshot} shelterId={camp} title={`Register household at ${chosen?.name ?? camp}`} formTestId="camp-household-form" />
          <PersonCheckinScreen snapshot={snapshot} campId={camp} title={`Check in a person at ${chosen?.name ?? camp}`} formTestId="camp-person-form" />
          <Panel title={serverBacked ? 'Individual check-ins at this camp' : 'Individual check-ins at this camp from this device'}>
            {individualCount === 0 && <EmptyState title="No individual check-ins yet" />}
            <ul data-testid="camp-person-list" className="camp-household-list">
              {serverBacked && remoteRecords.filter((r) => r.kind === 'person').map((r) => (
                <li key={r.eventId} data-testid="camp-person-row" data-source="server" data-client-event-id={r.clientEventId ?? ''} data-status="synced">
                  <strong>{r.displayName}</strong>{r.ageBand ? ` · ${r.ageBand}` : ''}{r.householdId ? ` · household ${r.householdId}` : ''} <SyncStatusBadge status="synced" {...{ online }} />
                </li>
              ))}
              {peopleRows.map((i) => {
                if (serverBacked && !localOnlyPeople.some((x) => x.clientEventId === i.clientEventId)) return null;
                const person = i.event.type === 'person_checkin' ? i.event : undefined;
                return (
                  <li key={i.clientEventId} data-testid="camp-person-row" data-client-event-id={i.clientEventId} data-status={i.status}>
                    <strong>{person?.name}</strong>
                    {person?.ageBand ? ` · ${person.ageBand}` : ''}
                    {person?.householdId ? ` · household ${person.householdId}` : ''}{' '}
                    <SyncStatusBadge status={i.status} {...{ online }} />
                    {onOpenReport && <> <Button onClick={() => onOpenReport(i.clientEventId)} data-testid="camp-open-person-report">View report</Button></>}
                  </li>
                );
              })}
            </ul>
          </Panel>
          <Panel title={serverBacked ? 'Registered households at this camp' : 'Registered at this camp from this device'}>
            {householdCount === 0 && <EmptyState title="No households yet" />}
            {(
              <ul data-testid="camp-household-list" className="camp-household-list">
                {serverBacked && remoteRecords.filter((r) => r.kind === 'household').map((r) => (
                  <li key={r.eventId} data-testid="camp-household-row" data-source="server" data-client-event-id={r.clientEventId ?? ''} data-status="synced">
                    <strong>{r.displayName}</strong> · {r.members} {r.members === 1 ? 'person' : 'people'} <SyncStatusBadge status="synced" {...{ online }} />
                  </li>
                ))}
                {rows.map((i) => {
                  if (serverBacked && !localOnlyHouseholds.some((x) => x.clientEventId === i.clientEventId)) return null;
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
