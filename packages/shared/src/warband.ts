import { z } from 'zod';

/**
 * Wardens — the friends slice of Warbands (C37).
 *
 * The roadmap's own note is the design: "a friends list and one borrowed champion per day
 * is a fraction of the cost and most of the felt benefit". What is deliberately *not* here
 * is a guild — no chat, no roster of officers, no shared bank, nothing to schedule with
 * anybody. Mistvale's social layer has been the same shape since the Wurm Wakes: the only
 * social act is turning up, and the evidence anybody else exists is that something moved
 * while you were away.
 *
 * Three decisions make this small enough to be worth having.
 *
 * **The list is one-way.** You keep wardens; they are not asked and never told. A mutual
 * friendship needs requests, an accept, a pending state and a channel to notify through,
 * and every one of those is machinery around a list. What makes borrowing safe without
 * permission is the second decision.
 *
 * **What may be borrowed is what its owner offered.** Every account nominates one
 * **standard-bearer** — a particular copy, with its relics and masteries, exactly as an
 * arena defence is a particular team — and that nomination *is* the consent. Nobody can
 * take a champion that was not put forward, so nobody needs to be asked.
 *
 * **Lending pays nothing.** A reward for being borrowed is a farm: thirty alts, thirty
 * borrows, thirty payouts. What the lender gets is a number on their profile that only
 * goes up, which costs nothing to grant and is the only thing in the game that says
 * somebody else fought beside you.
 */

/** A warden as they appear on somebody's list. */
export const wardenSummarySchema = z.object({
  playerId: z.string(),
  profileName: z.string(),
  level: z.number().int(),
  title: z.string(),
  avatarChampionKey: z.string().nullable(),
  /** How many times this warden's standard-bearer has been fielded by somebody else. */
  lends: z.number().int(),
  /** Null where they have nominated nobody — the list still shows them. */
  standardBearer: z
    .object({
      championKey: z.string(),
      level: z.number().int(),
      rank: z.number().int(),
      ascension: z.number().int(),
      awakening: z.number().int(),
      power: z.number().int(),
      /** Relics worn, out of nine — the one figure that says whether it is worth borrowing. */
      relics: z.number().int(),
    })
    .nullable(),
});
export type WardenSummary = z.infer<typeof wardenSummarySchema>;

export const warbandSchema = z.object({
  wardens: z.array(wardenSummarySchema),
  /** The cap, so the screen can say "12 of 30" rather than only refusing at the ceiling. */
  capacity: z.number().int(),
  /** Borrows left today, and the allowance they came from. */
  borrowsLeft: z.number().int(),
  borrowsPerDay: z.number().int(),
  /** This account's own nomination, so one screen answers both halves. */
  standardBearerId: z.string().nullable(),
  /** How many times it has been taken into a fight. */
  lends: z.number().int(),
});
export type Warband = z.infer<typeof warbandSchema>;

export const followRequestSchema = z.object({
  /** By profile name, because that is the only handle a player has for another. */
  profileName: z.string().trim().min(1).max(16),
});
export type FollowRequest = z.infer<typeof followRequestSchema>;

export const standardBearerRequestSchema = z.object({
  /** A roster id — a *copy*, with its relics and masteries. `null` withdraws the offer. */
  championId: z.string().uuid().nullable(),
});
export type StandardBearerRequest = z.infer<typeof standardBearerRequestSchema>;

/** How many wardens a list may hold, and how many borrows a day, before `game_config`. */
export const WARDEN_CAP_DEFAULT = 30;
export const BORROWS_PER_DAY_DEFAULT = 1;

/** The daily counter key a borrow is spent against. */
export const BORROW_COUNTER = 'allyBorrows';

export interface WarbandConfig {
  wardenCap: number;
  borrowsPerDay: number;
}

/**
 * The two tunables, read from `game_config` with the documented defaults behind them.
 *
 * Balance numbers are never hardcoded (CLAUDE.md), and these two are exactly the ones an
 * operator will want to move once there is a population to move them for.
 */
export function warbandConfigFrom(config: Record<string, unknown>): WarbandConfig {
  const read = (key: string, fallback: number): number => {
    const value = config[key];
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : fallback;
  };
  return {
    wardenCap: read('social.wardenCap', WARDEN_CAP_DEFAULT),
    borrowsPerDay: read('social.borrowsPerDay', BORROWS_PER_DAY_DEFAULT),
  };
}
