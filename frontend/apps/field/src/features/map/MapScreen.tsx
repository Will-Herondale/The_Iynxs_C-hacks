import { useMemo } from 'react';
import { EmptyState, Panel } from '@setu/ui';
import { useCachedProjections, useRemoteEvents } from '../../offline/index.js';
import { DataAsOf, OriginBadge, StaleWarning } from '../status/index.js';
import { useQueue, useSyncState } from '../../sync/index.js';
import { BASEMAP_SOURCE } from './basemap.js';
import { MapCanvas } from './MapCanvas.js';
import { projectionView } from './projectionLayers.js';
import { MARKER_SHAPE, remoteMarkers, reportMarkers } from './reportMarkers.js';
import { useVolunteerPosition } from './useVolunteerPosition.js';
import './map.css';

export interface MapScreenProps {
  /** Opens a report's detail. Default: hash route `#/report/<clientEventId>`. */
  onOpenReport?: (clientEventId: string) => void;
}

const defaultOpen = (id: string) => {
  window.location.hash = `#/report/${id}`;
};

export function MapScreen({ onOpenReport = defaultOpen }: MapScreenProps) {
  const { snapshot, cachedAt, stale } = useCachedProjections();
  const { online } = useSyncState();
  const items = useQueue();
  const position = useVolunteerPosition();
  const reports = useMemo(() => reportMarkers(items, online), [items, online]);
  const remoteRecords = useRemoteEvents();
  const remote = useMemo(() => remoteMarkers(remoteRecords, new Set(items.map((i) => i.clientEventId))), [remoteRecords, items]);
  const allMarkers = useMemo(() => [...reports, ...remote], [reports, remote]);
  const view = useMemo(() => (snapshot ? projectionView(snapshot) : undefined), [snapshot]);

  return (
    <Panel title="Map">
      <p data-testid="map-offline-note" className="map-note">
        {online ? 'Online.' : 'Offline: showing the last saved map data.'} This map needs no network.
      </p>
      <StaleWarning cachedAt={cachedAt} />
      <p className="map-note"><DataAsOf cachedAt={cachedAt} /></p>
      <MapCanvas snapshot={snapshot} reports={allMarkers} position={position} onOpenReport={onOpenReport} />
      {BASEMAP_SOURCE === 'placeholder' && (
        <p className="map-note" data-testid="map-basemap-note">Basemap: district layers not loaded yet (plain background).</p>
      )}

      <section aria-label="Map key" className="map-key" data-testid="map-key">
        <h3>Key</h3>
        <ul>
          {(Object.keys(MARKER_SHAPE) as (keyof typeof MARKER_SHAPE)[]).map((k) => (
            <li key={k}><span aria-hidden="true">{MARKER_SHAPE[k].glyph}</span> {MARKER_SHAPE[k].name} ({MARKER_SHAPE[k].shape})</li>
          ))}
          <li><span aria-hidden="true">●</span> Local (circle): created on this device; "Local · Accepted" once the server applied it. <span aria-hidden="true">⬢</span> Remote (hexagon, dotted outline): received from the server.</li>
          <li>Blue area: flood. Solid outline = observed; dashed = modelled, SYNTHETIC (DEM threshold, not a validated simulation).</li>
          <li>Red solid line: blocked road. Orange dashed line: partially blocked.</li>
          <li>⊘ Cut off / △ Limited access: settlement labels.</li>
        </ul>
      </section>

      <section aria-label="Projection status" data-testid="map-projection">
        <h3>Latest server projection</h3>
        {!view ? (
          <EmptyState title="No projection saved on this device yet">Connect once to download road and flood status. Your reports still show on the map.</EmptyState>
        ) : (
          <>
            <p data-testid="map-projection-meta">
              Version {view.version}, generated <time dateTime={view.generatedAt}>{new Date(view.generatedAt).toLocaleString()}</time>.{' '}
              {stale ? 'Showing saved copy' : 'Up to date'}
              {cachedAt ? ` (fetched ${new Date(cachedAt).toLocaleTimeString()})` : ''}.
            </p>
            <h4>Blocked roads</h4>
            {view.blockedRoads.length === 0 ? <p>None reported.</p> : (
              <ul data-testid="map-blocked-list">
                {view.blockedRoads.map((r) => (
                  <li key={r.id}>{r.status === 'blocked' ? '✕ Blocked' : '◐ Partly blocked'} {r.kind}: {r.name} <small>({r.id})</small>{r.reason ? ` — ${r.reason}` : ''}</li>
                ))}
              </ul>
            )}
            <h4>Flood areas</h4>
            {view.flood.length === 0 ? <p>None.</p> : (
              <ul data-testid="map-flood-list">
                {view.flood.map((f) => <li key={f.id}>{f.label}: {f.id}, depth {f.depthCm} cm</li>)}
              </ul>
            )}
            <h4>Cut-off settlements</h4>
            {view.cutOff.length === 0 ? <p>None.</p> : (
              <ul data-testid="map-cutoff-list">
                {view.cutOff.map((s) => <li key={s.id}>{s.accessibility === 'cut_off' ? '⊘ Cut off' : '△ Limited access'}: {s.name}{s.reason ? ` — ${s.reason}` : ''}</li>)}
              </ul>
            )}
          </>
        )}
      </section>

      <section aria-label="My reports on the map" data-testid="map-reports">
        <h3>My reports ({reports.length})</h3>
        {reports.length === 0 ? <p>No reports with a location yet.</p> : (
          <ul>
            {reports.map((r) => (
              <li key={r.clientEventId} data-state={r.state}>
                <button type="button" className="map-reports__open" data-testid="map-report-link" onClick={() => onOpenReport(r.clientEventId)}>
                  <OriginBadge origin="local" accepted={r.accepted} /> <span aria-hidden="true">{MARKER_SHAPE[r.state].glyph}</span> {r.title} — {r.statusLabel}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Reports received from the server" data-testid="map-remote-reports">
        <h3>Reports from others ({remote.length})</h3>
        {remote.length === 0 ? <p>None received yet.</p> : (
          <ul>
            {remote.map((r) => (
              <li key={r.clientEventId} data-state={r.state} data-origin="remote">
                <OriginBadge origin="remote" /> <span aria-hidden="true">{MARKER_SHAPE[r.state].glyph}</span> {r.title} — {r.statusLabel}
              </li>
            ))}
          </ul>
        )}
      </section>
    </Panel>
  );
}
