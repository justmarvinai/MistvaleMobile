import { z } from 'zod';
import { LOGIN_TRACKS } from './content/entities';
import { gearInstanceSchema } from './gear';

/**
 * The login calendar, as its screen reads it.
 *
 * Two tracks side by side: the thirty-day cycle everyone walks forever, and the seven-day
 * welcome strip a newcomer walks once. Both are answered in a single read, because a
 * screen that asked twice could draw one track's "today" against the other's.
 */

export const loginDayStandingSchema = z.object({
  day: z.number().int(),
  rewards: z.record(z.string(), z.number()),
  /** Champions this day hands over outright. */
  champions: z.array(z.string()),
  /** Champions the player must pick one of — the day-30 selector. */
  choices: z.array(z.string()),
  /** How many relics it hands over, for the tile's "×6 relics" line. */
  relicCount: z.number().int(),
  /** Already collected in the cycle being shown. */
  claimed: z.boolean(),
  /** The day the next claim will pay. Exactly one day per open track is `next`. */
  next: z.boolean(),
});
export type LoginDayStanding = z.infer<typeof loginDayStandingSchema>;

export const loginTrackStandingSchema = z.object({
  trackKey: z.string(),
  track: z.enum(LOGIN_TRACKS),
  name: z.string(),
  description: z.string(),
  days: z.array(loginDayStandingSchema),
  /**
   * Which time round the calendar this is, 1-based. A welcome track is always on its
   * first, since it never restarts.
   */
  cycle: z.number().int(),
  /** Claims made on this track, ever. */
  claimsMade: z.number().int(),
  /** Collected today already — the reason the claim button is spent rather than missing. */
  claimedToday: z.boolean(),
  /** Walked to the end and finished for good. Only ever true of the welcome track. */
  finished: z.boolean(),
  /** There is a day waiting to be taken right now. */
  claimable: z.boolean(),
});
export type LoginTrackStanding = z.infer<typeof loginTrackStandingSchema>;

export const loginViewSchema = z.object({
  /** The server's game-day, so "today" is the server's opinion and not the browser's. */
  today: z.string(),
  /**
   * Past the account level the calendar opens at. Below it the tracks are still returned —
   * the screen shows what is coming rather than an empty room — but nothing can be taken.
   */
  unlocked: z.boolean(),
  /** The level it opens at, so the locked state can say so rather than just refusing. */
  unlockLevel: z.number().int(),
  /** Absent only if an operator has deactivated every calendar track. */
  calendar: loginTrackStandingSchema.nullable(),
  /** Absent once the newcomer has walked it, which is the point of it. */
  welcome: loginTrackStandingSchema.nullable(),
  /** Tracks with something waiting — the dock pip. */
  claimable: z.number().int(),
});
export type LoginView = z.infer<typeof loginViewSchema>;

export const loginClaimRequestSchema = z.object({
  track: z.enum(LOGIN_TRACKS),
  /** Required when the day offers a choice of champions, refused when it does not. */
  choice: z.string().max(64).optional(),
  actionId: z.string().min(8).max(64),
});
export type LoginClaimRequest = z.infer<typeof loginClaimRequestSchema>;

export const loginClaimResultSchema = z.object({
  /** Which day of the track was just paid. */
  day: z.number().int(),
  paid: z.record(z.string(), z.number()),
  /** Champions handed over, including the one picked from a selector. */
  champions: z.array(z.string()),
  /** Relics rolled and handed over, so the screen can show what arrived. */
  relics: z.array(gearInstanceSchema),
  levelsGained: z.number().int(),
  login: loginViewSchema,
});
export type LoginClaimResult = z.infer<typeof loginClaimResultSchema>;
