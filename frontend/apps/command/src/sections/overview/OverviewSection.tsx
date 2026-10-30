import { useMemo } from 'react';
import { SyncStatusBadge } from '@setu/ui';
import type { EventRecord, ProjectionSnapshot } from '@setu/contract';
import { useChangeBatches } from '../../app/changes';
import { useGoTo } from '../../app/view';
import { formatDateTime } from '../../app/time';
import { useEvents, useProjections } from '../../data';
import { EVENT_META, affectedFeatures, eventSummary, feedStatus } from '../../feed/status';
import { criticalAlerts, overviewCounts, triggeredScenario } from './model';
import { SCENARIO_LIST } from './scenarios';

const NOT_PROVIDED = 'Not provided by backend';
const RECENT = 8;

function whereOf(rec: EventRecord, snap?: ProjectionSnapshot): string {
  const link = affectedFeatures(rec)[0];
  const loc = `${rec.event.location.lat.toFixed(4)}, ${rec.event.location.lng.toFixed(4)}`;
  if (!link || !snap) return loc;
  const name =
    link.kind === 'road' ? snap.roads.features.find((f) => f.properties.roadId === link.id)?.properties.name
    : link.kind === 'settlement' ? snap.settlements.features.find((f) => f.properties.settlementId === link.id)?.properties.name
    : undefined;
  return `${name ?? link.id} · ${loc}`;
}

export function OverviewSection() {
  const { snapshot } = useProjections();
  const { events } = useEvents();
  const batches = useChangeBatches();
  const goTo = useGoTo();
  const counts = overviewCounts(snapshot, events);
  const alerts = useMemo(() => criticalAlerts(snapshot, batches), [snapshot, batches]);
  const scenarios = useMemo(() => triggeredScenario(SCENARIO_LIST, events, snapshot), [events, snapshot]);
  const recent = useMemo(
    () => [...events].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)).slice(0, RECENT),
    [events],
  );
  const tiles: { id: string; label: string; value: number | undefined; note: string; goto: Parameters<typeof goTo>[0] }[] = [
    { id: 'affected', label: 'Affected settlements', value: counts?.affectedSettlements, note: 'limited + cut off', goto: 'settlements' },
    { id: 'disconnected', label: 'Disconnected', value: counts?.disconnected, note: 'cut off', goto: 'settlements' },
    { id: 'impassable', label: 'Impassable segments', value: counts?.impassableSegments, note: 'roads + bridges', goto: 'map' },
    { id: 'pending', label: 'Pending reports', value: counts?.pendingReports, note: 'accepted, not yet applied', goto: 'events' },
    { id: 'evac', label: 'Evacuation actions', value: counts?.evacuationActions, note: 'settlements with a deadline', goto: 'routes' },
  ];

  return (
    <div className="ov" data-testid="overview">
      <dl className="ov-meta">
        <div>
          <dt>District</dt>
          <dd data-testid="overview-district">Majuli <span className="ov-tag">demo fixture</span></dd>
        </div>
        <div>
          <dt>Simulation time</dt>
          <dd data-testid="overview-simtime">{NOT_PROVIDED}</dd>
        </div>
        <div>
          <dt>Active scenario</dt>
          <dd data-testid="overview-scenario">
            {scenarios.length ? (
              scenarios.map((sc) => (
                <span key={sc.id} className="ov-scenario">
                  {sc.id} · {sc.name} <span className="ov-tag ov-tag--synthetic" title={sc.note}>SYNTHETIC</span>
                </span>
              ))
            ) : (
              NOT_PROVIDED
            )}
          </dd>
        </div>
        <div>
          <dt>Snapshot</dt>
          <dd>{snapshot ? `v${snapshot.version} · ${formatDateTime(snapshot.generatedAt)}` : '–'}</dd>
        </div>
      </dl>

      <ul className="ov-tiles" aria-label="Situation counts">
        {tiles.map((t) => (
          <li key={t.id}>
            <button type="button" className="ov-tile" data-testid={`overview-count-${t.id}`} onClick={() => goTo(t.goto)}>
              <span className="ov-tile__value">{t.value ?? '–'}</span>
              <span className="ov-tile__label">{t.label}</span>
              <span className="ov-tile__note">{t.note}</span>
            </button>
          </li>
        ))}
      </ul>

      <div className="ov-cols">
        <section aria-labelledby="ov-alerts-h" className="ov-card">
          <h2 id="ov-alerts-h">Critical alerts <span className="ov-count">{alerts.length}</span></h2>
          {alerts.length === 0 ? (
            <p data-testid="overview-no-alerts">✓ No critical conditions in the current server snapshot.</p>
          ) : (
            <ul className="ov-list" data-testid="overview-alerts">
              {alerts.map((a) => (
                <li key={a.key}>
                  <button
                    type="button"
                    className="ov-alert"
                    data-testid={`overview-alert-${a.key}`}
                    data-severity={a.severity}
                    data-new={a.isNew}
                    onClick={() => goTo(a.target.kind === 'settlement' ? 'settlements' : a.target.kind === 'route' ? 'routes' : 'map', a.target)}
                  >
                    <span aria-hidden="true">{a.icon}</span> <strong>{a.label}</strong>
                    {a.isNew && <span className="ov-tag ov-tag--new">NEW</span>}
                    <span className="ov-alert__text">{a.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="ov-recent-h" className="ov-card">
          <h2 id="ov-recent-h">Recent events <button type="button" className="ov-link" onClick={() => goTo('events')}>all reports →</button></h2>
          {recent.length === 0 ? (
            <p>No reports received yet.</p>
          ) : (
            <ul className="ov-list" data-testid="overview-recent">
              {recent.map((rec) => (
                <li key={rec.eventId} className="ov-event" data-testid="overview-event" data-event-id={rec.eventId}>
                  <div>
                    <span aria-hidden="true">{EVENT_META[rec.event.type].icon}</span> <strong>{EVENT_META[rec.event.type].label}</strong>: {eventSummary(rec)}
                    <SyncStatusBadge status={feedStatus(rec, snapshot?.version)} />
                  </div>
                  <div className="ov-event__meta">
                    {whereOf(rec, snapshot)} · observed <time dateTime={rec.event.occurredAt}>{formatDateTime(rec.event.occurredAt)}</time> · received{' '}
                    <time dateTime={rec.receivedAt}>{formatDateTime(rec.receivedAt)}</time>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
