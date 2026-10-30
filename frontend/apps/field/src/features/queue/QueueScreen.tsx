import { useState } from 'react';
import type { ClientSyncStatus } from '@setu/contract';
import { Badge, Button, EmptyState, Panel, SyncStatusBadge } from '@setu/ui';
import { discard, resolveConflict, retry, useQueue, useSyncState } from '../../sync/index.js';
import type { QueueItem } from '../../sync/index.js';

const FILTERS: { key: string; label: string; statuses?: ClientSyncStatus[] }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Not yet confirmed', statuses: ['queued', 'sending', 'accepted', 'failed'] },
  { key: 'synced', label: 'Confirmed', statuses: ['synced'] },
  { key: 'attention', label: 'Disputed / Rejected', statuses: ['conflict', 'rejected'] },
];

/** One plain-language line per status, using the brief's vocabulary. */
export function statusExplanation(status: ClientSyncStatus, online: boolean): string {
  switch (status) {
    case 'queued':
      return online
        ? 'Queued for sync: saved on this device and about to be sent.'
        : 'Saved on device: it will be sent automatically as soon as you are back online.';
    case 'sending':
      return 'Submitted: sent to the server, waiting for its reply.';
    case 'accepted':
      return "Accepted — awaiting confirmation: the server has it; we'll mark it Confirmed once it's in the shared record.";
    case 'synced':
      return "Confirmed: it's in the shared record and the maps and routes use it.";
    case 'conflict':
      return 'Disputed: it conflicts with what the server already knows. Choose which version to keep.';
    case 'rejected':
      return 'Rejected: the server refused this report. Edit and resubmit it, or discard it.';
    case 'failed':
      return "Retrying: the last attempt failed. It's still saved on this device and we'll try again.";
  }
}

const TYPE_LABEL: Record<string, string> = {
  flood_report: 'Flood report',
  road_blockage: 'Road blockage',
  road_cleared: 'Road cleared',
  water_level: 'Water level',
};

function describe(item: QueueItem): string {
  const e = item.event as unknown as Record<string, unknown>;
  const where = e['roadId'] ?? e['areaId'] ?? e['gaugeId'];
  return typeof where === 'string' ? where : '';
}

function ConflictPanel({ item }: { item: QueueItem }) {
  const [working, setWorking] = useState(false);
  const run = async (choice: 'keep-mine' | 'accept-server') => {
    setWorking(true);
    try {
      await resolveConflict(item.clientEventId, choice);
    } finally {
      setWorking(false);
    }
  };
  return (
    <div data-testid="conflict-panel" className="queue-conflict" role="group" aria-label="Conflict details">
      <p>{item.conflict?.reason ?? 'This report conflicts with the server state.'}</p>
      <div className="queue-conflict__cols">
        <div>
          <h4>Mine</h4>
          <pre>{JSON.stringify(item.event, null, 2)}</pre>
        </div>
        <div>
          <h4>Server</h4>
          <pre>{item.conflict?.serverState === undefined ? 'Not provided' : JSON.stringify(item.conflict.serverState, null, 2)}</pre>
        </div>
      </div>
      <Button data-testid="conflict-keep-mine" variant="primary" disabled={working} onClick={() => void run('keep-mine')}>
        Keep mine (resubmit as new report)
      </Button>{' '}
      <Button data-testid="conflict-accept-server" disabled={working} onClick={() => void run('accept-server')}>
        Accept server
      </Button>
    </div>
  );
}

function QueueRow({ item, online, onEdit }: { item: QueueItem; online: boolean; onEdit?: (item: QueueItem) => void }) {
  const canRetry = item.status === 'failed' || item.status === 'queued';
  const canDiscard = item.status !== 'sending' && item.status !== 'synced';
  const canEdit = item.status === 'rejected' && onEdit;
  const where = describe(item);
  return (
    <li
      data-testid="queue-item"
      data-client-event-id={item.clientEventId}
      data-status={item.status}
      data-attempts={item.attempts}
      data-type={item.type}
      className={`queue-item queue-item--${item.status}`}
    >
      <div className="queue-item__head">
        <SyncStatusBadge status={item.status} {...{ online }} />
        <strong>{TYPE_LABEL[item.type] ?? item.type}</strong>
        {where && <Badge>{where}</Badge>}
        <time dateTime={new Date(item.createdAt).toISOString()}>{new Date(item.createdAt).toLocaleString()}</time>
        <span>Attempts: {item.attempts}</span>
      </div>
      <p className="queue-item__explain" data-testid="queue-item-explain">{statusExplanation(item.status, online)}</p>
      {item.lastError && <p className="queue-item__error" role="alert">{item.lastError}</p>}
      {item.validationErrors?.length ? (
        <ul className="queue-item__validation">
          {item.validationErrors.map((v, i) => (
            <li key={i}>
              {v.path}: {v.message}
            </li>
          ))}
        </ul>
      ) : null}
      {item.status === 'conflict' && <ConflictPanel item={item} />}
      <div className="queue-item__actions">
        {canRetry && (
          <Button data-testid="queue-retry" onClick={() => void retry(item.clientEventId)}>
            Retry now
          </Button>
        )}
        {canEdit && (
          <Button data-testid="queue-edit" onClick={() => onEdit(item)}>
            Edit &amp; resubmit
          </Button>
        )}
        {canDiscard && (
          <Button data-testid="queue-discard" variant="danger" onClick={() => void discard(item.clientEventId)}>
            Discard
          </Button>
        )}
      </div>
    </li>
  );
}

export interface QueueScreenProps {
  /** Called for a rejected item; the lead/forms reopen the report form prefilled from item.event. */
  onEdit?: (item: QueueItem) => void;
}

export function QueueScreen({ onEdit }: QueueScreenProps) {
  const [filterKey, setFilterKey] = useState('all');
  const filter = FILTERS.find((f) => f.key === filterKey)!;
  const items = useQueue(filter.statuses);
  const { online } = useSyncState();
  return (
    <Panel title="Sync queue">
      <div role="group" aria-label="Filter by status" className="queue-filters">
        {FILTERS.map((f) => (
          <Button
            key={f.key}
            data-testid={`queue-filter-${f.key}`}
            aria-pressed={f.key === filterKey}
            variant={f.key === filterKey ? 'primary' : 'default'}
            onClick={() => setFilterKey(f.key)}
          >
            {f.label}
          </Button>
        ))}
      </div>
      <div data-testid="queue-list">
        {items.length === 0 ? (
          <EmptyState title="Nothing here">No reports match this filter.</EmptyState>
        ) : (
          <ul className="queue-items" style={{ listStyle: 'none', padding: 0 }}>
            {items.map((item) => (
              <QueueRow key={item.clientEventId} item={item} online={online} onEdit={onEdit} />
            ))}
          </ul>
        )}
      </div>
    </Panel>
  );
}
