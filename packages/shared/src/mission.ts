import { z } from 'zod';
import { goalProgressSchema } from './content/index';

/**
 * The Valewarden's Path, as the Missions screen reads it.
 *
 * The chain is grouped into arcs, and the arc is the unit the screen shows: the eight
 * steps of the arc you are on, in order, with the arcs behind you collapsed and the ones
 * ahead named but shut. A flat list of eighty would bury the two you could finish tonight.
 */

export const missionStandingSchema = z.object({
  missionKey: z.string(),
  goals: z.array(goalProgressSchema),
  complete: z.boolean(),
  claimed: z.boolean(),
  /** What claiming pays, as the server will pay it. */
  rewards: z.record(z.string(), z.number()),
  /** Champions handed over, and a title, if this step grants any. */
  grantsChampions: z.array(z.string()),
  grantsTitle: z.string(),
  /**
   * Whether this step can be claimed right now. False while its arc is still shut —
   * progress accrues regardless, so a finished-but-locked mission is a real state.
   */
  claimable: z.boolean(),
});
export type MissionStanding = z.infer<typeof missionStandingSchema>;

export const missionArcSchema = z.object({
  arc: z.number().int(),
  name: z.string(),
  /** Open arcs are claimable; shut ones are named so the road ahead is visible. */
  open: z.boolean(),
  /** Every step claimed — the arc is behind the player. */
  finished: z.boolean(),
  claimedSteps: z.number().int(),
  totalSteps: z.number().int(),
  missions: z.array(missionStandingSchema),
});
export type MissionArc = z.infer<typeof missionArcSchema>;

export const missionsViewSchema = z.object({
  arcs: z.array(missionArcSchema),
  /** The arc a player should be looking at — the first unfinished one. */
  currentArc: z.number().int(),
  /** Steps claimed across the whole Path, and how many there are. */
  claimedTotal: z.number().int(),
  total: z.number().int(),
  /** Ready to claim right now — the dock pip. */
  claimable: z.number().int(),
  /** The honorific the account has earned, if any. */
  title: z.string().nullable(),
});
export type MissionsView = z.infer<typeof missionsViewSchema>;

export const missionClaimRequestSchema = z.object({
  actionId: z.string().min(8).max(64),
});
export type MissionClaimRequest = z.infer<typeof missionClaimRequestSchema>;

export const missionClaimResultSchema = z.object({
  paid: z.record(z.string(), z.number()),
  /** Champion keys handed over, so the client can celebrate rather than just refresh. */
  champions: z.array(z.string()),
  /** The title earned by this step, if it granted one. */
  title: z.string().nullable(),
  levelsGained: z.number().int(),
  /** True when claiming this step opened the next arc. */
  arcCompleted: z.boolean(),
  missions: missionsViewSchema,
});
export type MissionClaimResult = z.infer<typeof missionClaimResultSchema>;
