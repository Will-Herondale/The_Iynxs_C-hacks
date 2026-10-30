import type { ProjectionSnapshot } from '@setu/contract';
import { Badge, EmptyState, Panel } from '@setu/ui';
import { useSelection } from '../app';
import { useProjections } from '../data';
import { DeadlineBadge } from '@setu/ui';
import { evacDeadlines } from './model';

export function EvacDeadlinesView({ snapshot, now }: { snapshot?: ProjectionSnapshot; now?: Date }) {
  const { select } = useSelection();
  const items = snapshot ? evacDeadlines(snapshot) : [];
  return (
    <div data-testid="evac-deadlines">
      <Panel title="Evacuation deadlines">
        {items.length === 0 ? (
          <EmptyState title="No evacuation deadlines" />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {items.map((p) => (
              <li key={p.settlementId} style={{ display: 'flex', gap: 8, justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <button type="button" onClick={() => select({ kind: 'settlement', id: p.settlementId })}>
                  <strong>{p.settlementId}</strong> {p.name}
                </button>
                <span>
                  {p.evacuationPriority && (
                    <span data-testid={`priority-${p.settlementId}`} data-priority={p.evacuationPriority}>
                      <Badge tone={p.evacuationPriority === 'critical' ? 'danger' : p.evacuationPriority === 'high' ? 'warning' : 'neutral'} icon={p.evacuationPriority === 'critical' ? '!!' : '!'}>
                        {p.evacuationPriority}
                      </Badge>{' '}
                    </span>
                  )}
                  <DeadlineBadge data-testid={`deadline-${p.settlementId}`} deadline={p.evacuationDeadline!} {...(now ? { now } : {})} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export function EvacDeadlines() {
  const { snapshot } = useProjections();
  return <EvacDeadlinesView snapshot={snapshot} />;
}
