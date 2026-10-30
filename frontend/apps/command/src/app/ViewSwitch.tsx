import { useView, type ViewName } from './view';

const TABS: { id: ViewName; label: string; testId: string }[] = [
  { id: 'map', label: 'Map', testId: 'nav-map' },
  { id: 'audit', label: 'Audit', testId: 'nav-audit' },
];

export function ViewSwitch() {
  const { view, setView } = useView();
  return (
    <nav className="cmd-viewswitch" aria-label="View">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          data-testid={t.testId}
          aria-pressed={view === t.id}
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
