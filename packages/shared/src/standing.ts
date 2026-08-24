import { z } from 'zod';
import { RARITIES, type Rarity } from './enums';

/**
 * Two ways a collection pays, beyond the champion you happen to be fielding.
 *
 * **Imprint** answers the worst moment in a gacha game: pulling a Legendary you already
 * own. Mistvale's only use for a duplicate was rank-up food, which makes the best pull in
 * the game arrive as a consumable — so a second copy now *also* leaves a permanent mark on
 * every copy of that champion, and it lands the moment the copy arrives rather than when
 * it is spent. **Copies are counted as they are obtained, never as they are held**: feeding
 * the duplicate away is the correct play, and a mechanic that undid the imprint for doing
 * the correct thing would be a trap rather than a decision.
 *
 * **Standing** answers the other one: thirty-seven champions and a game that only ever asks
 * about four. Holding a broad collection pays a small amount to *everything*, so the
 * Chronicle's grey tiles are a target rather than a shelf. It is measured on what an
 * account **holds**, not on what it has seen — which is what keeps it a real choice when a
 * player is deciding whether their only Bracken Puck is worth more as food.
 *
 * Both are **percentages of a champion's base stats**, resolved the way relic percentages
 * already are (COMBAT_SYSTEM §1) — so they cannot compound with each other, and the order
 * they are applied in cannot matter.
 *
 * Neither may grant SPD. That is a deliberate guardrail rather than an oversight: speed
 * decides turn order before anything else in the engine, and an account-wide speed bonus
 * would quietly re-tune every fight in the game — including the boss mechanics that are
 * built around a turn count. The three fields below are the whole vocabulary, so an
 * operator cannot author their way past it.
 */

export const accountStatBonusSchema = z.object({
  hpPct: z.number(),
  atkPct: z.number(),
  defPct: z.number(),
});
export type AccountStatBonus = z.infer<typeof accountStatBonusSchema>;

export const NO_STAT_BONUS: AccountStatBonus = Object.freeze({ hpPct: 0, atkPct: 0, defPct: 0 });

// ── Imprint ─────────────────────────────────────────────────────────────────

/**
 * How many copies each level costs, by rarity.
 *
 * Cumulative and **rarity-scaled**, because "a second copy" means wildly different things
 * at the two ends: a second Uncommon is an afternoon and a second Legendary is a month.
 * The bonus curve below is shared, so what differs between a Legendary and a Common is how
 * far a player has to go to reach the same mark.
 *
 * **Every ladder starts at two.** The first copy is the champion; the *second* is the first
 * mark. An earlier cut opened Legendary at one copy, which handed Mark I free to every
 * Legendary anybody owned — a flat buff wearing the name of a duplicate mechanic. A browser
 * found it: the champion sheet drew a Collection column on a brand-new account.
 */
export type ImprintCopies = Readonly<Record<Rarity, readonly number[]>>;

export const DEFAULT_IMPRINT_COPIES: ImprintCopies = Object.freeze({
  legendary: Object.freeze([2, 3, 4, 5, 6]),
  epic: Object.freeze([2, 3, 5, 7, 10]),
  rare: Object.freeze([3, 5, 9, 15, 23]),
  uncommon: Object.freeze([4, 8, 16, 29, 46]),
  common: Object.freeze([6, 13, 26, 46, 71]),
});

/**
 * What each imprint level is worth.
 *
 * Index 0 is level 1. Deliberately front-loaded: the first duplicate is the one that has
 * to feel like something, and the fifth is a long-term goal rather than the point.
 */
export const DEFAULT_IMPRINT_BONUS: readonly AccountStatBonus[] = Object.freeze([
  Object.freeze({ hpPct: 3, atkPct: 3, defPct: 3 }),
  Object.freeze({ hpPct: 6, atkPct: 6, defPct: 6 }),
  Object.freeze({ hpPct: 10, atkPct: 10, defPct: 10 }),
  Object.freeze({ hpPct: 15, atkPct: 15, defPct: 15 }),
  Object.freeze({ hpPct: 21, atkPct: 21, defPct: 21 }),
]);

// ── Standing ────────────────────────────────────────────────────────────────

/** Distinct non-food champions held for each tier, cumulative. */
export const DEFAULT_STANDING_CHAMPIONS: readonly number[] = Object.freeze([
  5, 10, 15, 20, 25, 30, 37,
]);

