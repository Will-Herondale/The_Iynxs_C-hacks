import { useMemo, useState } from 'react';
import { SyncStatusBadge } from '@setu/ui';
import type { EventRecord, ProjectionSnapshot } from '@setu/contract';
import { useChangeBatches } from '../../app/changes';
import { useGoTo } from '../../app/view';
import { formatDateTime } from '../../app/time';
import { useEvents, useProjections } from '../../data';
import { EVENT_META, affectedFeatures, eventSummary, feedStatus } from '../../feed/status';
import { criticalAlerts, overviewCounts } from './model';

const RECENT = 8;
/** Alerts shown before "Show all": the repeated route-refusal alerts would otherwise bury the first screen. */
const ALERTS_SHOWN = 3;

function whereOf(rec: EventRecord, snap?: ProjectionSnapshot): string {
  const link = affectedFeatures(rec)[0];
  const loc = `${rec.event.location.lat.toFixed(4)}, ${rec.event.location.lng.toFixed(4)}`;
  if (!link || !snap) return loc;
  const name =
    link.kind === 'road' ? snap.roads.features.find((f) => f.properties.roadId === link.id)?.properties.name
    : link.kind === 'settlement' ? snap.settlements.features.find((f) => f.properties.settlementId === link.id)?.properties.name
    : link.kind === 'shelter' ? snap.shelters.features.find((f) => f.properties.shelterId === link.id)?.properties.name
    : undefined;
  return `${name ?? link.id} · ${loc}`;
}

export function OverviewSection() {
  const { snapshot } = useProjections();
  const { events } = useEvents();
  const batches = useChangeBatches();
  const goTo = useGoTo();
  const [allAlerts, setAllAlerts] = useState(false);
  const counts = overviewCounts(snapshot, events);
  const alerts = useMemo(() => criticalAlerts(snapshot, batches), [snapshot, batches]);
  const verifiedRoutes = snapshot?.routes.features.filter((f) => f.properties.status !== 'unavailable' && f.properties.computation?.verified === true).length ?? 0;
  const recent = useMemo(
    () => [...events].sort((a, b) => Date.parse(b.receivedAt) - Date.parse(a.receivedAt)).slice(0, RECENT),
    [events],
  );
  const tiles: { id: string; label: string; value: number | undefined; note: string; goto: Parameters<typeof goTo>[0] }[] = [
    { id: 'affected', label: 'Villages affected', value: counts?.affectedSettlements, note: 'harder to reach or cut off', goto: 'settlements' },
    { id: 'disconnected', label: 'Villages cut off', value: counts?.disconnected, note: 'no way in or out', goto: 'settlements' },
    { id: 'impassable', label: 'Roads and bridges blocked', value: counts?.impassableSegments, note: 'cannot be used', goto: 'map' },
    { id: 'unavailable-routes', label: 'Evacuation routes not usable', value: counts?.unavailableRoutes, note: 'too long or refused', goto: 'routes' },
    { id: 'pending', label: 'Reports waiting', value: counts?.pendingReports, note: 'received, not yet applied', goto: 'events' },
    { id: 'evac', label: 'Villages with a deadline', value: counts?.evacuationActions, note: 'evacuation time limit', goto: 'routes' },
  ];

  return (
    <div className="ov" data-testid="overview">
      {counts && (
        <p className="ov-headline" data-testid="overview-headline">
          {counts.impassableSegments === 0 ? 'No roads or bridges are blocked.' : `${counts.impassableSegments} road or bridge ${counts.impassableSegments === 1 ? 'is' : 'are'} blocked.`}{' '}
          {counts.disconnected === 0 ? 'No villages are cut off.' : `${counts.disconnected} ${counts.disconnected === 1 ? 'village is' : 'villages are'} cut off.`}{' '}
          {snapshot && snapshot.routes.features.length > 0 && `${snapshot.routes.features.length - counts.unavailableRoutes} of ${snapshot.routes.features.length} evacuation routes can be used.`}
        </p>
      )}
      <p data-testid="overview-honesty-note" className="ov-note">Shelters are pre-identified camps, not confirmed. {verifiedRoutes > 0 ? 'Routes marked calculated were computed over the road network; other route times remain indicative.' : 'Routes and travel times are scenario data, not verified as computed (indicative, source unconfirmed).'}</p>
      <dl className="ov-meta">
        <div>
          <dt>District</dt>
          <dd data-testid="overview-district">Majuli</dd>
        </div>
        <div>
          <dt>Data version</dt>
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
              {alerts.map((a, i) => (
                <li key={a.key} hidden={!allAlerts && i >= ALERTS_SHOWN}>
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
          {alerts.length > ALERTS_SHOWN && (
            <button type="button" className="ov-link" data-testid="overview-alerts-toggle" onClick={() => setAllAlerts((v) => !v)}>
              {allAlerts ? 'Show fewer alerts' : `Show all ${alerts.length} alerts`}
            </button>
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
