import { z } from 'zod';
import { ELEMENTS } from './enums';

/**
 * The Arena, and the Hall of Valor it pays into.
 *
 * Asynchronous 4v4: nobody is ever waiting for an opponent to be online, because the
 * opponent never plays. An attack is fought against a *snapshot* of a defence team — the
 * champions the defender left standing, at the stats they had when the attack began — so
 * the fight is a real engine battle in which one side is driven entirely by the AI
 * (docs/GAME_DESIGN.md §9.3).
 *
 * The ladder is seeded with bots because an empty ladder is worse than a fake one: a new
 * account at Bronze I must find someone to fight on its first evening, and at EA there
 * may be four real players. Bots are ordinary player rows with ordinary champions, so
 * nothing downstream — matchmaking, leaderboards, the battle engine — needs a special
 * case (docs/DATA_MODEL.md).
 */

// ── The ladder ──────────────────────────────────────────────────────────────

/**
 * Ten rungs from Bronze I to Platinum.
 *
 * The *names* are code because they are an ordered ladder rather than a tunable; the
 * rating each one starts at is `game_config`, because where the rungs sit is exactly the
 * kind of thing an operator retunes after watching a season (ECONOMY_BALANCE §8).
 */
export const ARENA_TIERS = [
  'bronze_1',
  'bronze_2',
  'bronze_3',
  'silver_1',
  'silver_2',
  'silver_3',
  'gold_1',
  'gold_2',
  'gold_3',
  'platinum',
] as const;
export type ArenaTier = (typeof ARENA_TIERS)[number];

export const ARENA_TIER_LABELS: Readonly<Record<ArenaTier, string>> = Object.freeze({
  bronze_1: 'Bronze I',
  bronze_2: 'Bronze II',
  bronze_3: 'Bronze III',
  silver_1: 'Silver I',
  silver_2: 'Silver II',
  silver_3: 'Silver III',
  gold_1: 'Gold I',
  gold_2: 'Gold II',
  gold_3: 'Gold III',
  platinum: 'Platinum',
});

/** Rating at which each tier begins. Overridden by `arena.tierThresholds`. */
export const DEFAULT_TIER_THRESHOLDS: Readonly<Record<ArenaTier, number>> = Object.freeze({
  bronze_1: 0,
  bronze_2: 800,
  bronze_3: 1_000,
  silver_1: 1_200,
  silver_2: 1_400,
  silver_3: 1_700,
  gold_1: 2_000,
  gold_2: 2_300,
  gold_3: 2_600,
  platinum: 3_000,
});

/** The four bands the bot ladder is seeded across, and the tiers each covers. */
export const ARENA_BANDS = ['bronze', 'silver', 'gold', 'platinum'] as const;
export type ArenaBand = (typeof ARENA_BANDS)[number];

export function bandOf(tier: ArenaTier): ArenaBand {
  if (tier === 'platinum') return 'platinum';
  return tier.split('_')[0] as ArenaBand;
}

/**
 * The tier a rating sits in.
 *
 * Walks down from the top so the highest threshold a rating clears wins; a rating below
 * every threshold is Bronze I, which is where a new account starts.
 */
export function tierForRating(
  rating: number,
  thresholds: Readonly<Record<ArenaTier, number>> = DEFAULT_TIER_THRESHOLDS,
): ArenaTier {
  for (let index = ARENA_TIERS.length - 1; index >= 0; index -= 1) {
    const tier = ARENA_TIERS[index]!;
    if (rating >= thresholds[tier]) return tier;
  }
  return 'bronze_1';
}

// ── State ───────────────────────────────────────────────────────────────────

/**
 * Attack tokens, derived rather than ticked.
 *
 * The same arrangement energy uses: the row stores a value and the moment it was written,
 * and everything else is arithmetic against the clock. An idle account costs nothing to
 * keep current, and there is no job that can fall behind (docs/ARCHITECTURE.md §5.1).
 */
export const arenaTokensSchema = z.object({
  value: z.number().int(),
  cap: z.number().int(),
  regenSeconds: z.number().int(),
  /** ISO-8601, or null when the meter is full. */
  nextTickAt: z.string().nullable(),
  fullAt: z.string().nullable(),
});
export type ArenaTokens = z.infer<typeof arenaTokensSchema>;

/** One champion on a team, as the arena needs to show it. */
export const arenaTeamMemberSchema = z.object({
  championKey: z.string(),
  level: z.number().int(),
  rank: z.number().int(),
  ascension: z.number().int(),
  power: z.number().int(),
});
export type ArenaTeamMember = z.infer<typeof arenaTeamMemberSchema>;

/**
 * An opponent on offer.
 *
 * Deliberately carries no hint of whether it is a bot. The owner's decision was natural
 * names and no marker (GAME_DESIGN §9.3): a ladder that labels half its rungs "not a real
 * person" is a ladder nobody climbs.
 */
export const arenaOfferSchema = z.object({
  offerId: z.string(),
  profileName: z.string(),
  level: z.number().int(),
  rating: z.number().int(),
  tier: z.enum(ARENA_TIERS),
  power: z.number().int(),
  team: z.array(arenaTeamMemberSchema),
  /** What beating them would be worth, so the choice between offers is informed. */
  ratingGain: z.number().int(),
  ratingLoss: z.number().int(),
});
export type ArenaOffer = z.infer<typeof arenaOfferSchema>;

