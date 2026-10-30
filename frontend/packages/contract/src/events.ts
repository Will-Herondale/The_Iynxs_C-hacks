import { z } from 'zod';

export const ClientEventIdSchema = z.string().uuid();
export type ClientEventId = z.infer<typeof ClientEventIdSchema>;

export function newClientEventId(): ClientEventId {
  return globalThis.crypto.randomUUID();
}

export const LocationSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().nonnegative().optional(),
});
export type Location = z.infer<typeof LocationSchema>;

const base = {
  clientEventId: ClientEventIdSchema,
  occurredAt: z.string().datetime({ offset: true }),
  reporterId: z.string().min(1),
  deviceId: z.string().min(1),
  location: LocationSchema,
  note: z.string().max(2000).optional(),
  /** Stub: opaque photo references; upload is an open question for backend. */
  photoRefs: z.array(z.string()).optional(),
};

export const FloodReportSchema = z.object({
  ...base,
  type: z.literal('flood_report'),
  severity: z.number().int().min(1).max(5),
  depthCm: z.number().nonnegative().optional(),
  areaId: z.string().optional(),
});

export const VehicleClassSchema = z.enum(['foot', 'bike', 'car', 'truck']);
export type VehicleClass = z.infer<typeof VehicleClassSchema>;

export const RoadBlockageSchema = z.object({
  ...base,
  type: z.literal('road_blockage'),
  roadId: z.string().optional(),
  blockage: z.enum(['partial', 'full']),
  passableBy: z.array(VehicleClassSchema).optional(),
  /** PROPOSED (frontend, issue #6) */
  cause: z.enum(['submerged', 'debris', 'collapse', 'damage', 'other']).optional(),
});

export const RoadClearedSchema = z.object({
  ...base,
  type: z.literal('road_cleared'),
  roadId: z.string().min(1),
});

export const WaterLevelSchema = z.object({
  ...base,
  type: z.literal('water_level'),
  gaugeId: z.string().optional(),
  levelCm: z.number(),
  trend: z.enum(['rising', 'steady', 'falling']),
});

export const VulnerableFlagsSchema = z.object({
  elderly: z.boolean(),
  children: z.boolean(),
  disabled: z.boolean(),
  medical: z.boolean(),
});
export type VulnerableFlags = z.infer<typeof VulnerableFlagsSchema>;

export const HouseholdRegistrationSchema = z.object({
  ...base,
  type: z.literal('household_registration'),
  householdId: z.string().uuid(),
  headName: z.string().min(1),
  members: z.number().int().min(1),
  vulnerable: VulnerableFlagsSchema,
  settlementId: z.string().optional(),
  /** PROPOSED (frontend, issue #6): camp/shelter where the household was registered. */
  shelterId: z.string().optional(),
  needs: z.array(z.string()),
});

export const FieldEventSchema = z.discriminatedUnion('type', [
  FloodReportSchema,
  RoadBlockageSchema,
  RoadClearedSchema,
  WaterLevelSchema,
  HouseholdRegistrationSchema,
]);

export type FloodReport = z.infer<typeof FloodReportSchema>;
export type RoadBlockage = z.infer<typeof RoadBlockageSchema>;
export type RoadCleared = z.infer<typeof RoadClearedSchema>;
export type WaterLevel = z.infer<typeof WaterLevelSchema>;
export type HouseholdRegistration = z.infer<typeof HouseholdRegistrationSchema>;
export type FieldEvent = z.infer<typeof FieldEventSchema>;
export type FieldEventType = FieldEvent['type'];

export const ServerEventStateSchema = z.enum(['accepted', 'applied', 'conflict', 'rejected']);
export type ServerEventState = z.infer<typeof ServerEventStateSchema>;

/** Incident-feed record: the event plus server-assigned fields. */
export const EventRecordSchema = z.object({
  eventId: z.string(),
  event: FieldEventSchema,
  serverState: ServerEventStateSchema,
  receivedAt: z.string().datetime({ offset: true }),
  /** Projection version at which this event became visible; set once serverState is 'applied'. */
  appliedAtVersion: z.number().int().nonnegative().optional(),
});
export type EventRecord = z.infer<typeof EventRecordSchema>;
