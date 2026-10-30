import { MapView } from '../map';
import { FeaturePanel, RoadList, SettlementList, RouteList, ShelterList } from '../panels';
import { IncidentFeed, ChangesList } from '../feed';
import { LayerControls } from '../controls';

export const MapSlot = () => <MapView />;

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
