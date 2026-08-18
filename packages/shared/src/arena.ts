import { z } from 'zod';
import { ELEMENTS, RARITIES } from './enums';

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
  /** Who is being offered, so their public card is one click from the offer. */
  playerId: z.string(),
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
  /** Whose row it is, so a name on the ladder opens the card behind it. */
  playerId: z.string(),
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
  /**
   * Client-generated. Replaying it returns the fight that was already opened.
   *
   * An attack spends a token and creates the one active battle a player is allowed, so a
   * retried request — a tapped button on a dropped connection — used to come back as
   * "You are already in a battle", about a fight the player could not see and had to
   * retreat out of. The token was never double-spent; the fight was simply lost behind an
   * error message.
   */
  actionId: z.string().min(8).max(64),
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

// ── Bots ────────────────────────────────────────────────────────────────────

/**
 * What one band's bots are built from.
 *
 * A band is a recipe, not a roster: the champions, relics and ratings are synthesised
 * from live content every time the ladder is refreshed, so a bot in Gold is exactly as
 * strong as whatever Gold currently means. Nothing about a bot is authored by hand, which
 * is what lets sixty of them exist without sixty rows of content to maintain
 * (ECONOMY_BALANCE §12).
 */
export const arenaBotBandSchema = z.object({
  /** How many bots hold this band. */
  count: z.number().int().min(0).max(200),
  /** The rating window they are spread across, evenly, so no rung is empty. */
  ratingMin: z.number().int().min(0).max(10_000),
  ratingMax: z.number().int().min(0).max(10_000),
  /** The account level shown on their profile — flavour, but it has to be plausible. */
  levelMin: z.number().int().min(1).max(60),
  levelMax: z.number().int().min(1).max(60),
  /** The champions their defence is built at. */
  teamSize: z.number().int().min(1).max(4),
  championLevelMin: z.number().int().min(1).max(60),
  championLevelMax: z.number().int().min(1).max(60),
  championRank: z.number().int().min(1).max(6),
  ascension: z.number().int().min(0).max(6),
  /** The relics they wear. `gearSlots` counts from the top of `GEAR_SLOTS`. */
  gearSlots: z.number().int().min(0).max(9),
  gearRank: z.number().int().min(1).max(6),
  gearRarity: z.enum(RARITIES),
  gearLevel: z.number().int().min(0).max(16),
});
export type ArenaBotBand = z.infer<typeof arenaBotBandSchema>;

export const arenaBotBandsSchema = z.record(z.enum(ARENA_BANDS), arenaBotBandSchema);

/**
 * Sixty bots, weighted towards the bottom. Overridden by `arena.botBands`.
 *
 * The shape is the point: most of a small ladder's traffic is in Bronze and Silver, so
 * that is where the opponents are. Platinum holds four because a Platinum account should
 * meet the same few faces and recognise them — at the top of the ladder, thin is honest.
 *
 * Ascension tracks the accessory gates (Ring at 2, Amulet at 4, Banner at 6), so a bot
 * never wears a relic a player at the same ascension could not.
 */
export const DEFAULT_BOT_BANDS: Readonly<Record<ArenaBand, ArenaBotBand>> = Object.freeze({
  bronze: {
    count: 24,
    ratingMin: 400,
    ratingMax: 1_150,
    levelMin: 8,
    levelMax: 18,
    teamSize: 3,
    championLevelMin: 15,
    championLevelMax: 25,
    championRank: 3,
    ascension: 0,
    gearSlots: 6,
    gearRank: 2,
    gearRarity: 'rare',
    gearLevel: 4,
  },
  silver: {
    count: 20,
    ratingMin: 1_200,
    ratingMax: 1_950,
    levelMin: 18,
    levelMax: 30,
    teamSize: 4,
    championLevelMin: 25,
    championLevelMax: 35,
    championRank: 4,
    ascension: 2,
    gearSlots: 7,
    gearRank: 3,
    gearRarity: 'rare',
    gearLevel: 8,
  },
  gold: {
    count: 12,
    ratingMin: 2_000,
    ratingMax: 2_950,
    levelMin: 30,
    levelMax: 45,
    teamSize: 4,
    championLevelMin: 35,
    championLevelMax: 50,
    championRank: 5,
    ascension: 4,
    gearSlots: 8,
    gearRank: 4,
    gearRarity: 'epic',
    gearLevel: 12,
  },
  platinum: {
    count: 4,
    ratingMin: 3_000,
    ratingMax: 3_400,
    levelMin: 45,
    levelMax: 60,
    teamSize: 4,
    championLevelMin: 50,
    championLevelMax: 60,
    championRank: 6,
    ascension: 6,
    gearSlots: 9,
    gearRank: 5,
    gearRarity: 'epic',
    gearLevel: 16,
  },
});

