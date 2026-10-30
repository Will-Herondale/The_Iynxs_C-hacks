import { formatClock } from '../app/time';
import { useMemo } from 'react';
import { Panel, EmptyState, SyncStatusBadge } from '@setu/ui';
import type { EventRecord } from '@setu/contract';
import { useSelection } from '../app';
import { useEvents, useProjections } from '../data';
import { EVENT_META, affectedFeatures, eventSummary, feedStatus } from './status';

function clientId(rec: EventRecord): string {
  return rec.event.clientEventId;
}

export function IncidentFeed() {
  const { events, error } = useEvents();
  const { version } = useProjections();
  const { select } = useSelection();

  const sorted = useMemo(
    () => [...events].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)),
    [events],
  );

  return (
    <Panel title="Incident feed">
      <div data-testid="incident-feed" aria-live="polite">
        {error && <p role="alert">Could not refresh events; showing last known.</p>}
        {sorted.length === 0 ? (
          <EmptyState title="No incidents reported" />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sorted.map((rec) => {
              const status = feedStatus(rec, version);
              const meta = EVENT_META[rec.event.type];
              const loc = rec.event.location;
              const links = affectedFeatures(rec);
              return (
                <li
                  key={rec.eventId}
                  data-testid="incident-item"
                  data-client-event-id={clientId(rec)}
                  data-status={status}
                  data-type={rec.event.type}
                  style={{ padding: '6px 0', borderBottom: '1px solid rgba(128,128,128,0.3)' }}
                >
                  <div>
                    <span aria-hidden="true">{meta.icon}</span> <strong>{meta.label}</strong>: {eventSummary(rec)}
                  </div>
                  <div style={{ fontSize: '0.85em', opacity: 0.8 }}>
                    <span>
                      {loc.lat.toFixed(4)}, {loc.lng.toFixed(4)}
                    </span>{' '}
                    · <time dateTime={rec.receivedAt}>{formatClock(rec.receivedAt)}</time>
                  </div>
                  <div>
                    <SyncStatusBadge status={status} />
                    {links.map((l) => (
                      <button
                        key={`${l.kind}-${l.id}`}
                        type="button"
                        data-testid={`incident-link-${l.kind}-${l.id}`}
                        onClick={() => select(l)}
                        style={{ marginLeft: 6 }}
                      >
                        {l.kind} {l.id}
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
