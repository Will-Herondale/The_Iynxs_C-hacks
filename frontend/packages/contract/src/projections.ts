import { z } from 'zod';

const pos = z.tuple([z.number(), z.number()]).rest(z.number());
const PointGeom = z.object({ type: z.literal('Point'), coordinates: pos });
const LineGeom = z.object({ type: z.literal('LineString'), coordinates: z.array(pos) });
const PolygonGeom = z.object({ type: z.literal('Polygon'), coordinates: z.array(z.array(pos)) });

function collection<G extends z.ZodTypeAny, P extends z.ZodTypeAny>(geometry: G, properties: P) {
  return z.object({
    type: z.literal('FeatureCollection'),
    version: z.number().int().nonnegative(),
    generatedAt: z.string().datetime({ offset: true }),
    features: z.array(z.object({ type: z.literal('Feature'), id: z.string().optional(), geometry, properties })),
  });
}

export const FloodPropsSchema = z.object({
  areaId: z.string(),
  depthCm: z.number().nonnegative(),
  severity: z.number().int().min(1).max(5),
});
export const RoadStatusValueSchema = z.enum(['open', 'partial', 'blocked', 'unknown']);
export const RoadPropsSchema = z.object({
  roadId: z.string(),
  name: z.string(),
  status: RoadStatusValueSchema,
  updatedAt: z.string().datetime({ offset: true }),
  sourceEventIds: z.array(z.string()),
});
export const AccessibilitySchema = z.enum(['accessible', 'limited', 'cut_off']);
export const SettlementPropsSchema = z.object({
  settlementId: z.string(),
  name: z.string(),
  population: z.number().int().nonnegative(),
  accessibility: AccessibilitySchema,
  households: z.number().int().nonnegative(),
  needs: z.array(z.string()),
});
export const RouteKindSchema = z.enum(['evacuation', 'supply']);
export const RouteStatusSchema = z.enum(['active', 'recalculated', 'unavailable']);
export const RoutePropsSchema = z.object({
  routeId: z.string(),
  from: z.string(),
  to: z.string(),
  kind: RouteKindSchema,
  status: RouteStatusSchema,
  etaMin: z.number().nonnegative(),
  replacesRouteId: z.string().optional(),
});
export const ShelterPropsSchema = z.object({
  shelterId: z.string(),
  name: z.string(),
  capacity: z.number().int().nonnegative(),
  occupancy: z.number().int().nonnegative(),
  open: z.boolean(),
});

export const FloodExtentSchema = collection(PolygonGeom, FloodPropsSchema);
export const RoadStatusSchema = collection(LineGeom, RoadPropsSchema);
export const SettlementSchema = collection(PointGeom, SettlementPropsSchema);
export const RouteSchema = collection(LineGeom, RoutePropsSchema);
export const ShelterSchema = collection(PointGeom, ShelterPropsSchema);

export const ProjectionSnapshotSchema = z.object({
  version: z.number().int().nonnegative(),
  generatedAt: z.string().datetime({ offset: true }),
  flood: FloodExtentSchema,
  roads: RoadStatusSchema,
  settlements: SettlementSchema,
  routes: RouteSchema,
  shelters: ShelterSchema,
});

export type FloodProps = z.infer<typeof FloodPropsSchema>;
export type RoadProps = z.infer<typeof RoadPropsSchema>;
export type RoadStatusValue = z.infer<typeof RoadStatusValueSchema>;
export type Accessibility = z.infer<typeof AccessibilitySchema>;
export type SettlementProps = z.infer<typeof SettlementPropsSchema>;
export type RouteKind = z.infer<typeof RouteKindSchema>;
export type RouteStatus = z.infer<typeof RouteStatusSchema>;
export type RouteProps = z.infer<typeof RoutePropsSchema>;
export type ShelterProps = z.infer<typeof ShelterPropsSchema>;
export type FloodExtent = z.infer<typeof FloodExtentSchema>;
export type RoadStatus = z.infer<typeof RoadStatusSchema>;
export type Settlement = z.infer<typeof SettlementSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type Shelter = z.infer<typeof ShelterSchema>;
export type ProjectionSnapshot = z.infer<typeof ProjectionSnapshotSchema>;
