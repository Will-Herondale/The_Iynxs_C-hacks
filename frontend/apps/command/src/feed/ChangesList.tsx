import { useEffect, useState } from 'react';
import { Panel, EmptyState } from '@setu/ui';
import { useSelection } from '../app';
import { useProjections } from '../data';
import { useSnapshotChanges, type ChangeBatch } from './useSnapshotChanges';

const FRESH_MS = 8000;

/** "What just changed" list; the newest batch is flagged for a few seconds. */
/** Self-contained: reads the snapshot and diffs consecutive server versions. */
export function ChangesList() {
  const { snapshot } = useProjections();
  return <ChangesView batches={useSnapshotChanges(snapshot)} />;
}

export function ChangesView({ batches }: { batches: ChangeBatch[] }) {
  const { select } = useSelection();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const latest = batches[0];
    if (!latest) return;
    const left = latest.at + FRESH_MS - Date.now();
    if (left <= 0) return;
    const t = setTimeout(() => setNow(Date.now()), left + 50);
    return () => clearTimeout(t);
  }, [batches]);

  return (
    <Panel title="Recent changes">
      <div data-testid="changes-list" aria-live="polite">
        {batches.length === 0 ? (
          <EmptyState title="No changes yet" />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {batches.map((b, i) => {
              const fresh = i === 0 && now - b.at < FRESH_MS;
              return (
                <li
                  key={b.version}
                  data-testid="change-batch"
                  data-version={b.version}
                  data-fresh={fresh}
                  style={{ padding: '4px 0', background: fresh ? 'rgba(255,200,0,0.18)' : undefined }}
                >
                  <strong>v{b.version}</strong>{' '}
                  {b.changes.map((c, j) => (
                    <span key={`${c.kind}-${c.id}`}>
                      {j > 0 && ', '}
                      <button
                        type="button"
                        data-testid="change-item"
                        onClick={() => select({ kind: c.kind, id: c.id })}
                        style={{ background: 'none', border: 0, color: 'inherit', textDecoration: 'underline', cursor: 'pointer', padding: 0, font: 'inherit' }}
                      >
                        {c.text}
                      </button>
                    </span>
                  ))}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
