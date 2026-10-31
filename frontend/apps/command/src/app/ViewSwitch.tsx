import { useView, type ViewName } from './view';

export const SECTIONS: { id: ViewName; label: string; testId: string }[] = [
  { id: 'overview', label: 'Overview', testId: 'nav-overview' },
  { id: 'map', label: 'Live Map', testId: 'nav-map' },
  { id: 'settlements', label: 'Settlements', testId: 'nav-settlements' },
  { id: 'routes', label: 'Routes & Evacuation', testId: 'nav-routes' },
  { id: 'events', label: 'Reports & Events', testId: 'nav-events' },
  { id: 'audit', label: 'Audit', testId: 'nav-audit' },
];

export function ViewSwitch() {
  const { view, setView } = useView();
  return (
    <nav className="cmd-viewswitch" aria-label="Sections">
      {SECTIONS.map((t) => (
        <button
          key={t.id}
          type="button"
          data-testid={t.testId}
          aria-current={view === t.id ? 'page' : undefined}
          className={view === t.id ? 'cmd-viewswitch__btn is-active' : 'cmd-viewswitch__btn'}
          onClick={() => setView(t.id)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
