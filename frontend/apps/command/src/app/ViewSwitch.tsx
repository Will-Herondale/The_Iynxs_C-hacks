import { useView, type ViewName } from './view';

export const SECTIONS: { id: ViewName; label: string; testId: string; icon: string; hint: string }[] = [
  { id: 'overview', label: 'Overview', testId: 'nav-overview', icon: '◧', hint: 'What is happening right now, in plain numbers' },
  { id: 'map', label: 'Live Map', testId: 'nav-map', icon: '◎', hint: 'The island map: blocked roads, villages, shelters, routes' },
  { id: 'settlements', label: 'Settlements', testId: 'nav-settlements', icon: '⌂', hint: 'Villages and whether they can be reached' },
  { id: 'people', label: 'Camps & People', testId: 'nav-people', icon: '☺', hint: 'People checked in at camps' },
  { id: 'routes', label: 'Routes & Evacuation', testId: 'nav-routes', icon: '➜', hint: 'Evacuation routes and why some are refused' },
  { id: 'events', label: 'Reports & Events', testId: 'nav-events', icon: '✎', hint: 'Everything volunteers have sent in' },
  { id: 'audit', label: 'Audit', testId: 'nav-audit', icon: '☰', hint: 'The full log of events, for checking' },
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
          title={t.hint}
          onClick={() => setView(t.id)}
        >
          <span aria-hidden="true" className="cmd-viewswitch__icon">{t.icon}</span> {t.label}
        </button>
      ))}
    </nav>
  );
}
