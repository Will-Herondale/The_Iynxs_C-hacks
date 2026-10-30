import { useProjections } from '../data';
import { buildSituation } from './situation';

export function SituationSummary() {
  const { snapshot } = useProjections();
  const sit = buildSituation(snapshot);
  return (
    <section className="cmd-situation" data-testid="situation-summary" data-all-clear={sit.allClear} aria-label="Situation summary" aria-live="polite">
      <strong className="cmd-situation__title">Situation</strong>
      {!snapshot ? (
        <span>Loading…</span>
      ) : sit.allClear ? (
        <span>✓ No settlements cut off, no roads or bridges blocked.</span>
      ) : (
        <ul>
          {sit.lines.map((l) => (
            <li key={l.key} data-kind={l.kind}>⛔ {l.text}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
