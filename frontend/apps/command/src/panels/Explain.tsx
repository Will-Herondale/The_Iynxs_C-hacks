import type { ProjectionSnapshot, SettlementProps } from '@setu/contract';
import { useSelection } from '../app';
import { Explanation } from '@setu/ui';
import { featureKindOf } from './model';

type Explained = NonNullable<SettlementProps['cutOffReason']>;

/** "Why cut off" / "Why this route is refused": server text + links to blocking features and source events. */
export function ExplainBlock({ testId, title, reason, snapshot }: {
  testId: string; title: string; reason: Explained; snapshot?: ProjectionSnapshot;
}) {
  const { select } = useSelection();
  const items = [
    ...reason.blockingFeatureIds.map((id) => {
      const kind = snapshot ? featureKindOf(snapshot, id) : undefined;
      return kind ? (
        <button key={id} type="button" data-testid={`blocking-link-${id}`} onClick={() => select({ kind, id })}>Blocked by {id}</button>
      ) : (
        <span key={id} data-testid={`blocking-link-${id}`}>Blocked by {id}</span>
      );
    }),
    ...(reason.sourceEventIds ?? []).map((id) => (
      <a key={id} href={`#incident-${id}`} data-testid="source-event-link" data-client-event-id={id}>Report {id}</a>
    )),
  ];
  return (
    <div data-testid={testId}>
      <Explanation title={title} summary={reason.summary}>
        {items.length > 0 && <ul className="setu-explain__items">{items.map((it, i) => <li key={i}>{it}</li>)}</ul>}
      </Explanation>
    </div>
  );
}
