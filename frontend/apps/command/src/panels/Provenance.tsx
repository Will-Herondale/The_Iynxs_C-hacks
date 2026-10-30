import type { ProvenanceItem } from '../data';
import { SyncStatusBadge } from '@setu/ui';
import { EVENT_META, eventSummary } from '../feed';

export { joinProvenance, type ProvenanceItem } from '../data';

export function ProvenanceView({ featureId, items }: { featureId: string; items: ProvenanceItem[] }) {
  return (
    <div data-testid={`provenance-${featureId}`}>
      <h4 style={{ margin: '8px 0 4px' }}>Based on these reports</h4>
      {items.length === 0 ? (
        <p style={{ margin: 0, opacity: 0.8 }}>No source reports recorded.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none' }}>
          {items.map(({ sourceId: clientEventId, record, status }) => (
            <li key={clientEventId} data-testid="provenance-item" data-client-event-id={clientEventId} style={{ padding: '4px 0', borderBottom: '1px solid rgba(128,128,128,.3)' }}>
              {record ? (
                <>
                  <div>
                    <span aria-hidden="true">{EVENT_META[record.event.type].icon}</span> <strong>{EVENT_META[record.event.type].label}</strong>: {eventSummary(record)}
                  </div>
                  <div style={{ fontSize: '0.85em' }}>
                    <time dateTime={record.event.occurredAt}>{new Date(record.event.occurredAt).toLocaleString()}</time>
                    {' · reporter '}{record.event.reporterId}{' · device '}{record.event.deviceId}
                  </div>
                  <SyncStatusBadge status={status} />
                </>
              ) : (
                <span>Report {clientEventId} (details not loaded)</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
