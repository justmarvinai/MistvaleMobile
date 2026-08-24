import { z } from 'zod';
import type { WorldBossRules, WorldBossTier } from './content/entities';

/**
 * The Wurm Wakes — one health pool, shared by everybody on the server.
 *
 * Every other number in Mistvale belongs to one account. This one belongs to the vale: the
 * damage a warden does on Tuesday is still gone when somebody else opens the game on
 * Friday, and the bar they see is the bar the first one left. That is the whole feature.
 * It is what makes the world feel populated without a guild, a chat, a raid group or a
 * WebSocket — and it is the only genuinely shared mutable state in the game.
 *
 * Three rules follow from it, and each of them is a decision rather than a detail:
 *
 *  - **The ladder is cumulative, not per-run.** A Titan pays the rung a *run* reached; a
 *    wake pays each rung once, against everything an account has done to it all week. The
 *    Titan rewards the best hour you had; the Wurm rewards turning up.
 *  - **The felling chest is shared.** If the pool empties before the wake closes, everybody
 *    who struck it takes the same chest, however little they did. It is a bonus rather than
 *    the payout, because a server too small to fell it must still be worth turning up to.
 *  - **Overkill still counts.** Damage past the last point of the pool is kept on the
 *    striker's own total. Capping it would punish exactly the run that did the most for
 *    everybody — the one that landed the killing blow.
 */

/** The counter a wake's strikes are spent against, per keep. */
export function worldBossCounter(dungeonKey: string): string {
  return `worldboss:${dungeonKey}`;
}

/**
 * Every rung an account's cumulative damage has reached.
 *
 * Plural where the Titan's `tierFor` is singular, and that is the difference between the
 * two modes: a Titan run is paid at one rung — the best it reached — while a wake's rungs
 * are each claimed once as the week's total passes them.
 */
export function tiersReached(
  damage: number,
  tiers: readonly WorldBossTier[],
): readonly WorldBossTier[] {
  return tiers.filter((tier) => damage >= tier.damage);
}

/** The next rung up, for the "so close" line. Null once every rung is behind you. */
export function nextWorldBossTier(
  damage: number,
  tiers: readonly WorldBossTier[],
): WorldBossTier | null {
  let next: WorldBossTier | null = null;
  for (const tier of tiers) {
    if (damage >= tier.damage) continue;
    if (!next || tier.damage < next.damage) next = tier;
  }
  return next;
}

/**
 * Whether a world boss's rules are usable, as a list of complaints.
 *
 * Read by publish validation rather than by the schema, for the reason the Titan's twin
 * gives: "ascending" is a statement about the array as a whole, and a Zod refinement that
 * says it reports at the wrong place. An operator wants to be told which rung is wrong.
 */
export function worldBossRuleProblems(rules: WorldBossRules): string[] {
  const problems: string[] = [];
  if (rules.tiers.length === 0) {
    problems.push(
      'A world boss needs at least one contribution tier, or striking it pays nothing.',
    );
  }

  const keys = new Set<string>();
  let previous = 0;
  for (const [index, tier] of rules.tiers.entries()) {
    if (keys.has(tier.key)) problems.push(`Two tiers share the key "${tier.key}".`);
    keys.add(tier.key);
    if (index > 0 && tier.damage <= previous) {
      problems.push(
        `Tier ${index + 1} ("${tier.name}") wants ${tier.damage.toLocaleString()} damage, which is not above the rung below it.`,
      );
    }
    previous = tier.damage;
  }

  // A top rung above the pool is a rung nobody can reach even by felling it single-handed,
  // which is a promise the content cannot keep rather than a hard target.
  const top = rules.tiers.at(-1);
  if (top && top.damage > rules.maxHp) {
    problems.push(
      `The top tier wants ${top.damage.toLocaleString()} damage from one warden, but the whole boss only has ${rules.maxHp.toLocaleString()} health.`,
    );
  }
  return problems;
}

// ── What a screen reads ─────────────────────────────────────────────────────

export const worldBossTierStandingSchema = z.object({
  key: z.string(),
  name: z.string(),
  damage: z.number().int(),
  rewards: z.record(z.string(), z.number()),
  /** True once this account's cumulative damage has passed it. */
  reached: z.boolean(),
  /** True once it has been collected. A rung is claimed once per wake. */
  claimed: z.boolean(),
});
export type WorldBossTierStanding = z.infer<typeof worldBossTierStandingSchema>;

