import { useMemo, useState } from 'react';
import type { ProjectionSnapshot } from '@setu/contract';
import { Badge, Button, EmptyState, Panel, SyncStatusBadge } from '@setu/ui';
import { useQueue, useSyncState } from '../../sync/index.js';
import type { QueueItem } from '../../sync/index.js';
import { HouseholdScreen } from './HouseholdForm.js';
import { householdsFromQueue, nameLookup, searchHouseholds, supersededId, vulnerableList } from './households.js';
import type { HouseholdRecord } from './households.js';
import './household.css';

export interface HouseholdsScreenProps {
  snapshot?: ProjectionSnapshot;
  /** Overridable for tests; defaults to the live local queue. */
  items?: QueueItem[];
  online?: boolean;
  /** Opens the report detail screen for a queue item (`clientEventId`). */
  onOpenReport?: (clientEventId: string) => void;
  /** Open the register form straight away (Home "Register household"). */
  startRegistering?: boolean;
}

const when = (ms: number) => new Date(ms).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) + ' IST';

/** Local-only placeholder: duplicate review needs backend data (issue #15). Never matches or merges. */
export function DuplicateReviewPlaceholder() {
  return (
    <div className="household-blocked" data-testid="household-duplicates-blocked" role="note">
      <strong>Possible-duplicate review: Blocked: issue #15.</strong>{' '}
      Households are never matched or merged automatically on this device.
    </div>
  );
}

function HistoryList({ record, online, onOpenReport }: { record: HouseholdRecord; online: boolean; onOpenReport?: (id: string) => void }) {
  return (
    <ol className="household-history" data-testid="household-history">
      {[...record.history].reverse().map((i) => {
        const replaces = supersededId(i.event.note);
        return (
          <li key={i.clientEventId} data-testid="household-history-item" data-client-event-id={i.clientEventId} data-status={i.status}>
            <SyncStatusBadge status={i.status} online={online} /> · registered {when(i.createdAt)}
            {i.eventId && <> · server event <code>{i.eventId}</code></>}
            {i.acceptedAtVersion !== undefined && <> (version {i.acceptedAtVersion})</>}
            {replaces && <> · replaces <code>{replaces}</code></>}
            {i.conflict && <> · requires review: {i.conflict.reason}</>}
            {i.status === 'rejected' && i.validationErrors?.length ? <> · {i.validationErrors.map((v) => v.message).join('; ')}</> : null}
            {onOpenReport && (
              <>
                {' '}
                <Button onClick={() => onOpenReport(i.clientEventId)} data-testid="household-open-report">View report</Button>
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function HouseholdsScreen({ snapshot, items, online: onlineProp, onOpenReport, startRegistering }: HouseholdsScreenProps) {
  const live = useQueue();
  const sync = useSyncState();
  const queue = items ?? live;
  const online = onlineProp ?? sync.online;
  const names = useMemo(() => nameLookup(snapshot), [snapshot]);
  const [query, setQuery] = useState('');
  const [registering, setRegistering] = useState(!!startRegistering);
  const [editing, setEditing] = useState<QueueItem | null>(null);
  const [savedNote, setSavedNote] = useState(false);

  const records = useMemo(() => householdsFromQueue(queue), [queue]);
  const rows = useMemo(() => searchHouseholds(records, query, names), [records, query, names]);

  return (
    <div data-testid="households-screen">
      <Panel title="Households">
        <Button variant="primary" className="household-submit" data-testid="households-register" onClick={() => { setEditing(null); setRegistering(true); setSavedNote(false); }}>
          Register household
        </Button>
        {savedNote && <p role="status" data-testid="households-saved">Saved locally. It will sync automatically when a connection is available.</p>}
      </Panel>
      {(registering || editing) && (
        <>
          <HouseholdScreen
            snapshot={snapshot}
            editing={editing}
            onDone={() => { setRegistering(false); setEditing(null); setSavedNote(true); }}
          />
          <Button onClick={() => { setRegistering(false); setEditing(null); }} data-testid="households-cancel">Close form</Button>
        </>
      )}
      <Panel title={`Registered on this device (${records.length})`}>
        <div className="setu-field">
          <label className="setu-field__label" htmlFor="households-search">Search by name, village or camp</label>
          <input id="households-search" type="search" className="setu-field__control household-search" data-testid="households-search" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <p className="household-note">Only households registered from this device are searched. Server-side households are not provided to this app.</p>
        {records.length === 0 && <EmptyState title="No households registered yet" />}
        {records.length > 0 && rows.length === 0 && <p role="status" data-testid="households-no-match">No household matches “{query}”.</p>}
        <ul className="household-list" data-testid="households-list">
          {rows.map((r) => {
            const e = r.current.event;
            const village = names.settlement(e.settlementId) ?? e.settlementId;
            const camp = names.shelter(e.shelterId) ?? e.shelterId;
            const flags = vulnerableList(e);
            return (
              <li key={r.householdId} className="household-row" data-testid="household-row" data-household-id={r.householdId} data-client-event-id={r.current.clientEventId} data-status={r.current.status}>
                <div className="household-row__head">
                  <strong>{e.headName}</strong>
                  <SyncStatusBadge status={r.current.status} online={online} />
                </div>
                <p>
                  {e.members} {e.members === 1 ? 'person' : 'people'} · Village: {village ?? 'Unknown'} · Camp: {camp ?? 'Not in a camp'}
                </p>
                {(flags.length > 0 || e.needs.length > 0) && (
                  <p>
                    {flags.map((f) => <Badge key={f}>{f}</Badge>)} {e.needs.length > 0 && <>Needs: {e.needs.join(', ')}</>}
                  </p>
                )}
                <details>
                  <summary data-testid="household-history-toggle">Registration history ({r.history.length})</summary>
                  <HistoryList record={r} online={online} onOpenReport={onOpenReport} />
                </details>
                <div className="household-actions">
                  {onOpenReport && <Button onClick={() => onOpenReport(r.current.clientEventId)} data-testid="household-open-detail">View report</Button>}
                  {r.current.status === 'rejected' && (
                    <Button onClick={() => { setEditing(r.current); setRegistering(false); }} data-testid="household-edit">Edit and resubmit</Button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>
      <Panel title="Household details not yet supported">
        <p className="household-blocked" data-testid="household-member-names-blocked-summary">Member names: Blocked: #15.</p>
        <DuplicateReviewPlaceholder />
      </Panel>
    </div>
  );
}
