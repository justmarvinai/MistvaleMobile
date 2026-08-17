import {
  ARENA_TIERS,
  DEFAULT_HALL_COSTS,
  DEFAULT_HALL_PER_LEVEL,
  DEFAULT_TIER_THRESHOLDS,
  HALL_MAX_LEVEL,
  bandOf,
  tierForRating,
  type ArenaBand,
  type ArenaTier,
  type HallStat,
} from '@mistvale/shared';

/**
 * The ladder's arithmetic, as pure functions.
 *
 * Every number here is `game_config` and arrives as an argument — nothing in this file
 * reads configuration or a database, which is what lets the whole rating model be tested
 * exhaustively and re-tuned without a deploy (CLAUDE.md — balance numbers never live in
 * code).
 */

export interface ArenaConfig {
  thresholds: Readonly<Record<ArenaTier, number>>;
  startingRating: number;
  k: number;
  bronzeFloor: boolean;
  medalsPerWin: Readonly<Record<ArenaBand, number>>;
  tokenCap: number;
  tokenRegenSeconds: number;
  offerCount: number;
  freeRefreshesPerDay: number;
  refreshCrystals: number;
  weeklyDecayPct: number;
  hallCosts: readonly number[];
  hallPerLevel: Readonly<Record<HallStat, number>>;
  unlockLevel: number;
}

/** Reads the arena's numbers out of a published config map, with the documented defaults. */
export function arenaConfigFrom(config: Readonly<Record<string, unknown>>): ArenaConfig {
  return {
    thresholds: record(config, 'arena.tierThresholds', DEFAULT_TIER_THRESHOLDS),
    startingRating: number(config, 'arena.startingRating', 900),
    k: number(config, 'arena.ratingK', 32),
    bronzeFloor: boolean(config, 'arena.bronzeFloor', true),
    medalsPerWin: record(config, 'arena.medalsPerWin', {
      bronze: 1,
      silver: 2,
      gold: 3,
      platinum: 4,
    }),
    tokenCap: number(config, 'arena.tokenCap', 10),
    tokenRegenSeconds: number(config, 'arena.tokenRegenSeconds', 3_600),
    offerCount: number(config, 'arena.offerCount', 5),
    freeRefreshesPerDay: number(config, 'arena.freeRefreshesPerDay', 5),
    refreshCrystals: number(config, 'arena.refreshCrystals', 10),
    weeklyDecayPct: number(config, 'arena.weeklyDecayPct', 10),
    hallCosts: Array.isArray(config['arena.hallCosts'])
      ? (config['arena.hallCosts'] as number[])
      : DEFAULT_HALL_COSTS,
    hallPerLevel: record(config, 'arena.hallPerLevel', DEFAULT_HALL_PER_LEVEL),
    unlockLevel: number(config, 'unlocks.arenaLevel', 8),
  };
}

// ── Rating ──────────────────────────────────────────────────────────────────

export interface RatingChange {
  attacker: number;
  defender: number;
}

/**
 * What one result moves, for both sides.
 *
 * Elo-lite: the expected score comes from the rating gap on the standard 400-point
 * logistic, and the swing is `K × (actual − expected)`. Beating somebody far above you is
 * worth most of K; beating somebody far below is worth almost nothing — which is the only
 * thing that stops a Platinum account farming Bronze for medals all week.
 *
 * The defender moves by the opposite amount, so the ladder is zero-sum and a rating means
 * the same thing at the top as at the bottom. They move even though they were not present:
 * a defence team that loses while its owner sleeps has still lost (ECONOMY_BALANCE §8).
 */
export function ratingChange(
  attackerRating: number,
  defenderRating: number,
  attackerWon: boolean,
  config: ArenaConfig,
): RatingChange {
  const expected = 1 / (1 + 10 ** ((defenderRating - attackerRating) / 400));
  const actual = attackerWon ? 1 : 0;
  // Rounded away from zero, so a swing this small is still a swing: at a 700-point gap the
  // raw value is a fraction of a point, and truncating it would make the fight pointless.
  const raw = config.k * (actual - expected);
  const delta = raw >= 0 ? Math.max(1, Math.round(raw)) : Math.min(-1, Math.round(raw));

  return { attacker: delta, defender: -delta };
}

/**
 * Applies a change, respecting the Bronze floor.
 *
 * A loss inside Bronze cannot push a rating below the tier it is in. That is a deliberate
 * deviation from the source game 〔dev〕: this ladder is small enough that a new account on
 * a losing streak would otherwise slide to zero and meet nobody it could beat.
 */
