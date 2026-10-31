import { useMemo, useState } from 'react';
import type { PeopleSnapshot } from '@setu/contract';
import { Badge, EmptyState, Panel } from '@setu/ui';
import { usePeople } from '../../data';
import { MonoId } from '../../panels/NotProvided';
import { KIND_LABEL, campsWithPeople, filterCheckins, needsLabel, splitHouseholds } from './model';

const small = { fontSize: '0.85em', opacity: 0.85 } as const;
const time = (iso: string) => new Date(iso).toLocaleString();

/**
 * Command view over the people endpoint. Shows what the field actually
 * recorded per camp, and flags possible duplicates without ever merging them.
 */
export function CampsPeopleSectionView({ snapshot }: { snapshot?: PeopleSnapshot }) {
  const [q, setQ] = useState('');
  const camps = useMemo(() => campsWithPeople(snapshot), [snapshot]);
  const checkins = useMemo(() => filterCheckins(snapshot, q), [snapshot, q]);
  const splits = useMemo(() => splitHouseholds(snapshot), [snapshot]);

  if (!snapshot) {
    return (
      <div data-testid="camps-people-section">
        <Panel title="Camps & People"><EmptyState title="Loading people data." /></Panel>
      </div>
    );
  }

  const totals = snapshot.totals;

  return (
    <div data-testid="camps-people-section">
      <Panel title="Camps & People">
        <p style={{ ...small, margin: '0 0 8px' }} data-testid="people-source-note">
          Counts come from field check-ins submitted by volunteers. High-confidence
          name matches (85% or higher) are auto-merged; the rest stay as duplicate
          suggestions for a human decision. Shown separately from
          shelter-reported occupancy.
        </p>
        <dl data-testid="people-totals" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', margin: '0 0 10px' }}>
          <div><dt>Check-ins</dt><dd data-testid="people-total-checkins">{totals.checkins}</dd></div>
          <div><dt>Individuals</dt><dd data-testid="people-total-individuals">{totals.individuals}</dd></div>
          <div><dt>Auto-merged</dt><dd data-testid="people-total-auto-merged">{snapshot.autoMergedCount}</dd></div>
          <div><dt>Households</dt><dd data-testid="people-total-households">{totals.households}</dd></div>
          <div><dt>Camps with check-ins</dt><dd data-testid="people-total-camps">{totals.campsWithCheckins}</dd></div>
        </dl>
        <label>Search people{' '}
          <input type="search" className="setu-table__search" aria-label="Search people" data-testid="people-search"
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="name, camp, household id." />
        </label>
      </Panel>

      <Panel title="Per-camp check-in counts">
        {camps.length === 0 ? (
          <EmptyState title="No check-ins yet">Field volunteers have not checked anyone in at a camp.</EmptyState>
        ) : (
          <div className="setu-table"><div className="setu-table__scroll">
            <table data-testid="camp-people-table">
              <thead>
                <tr>
                  <th scope="col">Camp</th>
                  <th scope="col">Open</th>
                  <th scope="col">Capacity</th>
                  <th scope="col">Shelter-reported occupancy</th>
                  <th scope="col">Check-ins</th>
                  <th scope="col">Households</th>
                  <th scope="col">People (from check-ins)</th>
                  <th scope="col">Needs</th>
                  <th scope="col">Last check-in</th>
                </tr>
              </thead>
              <tbody>
                {camps.map((c) => (
                  <tr key={c.campId} data-testid={`camp-people-row-${c.campId}`} data-people={c.people}>
                    <td>{c.name} <MonoId>{c.campId}</MonoId>{c.synthetic && <> <Badge tone="neutral">DEMO</Badge></>}</td>
                    <td>{c.open ? <Badge tone="success">Open</Badge> : <Badge tone="neutral">Not confirmed</Badge>}</td>
                    <td data-testid={`camp-capacity-${c.campId}`}>{c.capacity > 0 ? c.capacity : 'not published'}</td>
                    <td data-testid={`camp-occupancy-${c.campId}`}>{c.occupancy}</td>
                    <td data-testid={`camp-checkins-${c.campId}`}>{c.checkins}</td>
                    <td data-testid={`camp-households-${c.campId}`}>{c.households}</td>
                    <td data-testid={`camp-people-${c.campId}`}>{c.people}</td>
                    <td>{needsLabel(c.needs)}</td>
                    <td>{c.lastCheckinAt ? time(c.lastCheckinAt) : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div></div>
        )}
      </Panel>

      {splits.length > 0 && (
        <Panel title="Households recorded at more than one camp">
          <p style={{ ...small, marginTop: 0 }}>Same household ID, different camps. Nothing has been merged.</p>
          <ul data-testid="split-household-list" style={{ margin: 0 }}>
            {splits.map((s) => (
              <li key={s.householdId} data-testid={`split-household-${s.householdId}`}>
                <MonoId>{s.householdId}</MonoId>: {s.names.join(', ')} at {s.camps.join(', ')}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Possible duplicates (same name, different records)">
        {snapshot.duplicateSuggestions.length === 0 ? (
          <EmptyState title="No possible duplicates">Each individual check-in has a distinct name or a distinct spelling.</EmptyState>
        ) : (
          <>
            <p style={{ ...small, marginTop: 0 }}>
              Suggestions only. The field names are compared; nothing is merged without a human decision.
            </p>
            <ul data-testid="duplicate-suggestion-list" style={{ margin: 0 }}>
              {snapshot.duplicateSuggestions.map((d) => (
                <li key={d.proposalId} data-testid={`duplicate-suggestion-${d.proposalId}`} data-score={d.scoreBp}>
                  <strong>{d.a.name}</strong> at {d.a.campName ?? d.a.campId ?? 'unknown camp'}
                  {' ↔ '}
                  <strong>{d.b.name}</strong> at {d.b.campName ?? d.b.campId ?? 'unknown camp'}
                  {' '}<Badge tone="warning">{(d.scoreBp / 100).toFixed(0)}% match</Badge>
                </li>
              ))}
            </ul>
          </>
        )}
      </Panel>

      <Panel title="Check-in records">
        <p style={{ ...small, marginTop: 0 }} data-testid="people-count">{checkins.length} of {snapshot.checkins.length} records</p>
        {checkins.length === 0 ? (
          <EmptyState title="No check-ins match">{snapshot.checkins.length === 0 ? 'No field check-ins have been submitted yet.' : 'Clear the search to see all records.'}</EmptyState>
        ) : (
          <ul data-testid="people-checkin-list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {checkins.map((r) => (
              <li key={r.eventId} data-testid={`people-checkin-row-${r.eventId}`} data-kind={r.kind}
                data-camp={r.campId ?? ''} data-household={r.householdId ?? ''}
                {...(r.mergedInto ? { 'data-merged-into': r.mergedInto } : {})}
                style={{ padding: '6px 0', borderBottom: '1px solid rgba(128,128,128,.3)' }}>
                <strong>{r.displayName}</strong>{' '}
                <Badge tone={r.kind === 'household' ? 'neutral' : 'success'}>{KIND_LABEL[r.kind]}</Badge>{' '}
                {r.mergedInto && (
                  <Badge tone="neutral">{`merged into ${r.mergedInto}`}</Badge>
                )}{' '}
                <span style={small}>
                  {r.campName ?? r.campId ?? 'no camp recorded'}
                  {r.kind === 'household' ? ` · ${r.members} ${r.members === 1 ? 'person' : 'people'}` : ''}
                  {r.ageBand ? ` · ${r.ageBand}` : ''}
                  {r.sex ? ` · ${r.sex}` : ''}
                  {r.householdId ? ` · household ${r.householdId}` : ''}
                  {r.needs.length > 0 ? ` · needs: ${r.needs.join(', ')}` : ''}
                  {' · '}{time(r.occurredAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

export function CampsPeopleSection() {
  const { snapshot, supported, isLoading, error } = usePeople();
  if (!supported) {
    return (
      <div data-testid="camps-people-section">
        <Panel title="Camps & People"><EmptyState title="People view not available">This API client does not implement getPeople.</EmptyState></Panel>
      </div>
    );
  }
  if (!snapshot && isLoading) {
    return (
      <div data-testid="camps-people-section">
        <Panel title="Camps & People"><EmptyState title="Loading people data." /></Panel>
      </div>
    );
  }
  if (!snapshot && error) {
    return (
      <div data-testid="camps-people-section">
        <Panel title="Camps & People"><EmptyState title="People data unavailable">The backend could not load shared check-ins. Retry when the Command Centre reconnects.</EmptyState></Panel>
      </div>
    );
  }
  return <CampsPeopleSectionView snapshot={snapshot} />;
}
