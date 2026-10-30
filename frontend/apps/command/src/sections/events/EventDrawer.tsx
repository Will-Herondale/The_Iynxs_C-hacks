import { SyncStatusBadge } from '@setu/ui';
import type { EventRecord, ProjectionSnapshot } from '@setu/contract';
import { useSelection, type Selection } from '../../app';
import { formatDateTime } from '../../app/time';
import { EVENT_META } from '../../feed/status';
import type { FeedStatus } from '../../feed/status';
import { AUDIT_STATUS_LABEL, delayLabel } from '../../audit/model';
import { payloadJson, resultingChanges } from '../../audit/changes';

export interface EventDrawerProps {
  rec: EventRecord;
  status: FeedStatus;
  snapshot?: ProjectionSnapshot | undefined;
  onClose: () => void;
  onShowFeature?: ((sel: Selection) => void) | undefined;
}

/** Original payload plus the server-reported results of this event (why a road changed / settlement disconnected). */
export function EventDrawer({ rec, status, snapshot, onClose, onShowFeature }: EventDrawerProps) {
  const { select } = useSelection();
  const changes = resultingChanges(rec, snapshot);
  const meta = EVENT_META[rec.event.type];
  const open = (sel: Selection) => {
    select(sel);
    onShowFeature?.(sel);
  };
  return (
    <aside
      data-testid="event-drawer"
      data-event-id={rec.eventId}
      role="complementary"
      aria-label={`Event ${rec.eventId}`}
      style={{ border: '1px solid rgba(128,128,128,0.5)', padding: 12, marginTop: 8 }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <strong>
          <span aria-hidden="true">{meta.icon}</span> {meta.label}{' '}
          <code data-testid="event-drawer-id">{rec.eventId}</code>
        </strong>
        <button type="button" data-testid="event-drawer-close" onClick={onClose}>Close</button>
      </header>
      <p>
        <SyncStatusBadge status={status} /> <span data-testid="event-drawer-status">{AUDIT_STATUS_LABEL[status]}</span>
        {' · '}Observed {formatDateTime(rec.event.occurredAt)} · Received {formatDateTime(rec.receivedAt)}
        {' · '}<em>{delayLabel(rec)}</em>
      </p>
      <h4>Original payload</h4>
      <pre data-testid="event-payload" style={{ overflow: 'auto', maxHeight: 220, fontSize: '0.8em' }}>
        {payloadJson(rec)}
      </pre>
      <h4>Resulting changes</h4>
      <div data-testid="event-changes">
        {changes.affected.length === 0 ? (
          <p data-testid="event-no-affected">
            No feature currently cites this event as a source (server snapshot).
          </p>
        ) : (
          <ul>
            {changes.affected.map((f) => (
              <li key={`${f.kind}-${f.id}`}>
                <button type="button" data-testid={`event-affected-${f.kind}-${f.id}`} onClick={() => open(f)}>
                  {f.kind} {f.id}
                </button>{' '}
                cites this event as its source
              </li>
            ))}
          </ul>
        )}
        {rec.serverState !== 'applied' ? (
          <p data-testid="event-diff-na">Not applied by the server yet, so no projection changes are attributed to it.</p>
        ) : changes.diff === null ? (
          <p data-testid="event-diff-na">
            Snapshot diff at v{changes.appliedAtVersion ?? '?'} not available: this session did not observe both
            versions.
          </p>
        ) : changes.diff.length === 0 ? (
          <p data-testid="event-diff-empty">No projection changes at v{changes.appliedAtVersion}.</p>
        ) : (
          <ul data-testid="event-diff">
            {changes.diff.map((c) => (
              <li key={`${c.kind}-${c.id}-${c.text}`}>
                <button type="button" data-testid="event-diff-item" onClick={() => open({ kind: c.kind, id: c.id })}>
                  {c.text}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
