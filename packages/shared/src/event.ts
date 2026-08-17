import { z } from 'zod';

/**
 * Timed events, as the Events screen reads them.
 *
 * An event page is three things: what is worth doing, how much you have scored, and what
 * the ladder pays. All three come from one read, because a milestone that appeared to be
 * claimable in one request and refused in the next would be the screen's own fault.
 */

export const eventMilestoneStandingSchema = z.object({
  /** Position in the ladder, which is also what a claim names. */
  index: z.number().int(),
  points: z.number().int(),
  rewards: z.record(z.string(), z.number()),
  reached: z.boolean(),
  claimed: z.boolean(),
});
export type EventMilestoneStanding = z.infer<typeof eventMilestoneStandingSchema>;

export const eventStandingSchema = z.object({
  eventKey: z.string(),
  name: z.string(),
  description: z.string(),
  bannerAsset: z.string(),
  /** The occurrence being scored — `YYYY-MM-DD` of the day the window opened. */
  occurrence: z.string(),
  points: z.number().int(),
  /** Running right now. False while only the claim grace period is left. */
  live: z.boolean(),
  /** Last game-day the event scores on. */
  endsOn: z.string(),
  /** Last game-day its milestones can still be collected. */
  claimsCloseOn: z.string(),
  /** What earns points, phrased for a player. */
  rules: z.array(z.object({ label: z.string(), points: z.number().int() })),
  milestones: z.array(eventMilestoneStandingSchema),
  /** Milestones reached and not yet taken. */
  claimable: z.number().int(),
});
export type EventStanding = z.infer<typeof eventStandingSchema>;

export const eventsViewSchema = z.object({
  /** The server's game-day, so the screen's countdown matches the window. */
  today: z.string(),
  events: z.array(eventStandingSchema),
  /** Across every event — the dock pip. */
  claimable: z.number().int(),
});
export type EventsView = z.infer<typeof eventsViewSchema>;

export const eventClaimRequestSchema = z.object({
  /** Which rung of the ladder. */
  milestone: z.number().int().min(0).max(19),
  actionId: z.string().min(8).max(64),
});
export type EventClaimRequest = z.infer<typeof eventClaimRequestSchema>;

export const eventClaimResultSchema = z.object({
  paid: z.record(z.string(), z.number()),
  levelsGained: z.number().int(),
  events: eventsViewSchema,
});
export type EventClaimResult = z.infer<typeof eventClaimResultSchema>;