/** One name on the wake's board. Deliberately thin: a name and a number, nothing social. */
export const worldBossStrikerSchema = z.object({
  profileName: z.string(),
  damage: z.number().int(),
  /** 1-based, so the board reads the way it is drawn. */
  rank: z.number().int(),
  /** True for the reader's own row, so the board can mark it without a second lookup. */
  you: z.boolean(),
});
export type WorldBossStriker = z.infer<typeof worldBossStrikerSchema>;

export const worldBossStandingSchema = z.object({
  dungeonKey: z.string(),
  stageKey: z.string(),
  name: z.string(),
  tagline: z.string(),
  lore: z.string(),

  /** The occurrence, as the game-day it woke on. Null when it is not awake. */
  anchor: z.string().nullable(),
  /** Whether it is awake right now. */
  awake: z.boolean(),
  /** Game-days the current or most recent wake ran between. */
  startsOn: z.string().nullable(),
  endsOn: z.string().nullable(),
  /** The last game-day anything earned this wake can still be collected. */
  claimsCloseOn: z.string().nullable(),
  /**
   * The game-day it next stirs, when it is not awake now.
   *
   * "It is not awake" is true and useless; a player who knows when to come back comes back.
   * Null only when there is genuinely no next time — a one-off that has been and gone.
   */
  wakesOn: z.string().nullable(),

  /** The shared pool. */
  maxHp: z.number().int(),
  damageTaken: z.number().int(),
  /** True once the pool is empty. A felled wake takes no more strikes. */
  felled: z.boolean(),
  felledAt: z.string().nullable(),

  /** How many wardens have struck it, and how many strikes that took. */
  wardens: z.number().int(),
  strikes: z.number().int(),

  /** This account's own damage this wake, and how many strikes it spent. */
  yourDamage: z.number().int(),
  yourStrikes: z.number().int(),
  /** 1-based among everybody who struck it, or null for an account that has not. */
  yourRank: z.number().int().nullable(),

  attemptsLeft: z.number().int(),
  attemptsPerDay: z.number().int(),
  turnCap: z.number().int(),

  tiers: z.array(worldBossTierStandingSchema),
  /** What felling it pays everybody who helped. */
  fellingRewards: z.record(z.string(), z.number()),
  /** True once this account has collected the felling chest. */
  fellingClaimed: z.boolean(),

  /** The top of the board, plus the reader's own row when they are off the end of it. */
  board: z.array(worldBossStrikerSchema),

  /** Why it cannot be struck right now, in the sentence the button shows. Null when it can. */
  blockedReason: z.string().nullable(),
});
export type WorldBossStanding = z.infer<typeof worldBossStandingSchema>;

export const worldBossViewSchema = z.object({
  /** The server's game-day, so a screen counts down against the server's clock. */
  today: z.string(),
  bosses: z.array(worldBossStandingSchema),
});
export type WorldBossView = z.infer<typeof worldBossViewSchema>;

export const NO_WORLD_BOSS: WorldBossView = Object.freeze({ today: '', bosses: [] });

/** What one strike did, for the results screen. */
export const worldBossStrikeSchema = z.object({
  dungeonKey: z.string(),
  /** Damage this strike did. */
  damage: z.number().int(),
  /** The account's cumulative damage after it. */
  totalDamage: z.number().int(),
  /** The shared pool after it. */
  damageTaken: z.number().int(),
  maxHp: z.number().int(),
  /** True when this strike is the one that emptied the pool. */
  felledIt: z.boolean(),
  /** Rungs this strike newly reached. Claiming them is a separate press. */
  tiersReached: z.array(z.string()),
});
export type WorldBossStrike = z.infer<typeof worldBossStrikeSchema>;

export const worldBossClaimRequestSchema = z.object({
  tierKey: z.string().min(1).max(64),
  actionId: z.string().min(8).max(64),
});

export const worldBossSpoilsRequestSchema = z.object({
  actionId: z.string().min(8).max(64),
});

export const worldBossClaimResultSchema = z.object({
  rewards: z.record(z.string(), z.number()),
  worldBoss: worldBossViewSchema,
});
export type WorldBossClaimResult = z.infer<typeof worldBossClaimResultSchema>;
