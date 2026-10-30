import { MapView } from '../map';
import { FeaturePanel } from '../panels';
import { AuditView } from '../audit';
import { SettlementsSection } from '../sections/settlements';
import { RoutesSection } from '../sections/routes';
import { EventsSection } from '../sections/events';
import { OverviewSection } from '../sections/overview';
import { useGoTo, useView, type ViewName } from './view';
import { useSelection } from './selection';

/** Sections that render beside the map (split layout): the table drives map highlighting. */
const SPLIT: ViewName[] = ['settlements', 'routes'];

/**
 * The map stays mounted for the whole session (WebGL is not recreated). It is full-width on
 * 'map', the right-hand half on split sections, and hidden elsewhere.
 */
export function Workspace() {
  const { view } = useView();
  const goTo = useGoTo();
  const { selected, select } = useSelection();
  const split = SPLIT.includes(view);
  const showMap = view === 'map' || split;
  const showAside = !!selected && view !== 'overview' && view !== 'audit';
  return (
    <div className="cmd-workspace" data-view={view}>
      {split && (
        <section className="cmd-section cmd-section--split" aria-label={view} data-testid={`section-${view}`}>
          {view === 'settlements' ? <SettlementsSection /> : <RoutesSection />}
        </section>
      )}
      <div className="cmd-map-wrap" hidden={!showMap}>
        <MapView />
      </div>
      {view === 'overview' && (
        <section className="cmd-section" aria-label="Overview" data-testid="section-overview">
          <OverviewSection />
        </section>
      )}
      {view === 'events' && (
        <section className="cmd-section" aria-label="Reports and events" data-testid="section-events">
          <EventsSection />
        </section>
      )}
      {view === 'audit' && (
        <section className="cmd-section" aria-label="Audit" data-testid="section-audit">
          <AuditView onShowFeature={() => goTo('map')} />
        </section>
      )}
      {showAside && (
        <aside className="cmd-aside" aria-label="Selection details">
          <button type="button" className="cmd-aside__close" data-testid="context-close" onClick={() => select(undefined)}>
            Close ✕
          </button>
          <FeaturePanel />
        </aside>
      )}
    </div>
  );
}
