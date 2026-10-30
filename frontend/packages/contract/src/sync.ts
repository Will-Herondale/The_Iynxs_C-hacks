import { z } from 'zod';

export const ValidationIssueSchema = z.object({ path: z.string(), message: z.string() });
export type ValidationIssue = z.infer<typeof ValidationIssueSchema>;

export const SubmitAckSchema = z.discriminatedUnion('result', [
  z.object({
    clientEventId: z.string(),
    result: z.literal('accepted'),
    eventId: z.string(),
    acceptedAtVersion: z.number().int().nonnegative(),
  }),
  z.object({ clientEventId: z.string(), result: z.literal('duplicate'), eventId: z.string() }),
  z.object({
    clientEventId: z.string(),
    result: z.literal('conflict'),
    eventId: z.string().optional(),
    reason: z.string(),
    serverState: z.unknown().optional(),
  }),
  z.object({ clientEventId: z.string(), result: z.literal('rejected'), errors: z.array(ValidationIssueSchema) }),
]);
export type SubmitAck = z.infer<typeof SubmitAckSchema>;

export const EventStatusStateSchema = z.enum(['unknown', 'accepted', 'applied', 'conflict', 'rejected']);
export type EventStatusState = z.infer<typeof EventStatusStateSchema>;

export const EventStatusSchema = z.object({
  clientEventId: z.string(),
  eventId: z.string().optional(),
  state: EventStatusStateSchema,
  projectionVersion: z.number().int().nonnegative().optional(),
});
export type EventStatus = z.infer<typeof EventStatusSchema>;

/** Frontend-only queue state. 'synced' means confirmed applied in the feed, NOT merely HTTP 2xx. */
export const ClientSyncStatusSchema = z.enum([
  'queued',
  'sending',
  'accepted',
  'synced',
  'conflict',
  'rejected',
  'failed',
]);
export type ClientSyncStatus = z.infer<typeof ClientSyncStatusSchema>;
