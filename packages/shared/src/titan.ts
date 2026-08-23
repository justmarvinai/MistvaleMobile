import { z } from 'zod';
import type { TitanRules, TitanTier } from './content/entities';

/**
 * The Solo Titan.
 *
 * Every other mode in Mistvale asks *can you beat this*. The Titan asks **how far can you
 * get**, which is a different question and the one the loop was missing: a wall that does
 * not move, a team that does, and a number that says whether the last thing you changed
 * helped. It is the source game's Clan Boss with the clan taken out — the puzzle never
 * needed a guild, only an opponent nobody clears.
 *
 * Three rules make it that rather than a long dungeon floor:
 *
 *  - **A run ends on the turn cap**, not on a victory. The Titan is authored to outlast
 *    anybody, so `turnLimit` is the ordinary ending and a defeat is the early one.
 *  - **It is paid on damage**, at the highest rung the run reached — so a run that ends
 *    badly still pays, and a run that ends slightly better pays slightly better.
 *  - **Keys, not energy.** A few a day, restored by the daily rollover, so the puzzle is
 *    attempts-limited rather than resource-limited: you cannot brute-force it by farming.
 *
 * Everything here is a pure read of published content plus the player's own numbers, so
 * the screen and the server compute the same answers from the same rules.
 */

/** The counter name a Titan's keys are spent against, per keep. */
export function titanCounter(dungeonKey: string): string {
  return `titan:${dungeonKey}`;
}

/**
 * The highest rung a run reached, or null for a run that reached none.
 *
 * Tiers are authored ascending and validated so at publish time; this does not assume it,
 * because a wrong answer here is an unpaid run and reading the whole list is free.
 */
export function tierFor(damage: number, tiers: readonly TitanTier[]): TitanTier | null {
  let best: TitanTier | null = null;
  for (const tier of tiers) {
    if (damage < tier.damage) continue;
    if (!best || tier.damage > best.damage) best = tier;
  }
  return best;
}

/** The next rung up from a given damage figure — the "so close" line. Null at the top. */
export function nextTier(damage: number, tiers: readonly TitanTier[]): TitanTier | null {
  let next: TitanTier | null = null;
  for (const tier of tiers) {
    if (damage >= tier.damage) continue;
    if (!next || tier.damage < next.damage) next = tier;
  }
  return next;
}

/**
 * Whether a Titan's rules are usable, as a list of complaints.
 *
 * Read by publish validation rather than by the schema, because "ascending" and "not
 * empty" are statements about the array as a whole and a Zod refinement that says them
 * reports at the wrong place — an operator wants to be told which rung is out of order.
 */
export function titanRuleProblems(rules: TitanRules): string[] {
  const problems: string[] = [];
  if (rules.tiers.length === 0) {
    problems.push('A Titan needs at least one damage tier, or a run can never pay.');
  }
  const keys = new Set<string>();
  let previous = 0;
  for (const [index, tier] of rules.tiers.entries()) {
    if (keys.has(tier.key)) problems.push(`Tier "${tier.key}" is listed twice.`);
    keys.add(tier.key);
    if (tier.damage <= previous) {
      problems.push(
        `Tier ${index + 1} ("${tier.name}") wants ${tier.damage} damage, which is not above the rung before it.`,
      );
    }
    previous = Math.max(previous, tier.damage);
    if (Object.keys(tier.rewards).length === 0) {
      problems.push(`Tier "${tier.key}" pays nothing.`);
    }
  }
  return problems;
}

// ── What the screen reads ───────────────────────────────────────────────────

export const titanTierStateSchema = z.object({
  key: z.string(),
  name: z.string(),
  damage: z.number().int(),
  rewards: z.record(z.string(), z.number()),
  /** Whether the player's best run has ever reached this rung. */
  reached: z.boolean(),
});
export type TitanTierState = z.infer<typeof titanTierStateSchema>;

export const titanStandingSchema = z.object({
  dungeonKey: z.string(),
  stageKey: z.string(),
  open: z.boolean(),
  /** Why it is shut, phrased for the player. Null when it is open. */
  lockedReason: z.string().nullable(),
  keysLeft: z.number().int(),
  keysPerDay: z.number().int(),
  turnCap: z.number().int(),
  /** The best run this account has ever had here. Zero until the first key is spent. */
  bestDamage: z.number().int(),
  /** The rung that best run reached, or null. */
  bestTierKey: z.string().nullable(),
  /** The most recent run's damage, so "did that change help" is one glance. */
  lastDamage: z.number().int(),
  runs: z.number().int(),
  tiers: z.array(titanTierStateSchema),
});
export type TitanStanding = z.infer<typeof titanStandingSchema>;

export const titanSchema = z.object({
  /** The server's idea of today, so the keys and the rollover cannot disagree. */
  today: z.string(),
  titans: z.array(titanStandingSchema),
});
export type Titan = z.infer<typeof titanSchema>;

/** What a finished run paid, carried back on the battle's reward summary. */
export const titanRunSchema = z.object({
  dungeonKey: z.string(),
  damage: z.number().int(),
  /** The rung it was paid at, or null for a run that reached none. */
  tierKey: z.string().nullable(),
  tierName: z.string().nullable(),
  rewards: z.record(z.string(), z.number()),
  /** True when this run beat the account's own record here. */
  personalBest: z.boolean(),
  previousBest: z.number().int(),
  keysLeft: z.number().int(),
});
export type TitanRun = z.infer<typeof titanRunSchema>;