/**
 * The two halves a bot's name is drawn from. Overridden by `arena.botGivenNames` and
 * `arena.botEpithets`.
 *
 * Names are natural and carry no marker — the owner's decision (GAME_DESIGN §9.3). Two
 * pools rather than one list because forty given names against twenty-four epithets is
 * nine hundred and sixty names, which is enough that a refreshed ladder never repeats
 * itself and an operator adding one word adds forty names.
 *
 * Every combination fits `profileNameSchema`: the longest given name is seven characters
 * and the longest epithet is eight, so `given + space + epithet` never exceeds sixteen.
 */
export const DEFAULT_BOT_GIVEN_NAMES: readonly string[] = Object.freeze([
  'Marek',
  'Corvin',
  'Iseld',
  'Bran',
  'Rook',
  'Talia',
  'Edrin',
  'Halvi',
  'Nesta',
  'Orrin',
  'Perrin',
  'Quill',
  'Sable',
  'Torvin',
  'Ulric',
  'Vesna',
  'Wren',
  'Yarrow',
  'Zeva',
  'Alder',
  'Briar',
  'Cael',
  'Dagna',
  'Ember',
  'Fennic',
  'Garrick',
  'Hollis',
  'Imre',
  'Joran',
  'Kestrel',
  'Lyra',
  'Mabon',
  'Niamh',
  'Osric',
  'Pell',
  'Riven',
  'Soren',
  'Thalia',
  'Ulla',
  'Varek',
]);

export const DEFAULT_BOT_EPITHETS: readonly string[] = Object.freeze([
  'Vale',
  'Ashen',
  'Thorn',
  'Ember',
  'Grey',
  'Hollow',
  'Ironhand',
  'Fenwick',
  'Marrow',
  'Quill',
  'Reed',
  'Stone',
  'Vesper',
  'Wilder',
  'Bright',
  'Cinder',
  'Dusk',
  'Frost',
  'Gale',
  'Harrow',
  'Larkin',
  'Moss',
  'Rime',
  'Storm',
]);

/** One band's standing on the ladder, as the Admin bot manager reports it. */
export const arenaBotCensusEntrySchema = z.object({
  band: z.enum(ARENA_BANDS),
  /** How many bots the band should hold, and how many it does. */
  wanted: z.number().int(),
  present: z.number().int(),
  ratingMin: z.number().int(),
  ratingMax: z.number().int(),
});
export type ArenaBotCensusEntry = z.infer<typeof arenaBotCensusEntrySchema>;

export const arenaBotCensusSchema = z.object({
  bands: z.array(arenaBotCensusEntrySchema),
  total: z.number().int(),
  /** When the ladder was last refreshed, ISO-8601, or null if it never has been. */
  refreshedAt: z.string().nullable(),
});
export type ArenaBotCensus = z.infer<typeof arenaBotCensusSchema>;

/** What a seeding or refresh run did. */
export const arenaLadderReportSchema = z.object({
  created: z.number().int(),
  refreshed: z.number().int(),
  removed: z.number().int(),
  byBand: z.record(z.enum(ARENA_BANDS), z.number().int()),
});
export type ArenaLadderReport = z.infer<typeof arenaLadderReportSchema>;

/** Both halves of what an operator wants back: what happened, and what the ladder is now. */
export const arenaLadderResultSchema = z.object({
  report: arenaLadderReportSchema,
  census: arenaBotCensusSchema,
});
export type ArenaLadderResult = z.infer<typeof arenaLadderResultSchema>;
