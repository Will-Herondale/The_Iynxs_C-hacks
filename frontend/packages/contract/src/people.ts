import { z } from 'zod';

/**
 * People snapshot served at GET /api/v1/people.
 *
 * Deliberately separate from ProjectionSnapshot: the map layers keep their
 * frozen shape, while the Command app gets per-camp counts and duplicate
 * suggestions from the same event history.
 */
export const PeopleKindSchema = z.enum(['person', 'household']);
export type PeopleKind = z.infer<typeof PeopleKindSchema>;

export const CampPeopleSummarySchema = z.object({
  campId: z.string(),
  name: z.string(),
  open: z.boolean(),
  capacity: z.number().int().nonnegative(),
  occupancy: z.number().int().nonnegative(),
  synthetic: z.boolean().optional(),
  checkins: z.number().int().nonnegative(),
  households: z.number().int().nonnegative(),
  people: z.number().int().nonnegative(),
  needs: z.record(z.number()),
  lastCheckinAt: z.string().datetime({ offset: true }).nullable(),
});
export type CampPeopleSummary = z.infer<typeof CampPeopleSummarySchema>;

export const PeopleCheckinRecordSchema = z.object({
  eventId: z.string(),
  clientEventId: z.string().nullable(),
  kind: PeopleKindSchema,
  personId: z.string(),
  /** Canonical personId this record was merged into (set when auto-merged). */
  mergedInto: z.string().nullable(),
  displayName: z.string(),
  campId: z.string().nullable(),
  campName: z.string().nullable(),
  settlementId: z.string().nullable(),
  householdId: z.string().nullable(),
  members: z.number().int().positive(),
  ageBand: z.string().nullable(),
  sex: z.string().nullable(),
  needs: z.array(z.string()),
  vulnerable: z.record(z.boolean()).nullable(),
  occurredAt: z.string().datetime({ offset: true }),
  reporterId: z.string(),
});
export type PeopleCheckinRecord = z.infer<typeof PeopleCheckinRecordSchema>;

export const DuplicateSuggestionPartySchema = z.object({
  personId: z.string(),
  name: z.string(),
  campId: z.string().nullable(),
  campName: z.string().nullable(),
  kind: PeopleKindSchema,
});
export type DuplicateSuggestionParty = z.infer<typeof DuplicateSuggestionPartySchema>;

export const DuplicateSuggestionSchema = z.object({
  proposalId: z.string(),
  scoreBp: z.number().int().min(0).max(10_000),
  a: DuplicateSuggestionPartySchema,
  b: DuplicateSuggestionPartySchema,
});
export type DuplicateSuggestion = z.infer<typeof DuplicateSuggestionSchema>;

export const PeopleSnapshotSchema = z.object({
  version: z.number().int().nonnegative(),
  generatedAt: z.string().datetime({ offset: true }),
  totals: z.object({
    checkins: z.number().int().nonnegative(),
    individuals: z.number().int().nonnegative(),
    households: z.number().int().nonnegative(),
    campsWithCheckins: z.number().int().nonnegative(),
  }),
  camps: z.array(CampPeopleSummarySchema),
  checkins: z.array(PeopleCheckinRecordSchema),
  duplicateSuggestions: z.array(DuplicateSuggestionSchema),
  /** Number of records auto-merged into a canonical record (high-confidence matches). */
  autoMergedCount: z.number().int().nonnegative(),
});
export type PeopleSnapshot = z.infer<typeof PeopleSnapshotSchema>;
