import { z } from 'zod';
import { DUNGEON_KINDS } from './content/entities';

/**
 * The Depths, as the hub screen reads it.
 *
 * Two things here cannot be worked out client-side and so are answered by the server:
 * which springs are open *today*, and how deep the player has been. Everything else — the
 * names, the floors, what a dungeon drops — comes from the content bundle, so adding a
 * fifth dungeon in Admin puts it on the hub with no client change.
 */

export const dungeonStandingSchema = z.object({
  dungeonKey: z.string(),
  /** Open right now: level reached, and the rotation day allows it. */
  open: z.boolean(),
  /** Why it is shut, phrased for the player. Null when it is open. */
  lockedReason: z.string().nullable(),
  /** Highest floor number ever cleared; 0 means untouched. */
  highestFloor: z.number().int(),
  /** Total clears across every floor — the "how hard is this farmed" line. */
  clears: z.number().int(),
  /**
   * When this dungeon next opens, as a weekday name, for a spring that is shut today.
   * Null when it is open now or opens every day.
   */
  nextOpenDay: z.string().nullable(),
});
export type DungeonStanding = z.infer<typeof dungeonStandingSchema>;

export const depthsSchema = z.object({
  /** The server's idea of today, so the hub and the rotation cannot disagree. */
  today: z.string(),
  /** Weekday index the rotation is being read against, `0` = Sunday. */
  weekday: z.number().int().min(0).max(6),
  /**
   * Set while a new account's grace period is running, when every spring is open
   * regardless of the rotation. Carries the day it ends so the hub can say so.
   */
  graceUntil: z.string().nullable(),
  dungeons: z.array(dungeonStandingSchema),
});
export type Depths = z.infer<typeof depthsSchema>;

export const DUNGEON_KIND_VALUES = DUNGEON_KINDS;

/** Weekday names, indexed the way `openDays` is. Used by both the server and the hub. */
export const WEEKDAY_NAMES: readonly string[] = Object.freeze([
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
]);
