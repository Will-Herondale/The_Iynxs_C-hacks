/** Typed access to the build-time fixtures in ./fixtures (written by scripts/build-fixtures.mjs). */
import roads from './fixtures/roads.json' with { type: 'json' };
import settlements from './fixtures/settlements.json' with { type: 'json' };
import shelters from './fixtures/shelters.json' with { type: 'json' };
import flood838 from './fixtures/flood-83.8.json' with { type: 'json' };
import flood853 from './fixtures/flood-85.3.json' with { type: 'json' };
import routes from './fixtures/routes.json' with { type: 'json' };
import notes from './fixtures/NOTES.json' with { type: 'json' };

type Geom = { type: string; coordinates: unknown };
interface FC<P> { type: 'FeatureCollection'; features: { type: 'Feature'; geometry: Geom; properties: P }[] }

export interface RoadFixtureProps { roadId: string; name: string; kind: 'road' | 'bridge' }
export interface SettlementFixtureProps { settlementId: string; name: string; population: number | null }
export interface ShelterFixtureProps { shelterId: string; name: string }
export interface FloodFixtureProps { areaId: string; depthCm: number; severity: 1 | 2 | 3 | 4 | 5 }
export interface RouteFixtureProps {
  routeId: string; from: string; to: string; etaMin: number; viaRoadIds: string[];
  role: 'baseline' | 'alternate'; scenario: string; replacesRouteId?: string;
}
export interface FixtureNotes { affectedSettlements: Record<string, string[]> }

export const FIXTURES = {
  roads: roads as unknown as FC<RoadFixtureProps>,
  settlements: settlements as unknown as FC<SettlementFixtureProps>,
  shelters: shelters as unknown as FC<ShelterFixtureProps>,
  flood: { '83.8': flood838 as unknown as FC<FloodFixtureProps>, '85.3': flood853 as unknown as FC<FloodFixtureProps> },
  routes: routes as unknown as FC<RouteFixtureProps>,
  notes: notes as unknown as FixtureNotes,
};