/**
 * What each standing tier is worth, to *every* champion on the account.
 *
 * An order of magnitude smaller than imprint, because it applies to everything at once and
 * asks for no decision — it is a reward for playing broadly, not a build.
 */
export const DEFAULT_STANDING_BONUS: readonly AccountStatBonus[] = Object.freeze([
  Object.freeze({ hpPct: 1, atkPct: 1, defPct: 1 }),
  Object.freeze({ hpPct: 2, atkPct: 2, defPct: 2 }),
  Object.freeze({ hpPct: 3, atkPct: 3, defPct: 3 }),
  Object.freeze({ hpPct: 4, atkPct: 4, defPct: 4 }),
  Object.freeze({ hpPct: 5, atkPct: 5, defPct: 5 }),
  Object.freeze({ hpPct: 6, atkPct: 6, defPct: 6 }),
  Object.freeze({ hpPct: 8, atkPct: 8, defPct: 8 }),
]);

// ── The arithmetic ──────────────────────────────────────────────────────────

/**
 * Which level a count has reached on a cumulative ladder.
 *
 * Shared by imprint and standing because they are the same shape, and written to survive
 * an operator's unsorted or duplicated array — content is edited live, and a ladder with a
 * typo in it should cost the retune rather than the account's stats.
 *
 * Named for the ladder rather than for a tier, because the Titan already owns `tierFor`
 * and the two answer different questions about different things.
 */
export function ladderLevel(count: number, thresholds: readonly number[]): number {
  // How many rungs the count is *past*, which is the same answer as the array index for a
  // sorted ladder and the honest one for an unsorted ladder — where taking the highest
  // index instead would hand a player two levels for passing one rung.
  return thresholds.filter((at) => count >= at).length;
}

/** The count the next level needs, or null when there is no next level. */
export function nextLadderAt(count: number, thresholds: readonly number[]): number | null {
  const ahead = thresholds.filter((at) => at > count).sort((a, b) => a - b);
  return ahead[0] ?? null;
}

/** What a reached level is worth. Level 0 is worth nothing, which is not an error. */
export function bonusAt(level: number, curve: readonly AccountStatBonus[]): AccountStatBonus {
  if (level <= 0) return NO_STAT_BONUS;
  return curve[Math.min(level, curve.length) - 1] ?? NO_STAT_BONUS;
}

/** Two bonuses added. They are percentages of the same base, so addition is the whole rule. */
export function addBonuses(a: AccountStatBonus, b: AccountStatBonus): AccountStatBonus {
  return {
    hpPct: a.hpPct + b.hpPct,
    atkPct: a.atkPct + b.atkPct,
    defPct: a.defPct + b.defPct,
  };
}

// ── What the client is told ─────────────────────────────────────────────────

export const imprintStateSchema = z.object({
  championKey: z.string(),
  /** Copies obtained, ever — the first one included. */
  copies: z.number().int(),
  level: z.number().int(),
  /** Copies the next level wants, or null at the top of the ladder. */
  nextAt: z.number().int().nullable(),
  bonus: accountStatBonusSchema,
});
export type ImprintState = z.infer<typeof imprintStateSchema>;

export const standingStateSchema = z.object({
  /** Distinct non-food champions held right now. */
  champions: z.number().int(),
  tier: z.number().int(),
  nextAt: z.number().int().nullable(),
  bonus: accountStatBonusSchema,
});
export type StandingState = z.infer<typeof standingStateSchema>;

export const NO_STANDING: StandingState = Object.freeze({
  champions: 0,
  tier: 0,
  nextAt: DEFAULT_STANDING_CHAMPIONS[0] ?? null,
  bonus: NO_STAT_BONUS,
});

/** Every rarity has a ladder, so a champion of any rarity can be imprinted. */
export function imprintCopiesFor(copies: ImprintCopies, rarity: Rarity): readonly number[] {
  return copies[rarity] ?? DEFAULT_IMPRINT_COPIES[rarity] ?? [];
}

/** Guard for a published `imprintCopies` map — every rarity present, every ladder non-empty. */
export function isImprintCopies(value: unknown): value is ImprintCopies {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const map = value as Record<string, unknown>;
  return RARITIES.every((rarity) => {
    const ladder = map[rarity];
    return (
      Array.isArray(ladder) &&
      ladder.length > 0 &&
      ladder.every((entry) => typeof entry === 'number' && Number.isFinite(entry) && entry > 0)
    );
  });
}
