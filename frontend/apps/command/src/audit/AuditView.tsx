import { formatDateTime } from '../app/time';
import { useMemo, useState } from 'react';
import { Panel, EmptyState, SyncStatusBadge } from '@setu/ui';
import type { FieldEventType } from '@setu/contract';
import { useSelection, type Selection } from '../app';
import { useEvents, useProjections } from '../data';
import { EVENT_META } from '../feed/status';
import {
  AUDIT_STATUS_LABEL,
  buildAuditRows,
  delayLabel,
  eventCause,
  type AuditFilter,
} from './model';
import type { FeedStatus } from '../feed/status';

export interface AuditViewProps {
  /** Called after a feature link is clicked; the app switches to the Map view. */
  onShowFeature?: (sel: Selection) => void;
}

const TYPES = Object.keys(EVENT_META) as FieldEventType[];
const STATUSES = Object.keys(AUDIT_STATUS_LABEL) as FeedStatus[];
const cell = { padding: '6px 8px', textAlign: 'left', verticalAlign: 'top', borderBottom: '1px solid rgba(128,128,128,0.3)' } as const;

export function AuditView({ onShowFeature }: AuditViewProps) {
  const { events, error } = useEvents();
  const { snapshot } = useProjections();
  const { select } = useSelection();
  const [filter, setFilter] = useState<AuditFilter>({});

  const rows = useMemo(() => buildAuditRows(events, snapshot, filter), [events, snapshot, filter]);

  const open = (sel: Selection) => {
    select(sel);
    onShowFeature?.(sel);
  };

  return (
    <div data-testid="audit-view">
      <Panel title="Audit: every report received">
        <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
          <label>
            Type{' '}
            <select
              data-testid="audit-filter-type"
              value={filter.type ?? ''}
              onChange={(e) => {
                const next: AuditFilter = { ...filter };
                if (e.target.value) next.type = e.target.value as FieldEventType;
                else delete next.type;
                setFilter(next);
              }}
            >
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>{EVENT_META[t].label}</option>
              ))}
            </select>
          </label>
          <label>
            Status{' '}
            <select
              data-testid="audit-filter-status"
              value={filter.status ?? ''}
              onChange={(e) => {
                const next: AuditFilter = { ...filter };
                if (e.target.value) next.status = e.target.value as FeedStatus;
                else delete next.status;
                setFilter(next);
              }}
            >
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{AUDIT_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </label>
          <span data-testid="audit-count" aria-live="polite">{rows.length} of {events.length} events</span>
        </div>
        {error && <p role="alert">Could not refresh events; showing last known.</p>}
        {rows.length === 0 ? (
          <EmptyState title={events.length === 0 ? 'No reports received yet' : 'No events match these filters'} />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: '0.9em' }}>
              <thead>
                <tr>
                  {['Reported / received', 'Type and cause', 'Reporter, device, location', 'Event IDs', 'Status', 'Affected features'].map((h) => (
                    <th key={h} scope="col" style={cell}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ rec, status, affected }) => {
                  const e = rec.event;
                  const cause = eventCause(rec);
                  return (
                    <tr
                      key={rec.eventId}
                      data-testid="audit-row"
                      data-event-id={rec.eventId}
                      data-client-event-id={e.clientEventId}
                      data-status={status}
                      data-type={e.type}
                    >
                      <td style={cell}>
                        <div>Reported <time dateTime={e.occurredAt}>{formatDateTime(e.occurredAt)}</time></div>
                        <div>Received <time dateTime={rec.receivedAt}>{formatDateTime(rec.receivedAt)}</time></div>
                        <div data-testid="audit-delay"><em>{delayLabel(rec)}</em></div>
                      </td>
                      <td style={cell}>
                        <span aria-hidden="true">{EVENT_META[e.type].icon}</span> <strong>{EVENT_META[e.type].label}</strong>
                        {cause && <div>{cause}</div>}
                      </td>
                      <td style={cell}>
                        <div>{e.reporterId}</div>
                        <div>{e.deviceId}</div>
                        <div>{e.location.lat.toFixed(4)}, {e.location.lng.toFixed(4)}</div>
                      </td>
                      <td style={{ ...cell, fontFamily: 'monospace', fontSize: '0.8em', wordBreak: 'break-all' }}>
                        <div>event {rec.eventId}</div>
                        <div>client {e.clientEventId}</div>
                      </td>
                      <td style={cell}>
                        <SyncStatusBadge status={status} />
                      </td>
                      <td style={cell}>
                        {affected.length === 0 ? (
                          <span style={{ opacity: 0.7 }}>none</span>
                        ) : (
                          affected.map((f) => (
                            <button
                              key={`${f.kind}-${f.id}`}
                              type="button"
                              data-testid={`audit-feature-${f.kind}-${f.id}`}
                              onClick={() => open(f)}
                              style={{ marginRight: 6 }}
                            >
                              {f.kind} {f.id}
                            </button>
                          ))
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
