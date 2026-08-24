import { z } from 'zod';

/**
 * Trials — a fixed enemy, a loaned team, and a turn count to beat.
 *
 * The one mode in Mistvale where **the account does not matter**. Everybody is handed the
 * same four champions with the same relics against the same enemy, so what separates a good
 * run from a bad one is the play: which skill on which turn, and who is targeted. It is the
 * answer to a collection game's oldest problem — that a player who out-farmed the content
 * cannot be given anything interesting to do with it.
 *
 * That also makes it the fairest thing in the game to compare, which is why the number kept
 * is **turns** rather than a clear: clearing is the easy half.
 */

export const trialStateSchema = z.object({
  key: z.string(),
  name: z.string(),
  /** The trick, in a sentence. Never the solution. */
  hint: z.string(),
  /** The turn count to beat. */
  parTurns: z.number().int(),
  /** Fewest turns this account has ever managed, or null if it has never been cleared. */
  bestTurns: z.number().int().nullable(),
  cleared: z.boolean(),
  /** True once a clear has come in at or under par — the thing the mode is for. */
  beaten: z.boolean(),
  /** What solving it inside par pays, once. */
  parRewards: z.record(z.string(), z.number()),
  /** The team it is fought with, by champion key — the same four for everybody. */
  team: z.array(z.string()),
  /** Why it cannot be fought yet, in the sentence the button shows. Null when it can. */
  blockedReason: z.string().nullable(),
});
export type TrialState = z.infer<typeof trialStateSchema>;

export const trialsOverviewSchema = z.object({
  trials: z.array(trialStateSchema),
  /** How many have been solved inside par, and how many there are. */
  beaten: z.number().int(),
  total: z.number().int(),
});
export type TrialsOverview = z.infer<typeof trialsOverviewSchema>;

export const NO_TRIALS: TrialsOverview = Object.freeze({ trials: [], beaten: 0, total: 0 });
