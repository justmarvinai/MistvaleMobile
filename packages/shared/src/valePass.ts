import { z } from 'zod';

/**
 * The Vale Pass, as its screen reads it.
 *
 * A season is one long ladder with **two columns**: the free track everybody climbs by
 * playing, and the season's own track, taken up for crystals. Everything a player asks is
 * on one read — where I am, what is left today, what each tier pays on both columns, what
 * I have collected, and whether the track is mine — because a tier that looked claimable
 * in one request and was refused in the next would be the screen's own fault.
 *
 * Why a pass at all, on a game with no payments: the season is the one system in Mistvale
 * that rewards *coming back regularly* rather than playing well or playing a lot. The
 * campaign rewards clearing, the Arena rewards a good team, the Titan rewards one good
 * hour — a pass, capped per day, rewards thirty ordinary evenings, which is the shape
 * nothing else here has.
 */

/** One rung, and what it pays on each column. */
export const valePassTierStandingSchema = z.object({
  /** Position in the ladder, which is also what a claim names. */
  index: z.number().int(),
  points: z.number().int(),
  free: z.record(z.string(), z.number()),
  premium: z.record(z.string(), z.number()),
  reached: z.boolean(),
  freeClaimed: z.boolean(),
  premiumClaimed: z.boolean(),
  /**
   * Whether the premium half is drawn as locked rather than as claimable.
   *
   * Sent rather than derived from `unlocked && reached && !claimed`, because a tier with
   * nothing in its premium column must not read as locked treasure — an empty column is
   * simply empty, and a track that looks like it is hiding something on every tier is one
   * nobody trusts.
   */
  premiumLocked: z.boolean(),
});
export type ValePassTierStanding = z.infer<typeof valePassTierStandingSchema>;

export const valePassStandingSchema = z.object({
  passKey: z.string(),
  name: z.string(),
  description: z.string(),
  bannerAsset: z.string(),
  /** The season being climbed — `YYYY-MM-DD` of the day it opened. */
  season: z.string(),
  points: z.number().int(),
  /** Points earned today, and the ceiling on them. `dailyCap: 0` means no ceiling. */
  pointsToday: z.number().int(),
  dailyCap: z.number().int(),
  /** Scoring right now. False while only the collection grace period is left. */
  live: z.boolean(),
  /** Last game-day the season scores on. */
  endsOn: z.string(),
  /** Last game-day its tiers can still be collected. */
  claimsCloseOn: z.string(),
  /** Whether this account holds the season's own track. */
  unlocked: z.boolean(),
  /** Crystals to take it up. Zero means the track is open to everybody. */
  unlockCost: z.number().int(),
  /** What earns points, phrased for a player. */
  rules: z.array(z.object({ label: z.string(), points: z.number().int() })),
  tiers: z.array(valePassTierStandingSchema),
  /** Tiers reached with something still to collect, on either column. */
  claimable: z.number().int(),
});
export type ValePassStanding = z.infer<typeof valePassStandingSchema>;

export const valePassViewSchema = z.object({
  /** The server's game-day, so the screen's countdown matches the season. */
  today: z.string(),
  /** Usually one. A list because nothing stops an operator running two at once. */
  passes: z.array(valePassStandingSchema),
  /** Across every season — the dock pip. */
  claimable: z.number().int(),
});
export type ValePassView = z.infer<typeof valePassViewSchema>;

/** Which column a claim is for. Both are named, because they are collected separately. */
export const VALE_PASS_TRACKS = ['free', 'premium'] as const;
export type ValePassTrack = (typeof VALE_PASS_TRACKS)[number];

export const valePassClaimRequestSchema = z.object({
  tier: z.number().int().min(0).max(59),
  track: z.enum(VALE_PASS_TRACKS),
  actionId: z.string().min(8).max(64),
});
export type ValePassClaimRequest = z.infer<typeof valePassClaimRequestSchema>;

export const valePassUnlockRequestSchema = z.object({
  actionId: z.string().min(8).max(64),
});
export type ValePassUnlockRequest = z.infer<typeof valePassUnlockRequestSchema>;

export const valePassClaimResultSchema = z.object({
  paid: z.record(z.string(), z.number()),
  levelsGained: z.number().int(),
  pass: valePassViewSchema,
});
export type ValePassClaimResult = z.infer<typeof valePassClaimResultSchema>;

/**
 * How many points one report is worth once the day's ceiling is applied.
 *
 * Pure, and shared, because two things read it and they must not disagree: the fan-out
 * that awards the points, and the test that proves a season cannot be finished in a
 * weekend. A ceiling of zero is no ceiling — an operator who wants a season nobody can
 * rush leaves it set, and one who wants a sprint sets it to nothing.
 */
export function pointsAllowedToday(earned: number, alreadyToday: number, dailyCap: number): number {
  if (earned <= 0) return 0;
  if (dailyCap <= 0) return earned;
  return Math.max(0, Math.min(earned, dailyCap - alreadyToday));
}
