import { useProjections } from '../data';
import { buildSituation } from './situation';
import { useView } from './view';

const MAX_LINES = 2;

/** Persistent compact strip: soonest-first situation lines + the three headline counts (server projections). */
export function SituationSummary() {
  const { snapshot } = useProjections();
  const { setView } = useView();
  const sit = buildSituation(snapshot);
  const cutOff = snapshot?.settlements.features.filter((f) => f.properties.accessibility === 'cut_off').length;
  const blocked = snapshot?.roads.features.filter((f) => f.properties.status === 'blocked').length;
  const active = snapshot?.routes.features.filter((f) => f.properties.status !== 'unavailable').length;
  const more = sit.lines.length - MAX_LINES;
  return (
    <section className="cmd-situation" data-testid="situation-summary" data-all-clear={sit.allClear} aria-label="Situation summary" aria-live="polite">
      <strong className="cmd-situation__title">Situation</strong>
      {!snapshot ? (
        <span>Loading…</span>
      ) : sit.allClear ? (
        <span>✓ No settlements cut off, no roads or bridges blocked.</span>
      ) : (
        <ul>
          {sit.lines.slice(0, MAX_LINES).map((l) => (
            <li key={l.key} data-kind={l.kind}>⛔ {l.text}</li>
          ))}
          {more > 0 && (
            <li>
              <button type="button" onClick={() => setView('overview')} data-testid="situation-more">+{more} more</button>
            </li>
          )}
        </ul>
      )}
      <dl className="cmd-situation__counts">
        <div><dt>Cut off</dt><dd data-testid="stat-cut-off">{cutOff ?? '–'}</dd></div>
        <div><dt>Blocked roads</dt><dd data-testid="stat-blocked-roads">{blocked ?? '–'}</dd></div>
        <div><dt>Active routes</dt><dd data-testid="stat-active-routes">{active ?? '–'}</dd></div>
      </dl>
    </section>
  );
}
