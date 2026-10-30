import type { ReactNode } from 'react';
import type { FieldEvent } from '@setu/contract';
import { Badge, Button, EmptyState, Panel } from '@setu/ui';
import { useQueueItem, useSyncState } from '../../sync/index.js';
import type { ArchivedItem, QueueItem } from '../../sync/index.js';
import { EVENT_TYPE_LABEL, categoryForEvent, CATEGORIES } from '../report/categories.js';
import { describeLocation } from '../report/location.js';
import { formatIst, syncLabel } from './format.js';

const mono = { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', wordBreak: 'break-all' as const };
const Mono = ({ children, testId }: { children: ReactNode; testId?: string }) => <code style={mono} data-testid={testId}>{children}</code>;
const Row = ({ label, children, testId }: { label: string; children: ReactNode; testId?: string }) => (
  <div style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 35%) 1fr', gap: 8, padding: '6px 0', borderBottom: '1px solid #e5e7eb' }} data-testid={testId}>
    <dt style={{ fontWeight: 600 }}>{label}</dt>
    <dd style={{ margin: 0 }}>{children}</dd>
  </div>
);

function categoryLabel(e: FieldEvent): string {
  const c = categoryForEvent(e);
  return (c && CATEGORIES.find((d) => d.category === c)?.label) ?? EVENT_TYPE_LABEL[e.type] ?? e.type;
}

/** Fields of the original payload relevant to the category, never invented. */
export function payloadLines(e: FieldEvent): [string, string][] {
  const o = e as unknown as Record<string, unknown>;
  const pairs: [string, string][] = [];
  for (const k of ['roadId', 'blockage', 'cause', 'severity', 'depthCm', 'areaId', 'levelCm', 'trend', 'gaugeId', 'note']) {
    if (o[k] !== undefined && o[k] !== '') pairs.push([k, k === 'levelCm' ? `${o[k]} cm` : k === 'depthCm' ? `${o[k]} cm` : String(o[k])]);
  }
  return pairs;
}

export interface ReportDetailViewProps {
  item?: QueueItem | ArchivedItem;
  archived?: boolean;
  online: boolean;
  /** Superseding item id (for archived originals). */
  supersededBy?: string;
  onBack?: () => void;
  onOpen?: (clientEventId: string) => void;
  /** Reopens a rejected report in the form; saving creates a linked replacement. */
  onEdit?: (item: QueueItem) => void;
}

