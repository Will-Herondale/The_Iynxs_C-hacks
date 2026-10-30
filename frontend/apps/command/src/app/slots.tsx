import { MapView } from '../map';
import { FeaturePanel, RoadList, SettlementList, RouteList, ShelterList } from '../panels';
import { IncidentFeed, ChangesList } from '../feed';
import { AuditView } from '../audit';
import { useView } from './view';
import { LayerControls } from '../controls';

export function MapSlot() {
  const { view, setView } = useView();
  // The map stays mounted (hidden) so switching back is instant and WebGL is not recreated.
  return (
    <>
      <div className="cmd-map-wrap" hidden={view !== 'map'}><MapView /></div>
      {view === 'audit' && <AuditView onShowFeature={() => setView('map')} />}
    </>
  );
}

export const LeftSlot = () => (
  <>
    <LayerControls />
    <SettlementList />
    <RoadList />
    <RouteList />
    <ShelterList />
  </>
);

export const FeaturePanelSlot = () => <FeaturePanel />;

export const FeedSlot = () => (
  <>
    <ChangesList />
    <IncidentFeed />
  </>
);