export function applyRating(rating: number, delta: number, config: ArenaConfig): number {
  const next = rating + delta;
  if (delta >= 0) return Math.max(0, next);

  if (!config.bronzeFloor) return Math.max(0, next);
  const tier = tierForRating(rating, config.thresholds);
  if (bandOf(tier) !== 'bronze') return Math.max(0, next);
  return Math.max(config.thresholds[tier], next);
}

/** Medals a win pays, by the *attacker's* band — the ladder they are climbing. */
export function medalsForWin(tier: ArenaTier, config: ArenaConfig): number {
  return config.medalsPerWin[bandOf(tier)] ?? 0;
}

/**
 * The rating a week of inactivity sheds.
 *
 * A percentage of the distance down to the current tier's floor, so decay slows as it
 * approaches and never demotes anybody on its own. An abandoned Platinum account drifts
 * out of the way without anybody being reset to nothing.
 */
export function weeklyDecay(rating: number, config: ArenaConfig): number {
  const tier = tierForRating(rating, config.thresholds);
  const floor = config.thresholds[tier];
  const above = rating - floor;
  if (above <= 0) return rating;
  return rating - Math.floor((above * config.weeklyDecayPct) / 100);
}

// ── Tokens ──────────────────────────────────────────────────────────────────

export interface TokenState {
  value: number;
  cap: number;
  regenSeconds: number;
  nextTickAt: Date | null;
  fullAt: Date | null;
}

/**
 * Attack tokens, derived from the clock.
 *
 * The same shape energy uses, and for the same reason: an account that has been away for
 * a month is current the instant it comes back, with no job to have missed. A stored value
 * above the cap is honoured rather than clipped — a refill or an operator grant may
 * legitimately overfill, and clipping it here would quietly steal it.
 */
export function computeTokens(
  stored: { value: number; updatedAt: Date },
  config: ArenaConfig,
  now: Date,
): TokenState {
  const elapsed = Math.max(0, (now.getTime() - stored.updatedAt.getTime()) / 1000);
  const gained = Math.floor(elapsed / config.tokenRegenSeconds);
  const value =
    stored.value >= config.tokenCap
      ? stored.value
      : Math.min(config.tokenCap, stored.value + gained);

  if (value >= config.tokenCap) {
    return {
      value,
      cap: config.tokenCap,
      regenSeconds: config.tokenRegenSeconds,
      nextTickAt: null,
      fullAt: null,
    };
  }

  // Time since the last *whole* token, so the countdown does not restart on every read.
  const sinceTick = elapsed % config.tokenRegenSeconds;
  const nextTickAt = new Date(now.getTime() + (config.tokenRegenSeconds - sinceTick) * 1000);
  const fullAt = new Date(
    nextTickAt.getTime() + (config.tokenCap - value - 1) * config.tokenRegenSeconds * 1000,
  );
  return {
    value,
    cap: config.tokenCap,
    regenSeconds: config.tokenRegenSeconds,
    nextTickAt,
    fullAt,
  };
}

// ── The Hall of Valor ───────────────────────────────────────────────────────

/** Medals for the next level of a track, or null once it is capped. */
export function hallCost(level: number, config: ArenaConfig): number | null {
  if (level >= HALL_MAX_LEVEL) return null;
  return config.hallCosts[level] ?? null;
}

/** What a track gives at a level: a percentage, or flat points for ACC and RES. */
export function hallValue(stat: HallStat, level: number, config: ArenaConfig): number {
  return (config.hallPerLevel[stat] ?? 0) * level;
}

/**
 * Every tier, in ladder order, with the rating each begins at.
 *
 * Exported so the client can draw the ladder from the operator's own thresholds rather
 * than from a second copy of them.
 */
export function tierLadder(config: ArenaConfig): { tier: ArenaTier; from: number }[] {
  return ARENA_TIERS.map((tier) => ({ tier, from: config.thresholds[tier] }));
}

function number(config: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = config[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function boolean(
  config: Readonly<Record<string, unknown>>,
  key: string,
  fallback: boolean,
): boolean {
  const value = config[key];
  return typeof value === 'boolean' ? value : fallback;
}

function record<T extends Record<string, number>>(
  config: Readonly<Record<string, unknown>>,
  key: string,
  fallback: T,
): T {
  const value = config[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  // Merged over the defaults so a partial edit in Admin cannot leave a hole: an operator
  // who retunes Platinum alone must not blank out the other nine rungs.
  const merged = { ...fallback } as Record<string, number>;
  for (const [name, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'number' && Number.isFinite(entry)) merged[name] = entry;
  }
  return merged as T;
}