/** Pure view over one queue item (live or archived original). */
export function ReportDetailView({ item, archived, online, supersededBy, onBack, onOpen, onEdit }: ReportDetailViewProps) {
  if (!item) {
    return (
      <Panel title="Report">
        <EmptyState title="Report not found">This report is not on this device (it may have been discarded).</EmptyState>
        {onBack && <Button onClick={onBack} data-testid="detail-back">Back</Button>}
      </Panel>
    );
  }
  const e = item.event;
  const label = archived ? 'Superseded' : syncLabel(item.status, online);
  const ack = item.eventId !== undefined || item.acceptedAtVersion !== undefined;
  const acc = e.location.accuracyM;
  return (
    <Panel title={categoryLabel(e)}>
      <div data-testid="report-detail" data-client-event-id={item.clientEventId} data-status={archived ? 'superseded' : item.status}>
        {onBack && <Button onClick={onBack} data-testid="detail-back">Back</Button>}
        <p>
          <span data-testid="detail-status">
            <Badge
              tone={item.status === 'synced' ? 'success' : item.status === 'rejected' || item.status === 'failed' ? 'danger' : item.status === 'conflict' ? 'warning' : 'info'}
              icon={item.status === 'synced' ? '✓' : item.status === 'conflict' ? '⚠' : item.status === 'rejected' || item.status === 'failed' ? '✕' : '…'}
            >
              {label}
            </Badge>
          </span>
        </p>
        <dl style={{ margin: 0 }}>
          <Row label="Client event ID"><Mono testId="detail-client-event-id">{item.clientEventId}</Mono></Row>
          <Row label="Event ID (server)">
            {item.eventId ? <Mono testId="detail-event-id">{item.eventId}</Mono> : <span data-testid="detail-event-id-none">Not assigned yet</span>}
          </Row>
          <Row label="Category">{categoryLabel(e)} <small>(contract type <Mono>{e.type}</Mono>)</small></Row>
          <Row label="Location" testId="detail-location">
            {e.location.lat.toFixed(5)}, {e.location.lng.toFixed(5)}
            <br />{describeLocation(acc === undefined ? 'manual' : 'gps', acc)}
          </Row>
          <Row label="Observed at" testId="detail-observed">{formatIst(e.occurredAt)}</Row>
          <Row label="Submitted (saved on device)" testId="detail-submitted">{formatIst(item.createdAt)}</Row>
          <Row label="Last update">{formatIst(item.updatedAt)} · attempts: {item.attempts}</Row>
        </dl>

        <h3>Original payload</h3>
        <ul data-testid="detail-payload">
          {payloadLines(e).map(([k, v]) => <li key={k}><Mono>{k}</Mono>: {v}</li>)}
          {e.photoRefs?.length ? <li><Mono>photoRefs</Mono>: {e.photoRefs.join(', ')} (reference only)</li> : null}
        </ul>

        <h3>Server acknowledgement</h3>
        {ack ? (
          <p data-testid="detail-ack">
            eventId <Mono>{item.eventId ?? '—'}</Mono>, accepted at version <Mono>{item.acceptedAtVersion ?? '—'}</Mono>
            {item.status === 'synced' ? ' · confirmed applied' : ' · not yet confirmed applied'}
          </p>
        ) : (
          <p data-testid="detail-ack-none">No acknowledgement from the server yet.</p>
        )}
        {item.lastError && item.status !== 'synced' && <p role="status">Last error: {item.lastError}</p>}
        {item.status === 'conflict' && (
          <div data-testid="detail-review" role="status">
            <strong>Requires review</strong>: {item.conflict?.reason ?? 'the server reported a conflict.'}
          </div>
        )}
        {item.status === 'rejected' && (
          <div data-testid="detail-review" role="status">
            <strong>Rejected by the server.</strong>
            <ul>{(item.validationErrors ?? []).map((v, i) => <li key={i}>{v.path ? `${v.path}: ` : ''}{v.message}</li>)}</ul>
          </div>
        )}

        {!archived && item.status === 'rejected' && onEdit && (
          <Button variant="primary" data-testid="detail-edit" onClick={() => onEdit(item)}>Edit and resubmit</Button>
        )}

        <h3>Provenance</h3>
        <ul data-testid="detail-provenance">
          {archived ? (
            <li data-testid="provenance-superseded">
              Original, superseded
              {supersededBy ? <> by <Button onClick={() => onOpen?.(supersededBy)} data-testid="provenance-open-replacement"><Mono>{supersededBy}</Mono></Button></> : null}. It is kept for the record and is not synced.
            </li>
          ) : (
            <li data-testid="provenance-original">{item.supersedes ? 'Replacement report' : 'Original report'}</li>
          )}
          {!archived && item.supersedes && (
            <li data-testid="provenance-supersedes">
              Replaces <Button onClick={() => onOpen?.(item.supersedes!)} data-testid="provenance-open-original"><Mono>{item.supersedes}</Mono></Button>
            </li>
          )}
        </ul>
      </div>
    </Panel>
  );
}

export interface ReportDetailScreenProps {
  clientEventId: string;
  onBack?: () => void;
  /** Navigate to another report (original/replacement). */
  onOpen?: (clientEventId: string) => void;
  onEdit?: (item: QueueItem) => void;
}

/** Live detail screen: reads the local queue (and the archive of superseded originals). */
export function ReportDetailScreen({ clientEventId, onBack, onOpen, onEdit }: ReportDetailScreenProps) {
  const { item, archived, loading } = useQueueItem(clientEventId);
  const { online } = useSyncState();
  if (loading) return <Panel title="Report"><p role="status">Loading…</p></Panel>;
  return (
    <ReportDetailView
      item={item ?? archived} archived={!item && !!archived} supersededBy={archived?.supersededBy}
      online={online} onBack={onBack} onOpen={onOpen} onEdit={onEdit}
    />
  );
}