export const arenaWeeklyChestSchema = z.object({
  /** The tier the chest will pay at — the best held this week, not the current one. */
  tier: z.enum(ARENA_TIERS),
  claimable: z.boolean(),
  /** ISO-8601 of the next Monday reset. */
  resetsAt: z.string(),
});
export type ArenaWeeklyChest = z.infer<typeof arenaWeeklyChestSchema>;

export const arenaStateSchema = z.object({
  rating: z.number().int(),
  tier: z.enum(ARENA_TIERS),
  /** Best rating held since the last weekly reset — what the chest pays against. */
  weeklyHigh: z.number().int(),
  tokens: arenaTokensSchema,
  /** `player_champions` ids, in formation order. Empty until the player sets one. */
  defence: z.array(z.string().uuid()),
  defenceTeam: z.array(arenaTeamMemberSchema),
  offers: z.array(arenaOfferSchema),
  weeklyChest: arenaWeeklyChestSchema,
  /** What a win pays at the current tier. */
  medalsPerWin: z.number().int(),
  /** Crystals to refill the token meter, and whether a free refresh is available. */
  refreshCost: z.number().int(),
});
export type ArenaState = z.infer<typeof arenaStateSchema>;

export const arenaLeaderboardEntrySchema = z.object({
  position: z.number().int(),
  profileName: z.string(),
  rating: z.number().int(),
  tier: z.enum(ARENA_TIERS),
  level: z.number().int(),
  /** True for the reading player's own row, so the client can mark it. */
  isSelf: z.boolean(),
});
export type ArenaLeaderboardEntry = z.infer<typeof arenaLeaderboardEntrySchema>;

export const arenaLeaderboardSchema = z.object({
  top: z.array(arenaLeaderboardEntrySchema),
  /** The reading player's neighbourhood, when they are outside the top. */
  around: z.array(arenaLeaderboardEntrySchema),
  ownPosition: z.number().int().nullable(),
});
export type ArenaLeaderboard = z.infer<typeof arenaLeaderboardSchema>;

// ── Acting ──────────────────────────────────────────────────────────────────

export const arenaDefenceRequestSchema = z.object({
  /** `player_champions` ids, in formation order. The first is the leader. */
  team: z.array(z.string().uuid()).min(1).max(4),
});
export type ArenaDefenceRequest = z.infer<typeof arenaDefenceRequestSchema>;

export const arenaAttackRequestSchema = z.object({
  offerId: z.string().min(4).max(64),
  team: z.array(z.string().uuid()).min(1).max(4),
});
export type ArenaAttackRequest = z.infer<typeof arenaAttackRequestSchema>;

/** What an arena battle paid, on top of the battle view the attack returns. */
export const arenaResultSchema = z.object({
  won: z.boolean(),
  ratingBefore: z.number().int(),
  ratingAfter: z.number().int(),
  ratingDelta: z.number().int(),
  tierBefore: z.enum(ARENA_TIERS),
  tierAfter: z.enum(ARENA_TIERS),
  medals: z.number().int(),
  opponent: z.string(),
});
export type ArenaResult = z.infer<typeof arenaResultSchema>;

// ── The Hall of Valor ───────────────────────────────────────────────────────

/**
 * The six stats a Hall track can raise, per element.
 *
 * A deliberate subset of the engine's eight: speed is absent because an account-wide
 * speed bonus would rewrite every turn order in the game, and crit rate because it is
 * already the most contested substat in the relic economy. What is left is a long,
 * shallow curve that never decides a fight on its own (ECONOMY_BALANCE §8).
 */
export const HALL_STATS = ['hp', 'atk', 'def', 'critDmg', 'acc', 'res'] as const;
export type HallStat = (typeof HALL_STATS)[number];

export const HALL_MAX_LEVEL = 10;

export const hallTrackSchema = z.object({
  element: z.enum(ELEMENTS),
  stat: z.enum(HALL_STATS),
  level: z.number().int(),
  /** Medals for the next level, or null at the cap. */
  nextCost: z.number().int().nullable(),
  /** What the track currently gives — a percentage, or flat points for ACC/RES. */
  value: z.number(),
  /** What it would give one level higher. */
  nextValue: z.number(),
});
export type HallTrack = z.infer<typeof hallTrackSchema>;

export const hallOfValorSchema = z.object({
  medals: z.number().int(),
  tracks: z.array(hallTrackSchema),
  maxLevel: z.number().int(),
});
export type HallOfValor = z.infer<typeof hallOfValorSchema>;

export const hallUpgradeRequestSchema = z.object({
  element: z.enum(ELEMENTS),
  stat: z.enum(HALL_STATS),
  actionId: z.string().min(8).max(64),
});
export type HallUpgradeRequest = z.infer<typeof hallUpgradeRequestSchema>;

export const hallUpgradeResultSchema = z.object({
  track: hallTrackSchema,
  medalsSpent: z.number().int(),
  medalsLeft: z.number().int(),
});
export type HallUpgradeResult = z.infer<typeof hallUpgradeResultSchema>;

/** Per-level value of each track. Overridden by `arena.hallPerLevel`. */
export const DEFAULT_HALL_PER_LEVEL: Readonly<Record<HallStat, number>> = Object.freeze({
  hp: 2,
  atk: 2,
  def: 2,
  critDmg: 1,
  acc: 4,
  res: 4,
});

/** Medals for each level, 1 → 10. Overridden by `arena.hallCosts`. */
export const DEFAULT_HALL_COSTS: readonly number[] = Object.freeze([
  40, 60, 90, 130, 180, 240, 310, 390, 480, 580,
]);
