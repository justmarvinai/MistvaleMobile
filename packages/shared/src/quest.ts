import { z } from 'zod';
import { goalProgressSchema, QUEST_PERIODS } from './content/index';

/**
 * The checklist, as the Quests screen reads it.
 *
 * One request draws the whole screen — all three period tabs, their chests, and the
 * first-win bonuses that hang off the same daily boundary. Splitting it into a request per
 * tab would mean three answers to "when does today end", and they would eventually differ
 * by a second at exactly the wrong moment.
 *
 * What a quest *is* — its name, its goals, what it pays — comes from the content bundle
 * the client already holds, so this carries progress and nothing else that content
 * already says. The one exception is `rewards`, echoed here because a claim's payout has
 * to be the server's word rather than the client's arithmetic.
 */

export const questStandingSchema = z.object({
  questKey: z.string(),
  /** The period instance this progress belongs to — `YYYY-MM-DD`. */
  periodAnchor: z.string(),
  /** Progress per goal, in the definition's order. */
  goals: z.array(goalProgressSchema),
  /** Every goal met. A complete quest stops advancing but is not yet paid. */
  complete: z.boolean(),
  claimed: z.boolean(),
  /** What claiming pays, as the server will pay it. */
  rewards: z.record(z.string(), z.number()),
});
export type QuestStanding = z.infer<typeof questStandingSchema>;

/**
 * The completion meter for one period, and the chest at the end of it.
 *
 * `required` is how many of that period's chest-counting quests exist right now, so a
 * checklist an operator shortens does not leave a meter nobody can fill.
 */
export const questChestSchema = z.object({
  period: z.enum(QUEST_PERIODS),
  claimedQuests: z.number().int(),
  required: z.number().int(),
  rewards: z.record(z.string(), z.number()),
  /** Every counting quest claimed, and the chest itself not yet taken. */
  claimable: z.boolean(),
  claimed: z.boolean(),
});
export type QuestChest = z.infer<typeof questChestSchema>;

/**
 * A mode's first win of the day, and what finishing it is worth.
 *
 * Modelled as its own list rather than as three more quests because it is not a checklist
 * line: it pays automatically on the win, with no claim, and it is the reason to open the
 * game rather than a reason to stay in it (GAME_DESIGN §15.6).
 */
export const firstWinBonusSchema = z.object({
  mode: z.string(),
  /** Player-facing name of the mode, so the screen needs no lookup table. */
  label: z.string(),
  claimed: z.boolean(),
  rewards: z.record(z.string(), z.number()),
  /** Set when the account has not reached the mode yet. */
  lockedReason: z.string().nullable(),
});
export type FirstWinBonus = z.infer<typeof firstWinBonusSchema>;

export const questsViewSchema = z.object({
  /** The server's game-day, so the screen's countdown and the reset agree. */
  today: z.string(),
  /** When the current game-day ends, ISO — what the "resets in" line counts down to. */
  dailyResetAt: z.string(),
  /** Monday of the current arena/quest week, and the first of the month. */
  weekAnchor: z.string(),
  monthAnchor: z.string(),
  quests: z.array(questStandingSchema),
  chests: z.array(questChestSchema),
  firstWins: z.array(firstWinBonusSchema),
  /** Quests claimable right now, across every period — the dock badge. */
  claimable: z.number().int(),
});
export type QuestsView = z.infer<typeof questsViewSchema>;

export const questClaimRequestSchema = z.object({
  /** Client-generated, so a retried claim pays once. */
  actionId: z.string().min(8).max(64),
});
export type QuestClaimRequest = z.infer<typeof questClaimRequestSchema>;

export const questChestClaimRequestSchema = questClaimRequestSchema.extend({
  period: z.enum(QUEST_PERIODS),
});
export type QuestChestClaimRequest = z.infer<typeof questChestClaimRequestSchema>;

export const questClaimResultSchema = z.object({
  /** Everything the claim paid, currencies and items in one map. */
  paid: z.record(z.string(), z.number()),
  levelsGained: z.number().int(),
  /** The whole screen again, so a claim never needs a follow-up read. */
  quests: questsViewSchema,
});
export type QuestClaimResult = z.infer<typeof questClaimResultSchema>;
