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

// Fields marked PROPOSED (frontend) are optional, backward-compatible additions awaiting
// backend sign-off (GitHub issue #6). The frontend renders them when present and never derives them.
export const FloodConfidenceSchema = z.enum(['observed', 'modelled', 'uncertain']);
export const FloodPropsSchema = z.object({
  areaId: z.string(),
  depthCm: z.number().nonnegative(),
  severity: z.number().int().min(1).max(5),
  /** PROPOSED (frontend) */
  confidence: FloodConfidenceSchema.optional(),
});
export const RoadStatusValueSchema = z.enum(['open', 'partial', 'blocked', 'unknown']);
export const RoadPropsSchema = z.object({
  roadId: z.string(),
  name: z.string(),
  status: RoadStatusValueSchema,
  updatedAt: z.string().datetime({ offset: true }),
  sourceEventIds: z.array(z.string()),
  /** PROPOSED (frontend): bridges are passability features too. Absent means 'road'. */
  kind: z.enum(['road', 'bridge']).optional(),
  /** PROPOSED (frontend) */
  passability: z.enum(['passable', 'limited', 'impassable', 'unknown']).optional(),
  /** PROPOSED (frontend): human-readable explanation of the current status. */
  reason: z.string().optional(),
});
/** PROPOSED (frontend): why a settlement is cut off / a route refused. */
export const ExplanationSchema = z.object({
  summary: z.string(),
  blockingFeatureIds: z.array(z.string()),
  sourceEventIds: z.array(z.string()).optional(),
});
export const AccessibilitySchema = z.enum(['accessible', 'limited', 'cut_off']);
export const SettlementPropsSchema = z.object({
  settlementId: z.string(),
  name: z.string(),
  population: z.number().int().nonnegative(),
  accessibility: AccessibilitySchema,
  households: z.number().int().nonnegative(),
  needs: z.array(z.string()),
  /** PROPOSED (frontend) */
  cutOffReason: ExplanationSchema.optional(),
  /** PROPOSED (frontend): ISO time by which evacuation must be complete. */
  evacuationDeadline: z.string().datetime({ offset: true }).optional(),
  /** PROPOSED (frontend) */
  evacuationPriority: z.enum(['critical', 'high', 'normal']).optional(),
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
  /** PROPOSED (frontend): set when status = unavailable. */
  refusal: ExplanationSchema.optional(),
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

export type FloodConfidence = z.infer<typeof FloodConfidenceSchema>;
export type Explanation = z.infer<typeof ExplanationSchema>;
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
