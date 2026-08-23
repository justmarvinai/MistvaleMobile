import { z } from 'zod';
import { GOAL_TYPES, goalSchema } from './goals';
import {
  DIFFICULTIES,
  ELEMENTS,
  GEAR_SLOTS,
  MAX_RANK,
  MIN_RANK,
  RARITIES,
  ROLES,
  STATS,
} from '../enums';
import {
  aiHintsSchema,
  auraSchema,
  effectComponentSchema,
  skillAnimationSchema,
  skillUpgradeSchema,
  targetingSchema,
} from './effects';

/**
 * Content entity contracts.
 *
 * One Zod schema per content type, used in three places: the Admin API validates writes
 * with it, the seed loader validates committed JSON with it, and publish re-validates
 * everything before it goes live. Content that cannot satisfy these never reaches a
 * player (docs/ARCHITECTURE.md §5.4).
 */

/** Keys are stable forever — the database, seeds and assets all reference them. */
export const contentKeySchema = z
  .string()
  .min(2)
  .max(64)
  .regex(/^[a-z][a-z0-9_]*$/, 'Keys are lowercase snake_case, starting with a letter.');

/** Every content row carries these. */
export const contentMetaSchema = z.object({
  key: contentKeySchema,
  /** Ordering hint for lists in-game and in Admin. */
  sortOrder: z.number().int().min(0).max(9999).default(0),
});

// ── Factions ────────────────────────────────────────────────────────────────

export const factionDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(48),
  lore: z.string().max(2000).default(''),
  icon: z.string().max(64).default(''),
});
export type FactionDef = z.infer<typeof factionDefSchema>;

// ── Statuses ────────────────────────────────────────────────────────────────

/** When a periodic status ticks. */
export const STATUS_TICK_TIMINGS = ['none', 'ownerTurnStart', 'ownerTurnEnd'] as const;

/**
 * Which engine behaviour a status maps to.
 *
 * Content picks from this closed list; publish rejects anything else, so a typo can
 * never produce a status the engine silently ignores (docs/COMBAT_SYSTEM.md §7).
 */
export const STATUS_ENGINE_TYPES = [
  'statModifier', // ATK/DEF/SPD/C.RATE up or down, ACC down, Weaken, Strengthen
  'damageOverTime', // Poison, HP Burn
  'healOverTime', // Continuous Heal
  'shield',
  'skipTurn', // Stun, Freeze
  'skipTurnBreakOnDamage', // Sleep
  'forceTargetA1', // Provoke
  'blockBuffs',
  'blockDebuffs',
  'counterattack',
  'allyProtection',
  'reflectDamage',
  'lifesteal', // Vampiric (self), Leech (attackers heal off the holder)
  'healReduction',
  'unkillable',
] as const;
export type StatusEngineType = (typeof STATUS_ENGINE_TYPES)[number];

export const statusDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(48),
  kind: z.enum(['buff', 'debuff']),
  engineType: z.enum(STATUS_ENGINE_TYPES),
  /**
   * Stacking family. A stronger member replaces a weaker one; an equal member refreshes
   * its duration (e.g. `atk_up` covers both the 25% and 50% variants).
   */
  family: z.string().min(1).max(48),
  /** Ranks the family internally: 50% ATK Up outranks 25%. */
  potency: z.number().int().min(1).max(10).default(1),
  params: z
    .object({
      /** For statModifier: which stat and by how much (percent, or flat for ACC/RES). */
      stat: z.enum(STATS).optional(),
      pct: z.number().min(-100).max(200).optional(),
      flat: z.number().min(-200).max(200).optional(),
      /** For damage/heal over time: share of the holder's max HP per tick. */
      tickPct: z.number().min(0).max(50).optional(),
      tick: z.enum(STATUS_TICK_TIMINGS).default('none'),
      /** How many independent copies may sit on one unit. */
      maxStacks: z.number().int().min(1).max(10).default(1),
      /** For counterattack/reflect/protection: strength as a percentage. */
      ratio: z.number().min(0).max(100).optional(),
    })
    .default({ tick: 'none', maxStacks: 1 }),
  icon: z.string().max(64).default(''),
  description: z.string().max(400).default(''),
});
export type StatusDef = z.infer<typeof statusDefSchema>;

// ── Skills ──────────────────────────────────────────────────────────────────

export const SKILL_SLOTS = ['a1', 'a2', 'a3', 'a4', 'passive'] as const;
export type SkillSlot = (typeof SKILL_SLOTS)[number];

export const skillDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(64),
  /** Player-facing text; `{placeholders}` are filled from the components. */
  description: z.string().max(600).default(''),
  slot: z.enum(SKILL_SLOTS),
  /** A1s have no cooldown; actives are 3–6 turns. */
  cooldown: z.number().int().min(0).max(9).default(0),
  targeting: targetingSchema,
  components: z.array(effectComponentSchema).min(1).max(8),
  upgrades: z.array(skillUpgradeSchema).max(6).default([]),
  aiHints: aiHintsSchema.default({}),
  animation: skillAnimationSchema.default({ track: 'attack' }),
});
export type SkillDef = z.infer<typeof skillDefSchema>;

// ── Assets ──────────────────────────────────────────────────────────────────

export const animationTrackSchema = z.object({
  frames: z.number().int().min(1).max(64),
  fps: z.number().int().min(1).max(30).default(9),
  loop: z.boolean().default(false),
});

export const assetDefSchema = contentMetaSchema.extend({
  kind: z.enum(['unit', 'vfx', 'ui', 'audio']),
  /** `repo` assets ship in the build; `upload` ones arrive through the Admin Suite. */
  source: z.enum(['repo', 'upload']).default('repo'),
  /** Path prefix under the atlas or uploads directory. */
  basePath: z.string().min(1).max(200),
  tracks: z.record(z.string(), animationTrackSchema).default({}),
  stillPath: z.string().max(200).default(''),
  avatarPath: z.string().max(200).default(''),
  /**
   * Tint applied to a placeholder sprite so art-pending champions still read as
   * distinct (docs/ASSET_GUIDE.md). Ignored once real art is uploaded.
   */
  tint: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
});
export type AssetDef = z.infer<typeof assetDefSchema>;

// ── Champions ───────────────────────────────────────────────────────────────

/** Base stats at ★6 / level 60 / ascension 6; lower tiers derive from these. */
export const baseStatsSchema = z.object({
  // The ceiling is a guard against a slipped zero, not a design limit: it has to clear the
  // heaviest thing the game fights, which since C9 is a Titan rather than a keep-boss —
  // a wall authored so that no team kills it, where a keep-boss is authored to fall.
  // Champions live three orders of magnitude below it and keep-bosses two.
  hp: z.number().int().min(100).max(100_000_000),
  atk: z.number().int().min(10).max(5_000),
  def: z.number().int().min(10).max(5_000),
  spd: z.number().int().min(50).max(200),
  critRate: z.number().int().min(0).max(100).default(15),
  critDmg: z.number().int().min(0).max(300).default(50),
  res: z.number().int().min(0).max(300).default(30),
  acc: z.number().int().min(0).max(300).default(0),
});
export type BaseStats = z.infer<typeof baseStatsSchema>;

export const championDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(48),
  title: z.string().max(64).default(''),
  lore: z.string().max(2000).default(''),
  factionKey: contentKeySchema,
  element: z.enum(ELEMENTS),
  rarity: z.enum(RARITIES),
  role: z.enum(ROLES),
  baseStats: baseStatsSchema,
  /** Ordered skill keys: A1 first, passive last. */
  skills: z.array(contentKeySchema).min(1).max(5),
  aura: auraSchema.nullable().default(null),
  assetKey: contentKeySchema,
  /**
   * The star this champion is summoned and granted at.
   *
   * Constrained by rarity, and only two rarities have a choice: a Common may be authored
   * at ★1 or ★2 and an Uncommon at ★2 or ★3, which is what makes an early roster feel
   * unequal without anything being unfair. A Rare is ★3, an Epic ★4 and a Legendary ★5,
   * always — a Rare that started at ★4 would be an Epic wearing the wrong colour.
   *
   * Optional, and absent means "the lowest this rarity starts at" (`baseRankOf`). Publish
   * validation refuses a value outside the rarity's range, because the star ceiling is
   * derived from this and a bad one would strand a champion mid-track.
   */
  baseRank: z.number().int().min(1).max(6).optional(),
  /** Food units are excluded from the Chronicle's completion count. */
  isFood: z.boolean().default(false),
  summonable: z.boolean().default(true),
  starter: z.boolean().default(false),
  /** Bumped whenever stats change, so the Chronicle can flag "updated". */
  balanceVersion: z.number().int().min(1).default(1),
});
export type ChampionDef = z.infer<typeof championDefSchema>;

// ── Enemies ─────────────────────────────────────────────────────────────────

/** Composable boss behaviours the engine knows how to run. */
export const bossMechanicsSchema = z.object({
  /** Immune to Stun/Freeze/Sleep/Provoke — the baseline for every boss. */
  almightyImmunity: z.boolean().default(false),
  tmReductionImmune: z.boolean().default(false),
  /** Fire-Knight-style hit-counter shield. */
  hitShield: z
    .object({ hits: z.number().int().min(1).max(30), punishTmPct: z.number().min(0).max(100) })
    .optional(),
  /** Ice-Golem-style retaliation when crossing HP thresholds. */
  thresholdRetaliation: z
    .object({ perHpPct: z.number().min(1).max(50), skipIfDot: z.boolean().default(true) })
    .optional(),
  /** Spider-style add summoning. */
  addSummon: z
    .object({
      unitKey: contentKeySchema,
      perTurn: z.number().int().min(1).max(4),
      cap: z.number().int().min(1).max(10),
    })
    .optional(),
  /** Damage ramp after a grace period, so fights cannot stall forever. */
  enrage: z
    .object({
      afterTurn: z.number().int().min(1).max(60),
      dmgPctPerTurn: z.number().min(1).max(50),
    })
    .optional(),
});
export type BossMechanics = z.infer<typeof bossMechanicsSchema>;

export const enemyDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(48),
  archetype: z.string().min(1).max(48),
  element: z.enum(ELEMENTS),
  role: z.enum(ROLES),
  /**
   * Stats at `anchorLevel`. A stage scales them to the level its wave specifies.
   *
   * Same convention as champions: author the numbers at the tier you can picture, and
   * let the curve derive every other tier from them.
   */
  baseStats: baseStatsSchema,
  /** The level `baseStats` describes. Stages scale by `growth ^ (level − anchorLevel)`. */
  anchorLevel: z.number().int().min(1).max(120).default(60),
  /** Per-level multiplicative growth, e.g. 1.045. */
  growth: z.number().min(1).max(1.2).default(1.045),
  skills: z.array(contentKeySchema).min(1).max(5),
  assetKey: contentKeySchema,
  isBoss: z.boolean().default(false),
  bossMechanics: bossMechanicsSchema.default({
    almightyImmunity: false,
    tmReductionImmune: false,
  }),
});
export type EnemyDef = z.infer<typeof enemyDefSchema>;

// ── Gear ────────────────────────────────────────────────────────────────────

/** Set bonuses the engine implements. */
export const GEAR_BONUS_TYPES = [
  'stat', // flat or percentage stat bonus
  'lifesteal',
  'regen',
  'provokeOnHit',
  'stunOnHit',
  'burnOnHit',
  'counterOnHit',
  'tmOnDamageTaken',
] as const;

export const gearSetDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(48),
  lore: z.string().max(600).default(''),
  /** How many pieces complete the set. */
  pieces: z.union([z.literal(2), z.literal(4)]),
  bonusType: z.enum(GEAR_BONUS_TYPES),
  bonus: z.object({
    stat: z.enum(STATS).optional(),
    pct: z.number().min(0).max(100).optional(),
    flat: z.number().min(0).max(200).optional(),
    /** Proc probability 0–1 for on-hit bonuses. */
    chance: z.number().min(0).max(1).optional(),
    turns: z.number().int().min(1).max(4).optional(),
  }),
});
export type GearSetDef = z.infer<typeof gearSetDefSchema>;

export const gearSlotDefSchema = z.object({
  key: z.enum(GEAR_SLOTS),
  name: z.string().min(1).max(32),
  /** Which main stats may roll here; weapon/helm/shield are fixed to one. */
  allowedMainStats: z.array(z.enum(STATS)).min(1),
  /** Percentage-variant availability, mirroring the source game's slot rules. */
  allowsPercentMain: z.boolean().default(false),
  accessory: z.boolean().default(false),
  /** Ascension level required before the slot may be used at all. */
  ascensionRequired: z.number().int().min(0).max(6).default(0),
  sortOrder: z.number().int().min(0).max(99).default(0),
});
export type GearSlotDef = z.infer<typeof gearSlotDefSchema>;

/**
 * One rollable relic stat, in one form.
 *
 * A relic's numbers are the balance surface of the whole gear economy, so they are
 * content rather than code: `hp_flat` and `hp_pct` are separate entries because they are
 * separately tuned, and the key is what a `{stat, percent}` pair resolves to.
 *
 * Values are given at the two ends of the upgrade track — `mainBase` at +0 and `mainMax`
 * at the maximum level — and interpolated between. Storing the endpoints rather than a
 * per-level step is what keeps "an r6 weapon caps at 265 ATK" true by construction
 * instead of true until rounding drifts (docs/ECONOMY_BALANCE.md §4).
 *
 * Every array is indexed by rank − 1, so index 5 is a ★6 relic.
 */
export const gearStatDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(32),
  stat: z.enum(STATS),
  /** A percentage of the champion's base stat, rather than a flat addition. */
  percent: z.boolean().default(false),
  canBeMain: z.boolean().default(true),
  canBeSub: z.boolean().default(true),
  mainBase: z.array(z.number().min(0)).length(MAX_RANK),
  mainMax: z.array(z.number().min(0)).length(MAX_RANK),
  subMin: z.array(z.number().min(0)).length(MAX_RANK),
  subMax: z.array(z.number().min(0)).length(MAX_RANK),
});
export type GearStatDef = z.infer<typeof gearStatDefSchema>;

// ── Summoning ───────────────────────────────────────────────────────────────

/**
 * Mercy for one rarity.
 *
 * After `after` consecutive summons without that rarity, its chance grows by `step` each
 * pull until it lands, then the counter resets. Source-faithful, and — crucially — shown
 * to the player: the Odds & Mercy panel renders these exact numbers, so the published
 * value and the advertised value cannot drift apart (GAME_DESIGN §10).
 */
export const pityRuleSchema = z.object({
  after: z.number().int().min(0).max(1000),
  step: z.number().min(0).max(1),
  /** Ceiling on the accrued bonus. 1 means it can reach certainty. */
  maxBonus: z.number().min(0).max(1).default(1),
});
export type PityRule = z.infer<typeof pityRuleSchema>;

/**
 * One sigil's pool.
 *
 * Rates, mercy and the champion table all live here rather than in `game_config`, because
 * they are per-pool: Radiant's mercy is not Gleaming's, and a summon event that doubles
 * Epic weight for a weekend must not touch the other three. Publish validation checks the
 * rates sum to 1 and that every champion named exists and is summonable.
 */
export const summonPoolDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(48),
  description: z.string().max(400).default(''),
  /** The `item_defs` key spent for one pull. */
  sigilKey: contentKeySchema,
  /** Rarity distribution. Must sum to 1 (publish-validated). */
  rates: z.partialRecord(z.enum(RARITIES), z.number().min(0).max(1)),
  /** Mercy per rarity. Rarities absent here simply have none. */
  pity: z.partialRecord(z.enum(RARITIES), pityRuleSchema).default({}),
  /**
   * Which champions can appear, and how likely each is *within its rarity*.
   *
   * Weights are relative inside a rarity band, never across bands — the band is chosen
   * first from `rates`, then a champion from it. Keeping the two steps separate is what
   * makes the advertised rate honest no matter how the roster grows.
   */
  entries: z
    .array(
      z.object({
        championKey: contentKeySchema,
        weight: z.number().min(0).max(1000).default(10),
        /** Marks a rate-up champion for the banner's "featured" strip. */
        featured: z.boolean().default(false),
      }),
    )
    .min(1),
  /** ×10 pulls guarantee at least this rarity once, if set. */
  tenPullFloor: z.enum(RARITIES).optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0),
});
export type SummonPoolDef = z.infer<typeof summonPoolDefSchema>;

// ── Shops ───────────────────────────────────────────────────────────────────

/** What a shop slot hands over when bought. */
export const SHOP_OFFER_KINDS = ['item', 'gear', 'champion', 'currency'] as const;
export type ShopOfferKind = (typeof SHOP_OFFER_KINDS)[number];

/**
 * One thing a shop can roll into a slot.
 *
 * `weight` is relative within the shop, so making relics rarer is one number. A `gear`
 * offer describes a *band* rather than a specific relic — the server rolls the actual
 * piece when the slot is stocked, the same way a drop does.
 */
export const shopOfferSchema = z.object({
  key: contentKeySchema,
  kind: z.enum(SHOP_OFFER_KINDS),
  name: z.string().min(1).max(48),
  weight: z.number().min(0).max(1000).default(10),
  currency: z.enum(['silver', 'crystals']).default('silver'),
  price: z.number().int().min(0),
  /** Scales the price with the rolled relic's rank, for `gear` offers. */
  pricePerRank: z.number().int().min(0).default(0),
  /** `item_defs` key for `item`, `champion_defs` key for `champion`. */
  refKey: z.string().max(64).default(''),
  quantity: z.number().int().min(1).max(999).default(1),
  /** Relic band for `gear` offers. */
  gear: z
    .object({
      rankMin: z.number().int().min(MIN_RANK).max(MAX_RANK),
      rankMax: z.number().int().min(MIN_RANK).max(MAX_RANK),
      rarityWeights: z.partialRecord(z.enum(RARITIES), z.number().min(0)),
      /** Empty means every published set. */
      setKeys: z.array(contentKeySchema).default([]),
    })
    .optional(),
  /** How many of this offer may be bought per daily reset. 0 = unlimited. */
  dailyLimit: z.number().int().min(0).max(99).default(0),
  minAccountLevel: z.number().int().min(1).max(60).default(1),
});
export type ShopOffer = z.infer<typeof shopOfferSchema>;

/**
 * A shop: a set of slots that restock together on a timer.
 *
 * Stock is per player and rolled server-side, so a shop's contents are as unguessable as
 * a summon and as auditable as a drop.
 */
export const shopDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(48),
  description: z.string().max(400).default(''),
  restockMinutes: z.number().int().min(5).max(1440).default(60),
  /** Slots every player has. */
  baseSlots: z.number().int().min(1).max(12).default(4),
  /** Extra slots a player may unlock permanently with crystals. */
  crystalSlots: z.number().int().min(0).max(12).default(4),
  crystalSlotCost: z.number().int().min(0).max(5000).default(150),
  /** Crystals to re-roll the whole shop before the timer is up. */
  refreshCost: z.number().int().min(0).max(5000).default(50),
  offers: z.array(shopOfferSchema).min(1),
});
export type ShopDef = z.infer<typeof shopDefSchema>;

// ── Campaign & stages ───────────────────────────────────────────────────────

export const campaignChapterDefSchema = contentMetaSchema.extend({
  number: z.number().int().min(1).max(24),
  name: z.string().min(1).max(64),
  region: z.string().max(64).default(''),
  lore: z.string().max(2000).default(''),
  backgroundAsset: z.string().max(64).default(''),
  /** Which relic set this chapter drops. */
  setKey: contentKeySchema.optional(),
  starRewards: z
    .array(
      z.object({
        stars: z.number().int().min(1).max(252),
        rewards: z.record(z.string(), z.number()),
      }),
    )
    .default([]),
});
export type CampaignChapterDef = z.infer<typeof campaignChapterDefSchema>;

/** One enemy placed in a wave. */
export const waveUnitSchema = z.object({
  enemyKey: contentKeySchema,
  level: z.number().int().min(1).max(100),
  stars: z.number().int().min(1).max(6).default(1),
  /** Battlefield position 0–3. */
  slot: z.number().int().min(0).max(3),
});

export const STAGE_MODES = [
  'campaign',
  'dungeon',
  'springs',
  'proving',
  'tutorial',
  'titan',
] as const;

// ── The Depths ──────────────────────────────────────────────────────────────

/**
 * What kind of keep a dungeon is.
 *
 * The first three differ in what they pay and when they open, not in how they are fought:
 * a floor is a stage like any other, so everything the campaign already does — unlocks,
 * stars, clears, first-clear bonuses — applies here without a second implementation.
 *
 * **`titan` is the exception, and it is one deliberately.** A Titan is not cleared; it is
 * *survived*, and what a run is worth is how much of it you took down before the turn cap
 * or your own last champion ran out. So a titan keep carries a `titan` block — the cap, the
 * keys, and the damage tiers — and its single floor is fought with keys rather than energy
 * and paid on any ending rather than on a victory.
 */
export const DUNGEON_KINDS = ['relic', 'proving', 'springs', 'titan'] as const;
export type DungeonKind = (typeof DUNGEON_KINDS)[number];

/**
 * One rung of a Titan's damage ladder.
 *
 * The same shape as a chapter's star chest — a threshold and a bag of rewards — because it
 * is the same idea: a number you reach rather than a thing you beat. What differs is that
 * a Titan pays it *every run* rather than once, since the run is the achievement.
 */
export const titanTierSchema = z.object({
  key: contentKeySchema,
  name: z.string().min(1).max(48),
  /** Damage this rung wants. The highest rung a run reaches is the one it is paid at. */
  damage: z.number().int().min(1).max(1_000_000_000),
  rewards: z.record(z.string(), z.number()),
});
export type TitanTier = z.infer<typeof titanTierSchema>;

/**
 * A Titan's rules: how long a run lasts, how many a day, and what each is worth.
 *
 * The turn cap is the mode. A campaign stage ends when one side is gone; a Titan is built
 * so that side is always yours, and the cap is what turns "can you win" into "how far can
 * you get" — the fight worth optimising that the rest of the game does not have.
 */
export const titanRulesSchema = z.object({
  /** Turns a run lasts before the Titan sees you off. Overrides `combat.maxTurns`. */
  turnCap: z.number().int().min(5).max(200).default(50),
  /** Keys a day. Spent instead of energy, and restored by the daily rollover. */
  keysPerDay: z.number().int().min(1).max(20).default(2),
  /** Ascending by damage. Publish validation refuses an out-of-order or empty ladder. */
  tiers: z.array(titanTierSchema).max(12).default([]),
});
export type TitanRules = z.infer<typeof titanRulesSchema>;

export const dungeonDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(64),
  kind: z.enum(DUNGEON_KINDS),
  lore: z.string().max(2000).default(''),
  region: z.string().max(64).default(''),
  backgroundAsset: z.string().max(64).default(''),
  /** Short line under the name on the Depths hub. */
  tagline: z.string().max(120).default(''),
  floors: z.number().int().min(1).max(30),
  /** Relic sets this dungeon's floors drop, for the hub's "what's down there" line. */
  setKeys: z.array(contentKeySchema).default([]),
  /** Items the dungeon is farmed for — essences, emblems. Display only; drops are per-floor. */
  itemKeys: z.array(contentKeySchema).default([]),
  /** The name at the bottom. Display only; the floor's waves decide what is fought. */
  bossEnemyKey: contentKeySchema.optional(),
  /**
   * Weekdays this dungeon opens on, `0` = Sunday. Empty means every day.
   *
   * The rotation is what turns the Essence Springs from a queue into a week: an operator
   * moving Mist off Sunday is an edit and a publish, never a deploy.
   */
  openDays: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  /** Account level the whole dungeon opens at. Floor 1 inherits it; deeper floors chain. */
  unlockLevel: z.number().int().min(1).max(60).default(1),
  /**
   * What makes a Titan a Titan. Required on a `titan` keep and refused on every other kind
   * (publish validation), because the three numbers here are the whole of the mode.
   */
  titan: titanRulesSchema.optional(),
});
export type DungeonDef = z.infer<typeof dungeonDefSchema>;

/**
 * A relic as *content* names it: the kind of piece, not the piece.
 *
 * The set, slot, rank and rarity are the decision an author makes; the main stat and the
 * substats are the game's to roll, exactly as they are for a drop. Shared by everything
 * that hands a relic over without one having been found — the login calendar's welcome
 * week, a tutorial step, and the borrowed team of a cold-open fight.
 */
export const relicGrantSchema = z.object({
  setKey: z.string(),
  slot: z.enum(GEAR_SLOTS),
  rank: z.number().int().min(MIN_RANK).max(MAX_RANK),
  rarity: z.enum(RARITIES),
});
export type RelicGrant = z.infer<typeof relicGrantSchema>;

/**
 * One champion of a stage's borrowed team.
 *
 * Everything the engine needs to build a combatant without a `player_champions` row behind
 * it: who, how grown, and what they are wearing. The relics are rolled from the stage key
 * rather than from the battle's seed, so the cold open is the *same* fight for everybody —
 * a drama beat tuned once is a drama beat that lands every time.
 */
export const presetChampionSchema = z.object({
  championKey: contentKeySchema,
  level: z.number().int().min(1).max(60).default(1),
  rank: z.number().int().min(MIN_RANK).max(MAX_RANK).default(1),
  ascension: z.number().int().min(0).max(6).default(0),
  relics: z.array(relicGrantSchema).max(9).default([]),
});
export type PresetChampion = z.infer<typeof presetChampionSchema>;

export const stageDefSchema = contentMetaSchema.extend({
  mode: z.enum(STAGE_MODES),
  /** Chapter or dungeon this stage belongs to. */
  parentKey: contentKeySchema,
  number: z.number().int().min(1).max(30),
  difficulty: z.enum(DIFFICULTIES).default('normal'),
  energyCost: z.number().int().min(0).max(40),
  waves: z.array(z.array(waveUnitSchema).min(1).max(4)).min(1).max(3),
  rewards: z.object({
    silverMin: z.number().int().min(0).max(1_000_000),
    silverMax: z.number().int().min(0).max(1_000_000),
    playerXp: z.number().int().min(0).max(10_000),
    championXp: z.number().int().min(0).max(50_000),
    dropTableKey: contentKeySchema.optional(),
    /**
     * What a clear can drop, beyond silver and experience.
     *
     * Relics are described as a band rather than a list: the set comes from the chapter,
     * the slot from the stage number, and the rank/rarity from here — the source game's
     * arrangement, and the reason a chapter's farm is a *specific* farm. The generalised
     * drop-table content type arrives with the Depths in P6; until then a campaign stage
     * carries its own band, which is where an operator looks for it anyway.
     */
    drops: z
      .object({
        gearChance: z.number().min(0).max(1).default(0),
        gearRankMin: z.number().int().min(MIN_RANK).max(MAX_RANK).default(1),
        gearRankMax: z.number().int().min(MIN_RANK).max(MAX_RANK).default(2),
        gearRarityWeights: z.partialRecord(z.enum(RARITIES), z.number().min(0)).default({}),
        /** Restricts which slots can drop here. Empty means any. */
        gearSlots: z.array(z.enum(GEAR_SLOTS)).default([]),
        /**
         * Which sets can drop, when the stage decides for itself.
         *
         * A campaign stage leaves this empty and inherits its chapter's single set — the
         * source game's arrangement, and what makes a chapter a farm for one thing. A
         * dungeon floor has no chapter to inherit from and lists its own four, which is
         * what makes the Depths the place you go for a *specific* set.
         */
        gearSetKeys: z.array(contentKeySchema).default([]),
        /** Stackable items, each rolled independently. */
        items: z
          .array(
            z.object({
              itemKey: contentKeySchema,
              chance: z.number().min(0).max(1),
              min: z.number().int().min(1).max(999).default(1),
              max: z.number().int().min(1).max(999).default(1),
            }),
          )
          .default([]),
      })
      .prefault({}),
  }),
  /** 3-star criteria: no deaths, and inside the turn limit. */
  starRules: z.object({
    noDeaths: z.boolean().default(true),
    maxTurns: z.number().int().min(1).max(60).default(12),
  }),
  firstClearRewards: z.record(z.string(), z.number()).default({}),
  unlock: z
    .object({
      previousStageKey: contentKeySchema.optional(),
      playerLevel: z.number().int().min(1).max(60).optional(),
    })
    .default({}),
  /**
   * The team this stage is fought with, when the player does not bring one.
   *
   * Only `tutorial` stages use it, and publish validation refuses it anywhere else. The
   * cold open is a fight with three champions nobody owns yet — that is the whole point of
   * it, and the alternative was minting a roster to confiscate two-thirds of ten minutes
   * later. Borrowing the team from content instead means nothing is created, nothing is
   * taken back, and the opening fight is authored the way every other fight is.
   *
   * Empty on every other stage, where the player's own team is the only team.
   */
  presetTeam: z.array(presetChampionSchema).max(4).default([]),
});
export type StageDef = z.infer<typeof stageDefSchema>;

// ── Items ───────────────────────────────────────────────────────────────────

export const ITEM_CATEGORIES = [
  'sigil',
  'essence',
  'tome',
  'emblem',
  'consumable',
  'material',
] as const;

export const itemDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(48),
  category: z.enum(ITEM_CATEGORIES),
  rarity: z.enum(RARITIES).default('common'),
  description: z.string().max(400).default(''),
  icon: z.string().max(64).default(''),
  /** Category-specific payload, e.g. `{ energy: 50 }` for a refill. */
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type ItemDef = z.infer<typeof itemDefSchema>;

// ── Game configuration ──────────────────────────────────────────────────────

/**
 * A single tunable constant.
 *
 * Everything the design docs mark as tunable lives here rather than in code, so balance
 * changes are an Admin edit and a publish — never a deploy (CLAUDE.md hard rules).
 */
export const gameConfigEntrySchema = z.object({
  key: z.string().min(2).max(64),
  value: z.union([
    z.number(),
    z.string(),
    z.boolean(),
    z.record(z.string(), z.unknown()),
    z.array(z.unknown()),
  ]),
  /** Grouping for the Admin form: `energy`, `combat`, `economy`, … */
  group: z.string().min(1).max(32),
  label: z.string().min(1).max(96),
  help: z.string().max(400).default(''),
});
export type GameConfigEntry = z.infer<typeof gameConfigEntrySchema>;

// ── Authoring shapes ────────────────────────────────────────────────────────

/**
 * What an author may *write*, as opposed to what the game *reads*.
 *
 * Every `…Def` above is the parsed shape: schema defaults are already filled in, so the
 * engine can read `component.hits` without a fallback. The input shapes below are the
 * same schemas before parsing, where anything with a default is optional — which is the
 * whole point of giving it a default.
 *
 * Use these for content on its way *in*: the committed seeds, the Admin Suite's form
 * values, fixtures. Never for content on its way *out* — validation normalises at the
 * persistence boundary, so everything read back from the database or the content bundle
 * is a full `…Def`.
 */
export type FactionDefInput = z.input<typeof factionDefSchema>;
export type StatusDefInput = z.input<typeof statusDefSchema>;
export type SkillDefInput = z.input<typeof skillDefSchema>;
export type AssetDefInput = z.input<typeof assetDefSchema>;
export type ChampionDefInput = z.input<typeof championDefSchema>;
export type EnemyDefInput = z.input<typeof enemyDefSchema>;
export type GearSetDefInput = z.input<typeof gearSetDefSchema>;
export type GearSlotDefInput = z.input<typeof gearSlotDefSchema>;
export type GearStatDefInput = z.input<typeof gearStatDefSchema>;
export type CampaignChapterDefInput = z.input<typeof campaignChapterDefSchema>;
export type DungeonDefInput = z.input<typeof dungeonDefSchema>;
export type StageDefInput = z.input<typeof stageDefSchema>;
export type ItemDefInput = z.input<typeof itemDefSchema>;
export type ShopDefInput = z.input<typeof shopDefSchema>;
export type SummonPoolDefInput = z.input<typeof summonPoolDefSchema>;
export type GameConfigEntryInput = z.input<typeof gameConfigEntrySchema>;

// ── Quests ──────────────────────────────────────────────────────────────────

/**
 * How often a quest resets.
 *
 * The period is what makes a quest *an instance* rather than a permanent goal: today's
 * dailies are keyed by today's game-day, and yesterday's row simply stops matching. That
 * is why no job has to go round at 04:00 deleting things (docs/ARCHITECTURE.md §5.1).
 */
export const QUEST_PERIODS = ['daily', 'weekly', 'monthly'] as const;
export type QuestPeriod = (typeof QUEST_PERIODS)[number];

export const questDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(64),
  description: z.string().max(240).default(''),
  period: z.enum(QUEST_PERIODS),
  /**
   * What has to happen. More than one goal means all of them — an "and", never an "or",
   * because an "or" quest is one a player cannot plan around.
   */
  goals: z.array(goalSchema).min(1).max(4),
  rewards: z.record(z.string(), z.number()).default({}),
  /** Counts towards the period's completion meter and its chest. */
  countsTowardChest: z.boolean().default(true),
  /** Hidden until the account reaches this level, so the list stays honest. */
  unlockLevel: z.number().int().min(1).max(60).default(1),
  icon: z.string().max(64).default(''),
  active: z.boolean().default(true),
});
export type QuestDef = z.infer<typeof questDefSchema>;

/**
 * A step on the Valewarden's Path.
 *
 * Missions are the game teaching itself: "3★ chapter 2", "reach Silver in the Arena",
 * "take a relic to +12" are lessons wearing the clothes of goals. They are permanent and
 * ordered where quests are periodic and interchangeable, which is why they need their own
 * type rather than a `period: 'once'` on a quest — a quest's whole shape is built around an
 * instance that expires, and a mission has no instance and never expires.
 *
 * Grouped into **arcs of eight**. Every mission in the open arc is available at once and
 * completable in any order, and the next arc opens when this one is finished. Strictly
 * sequential would be a wall the day a player cannot do step 43; an entirely open list
 * would not be a path.
 */
export const missionGrantSchema = z.object({
  /**
   * Champions handed over outright. This is how the exclusive Legendary at the end of the
   * chain is delivered — she is unsummonable, so the Path is the only way she exists.
   */
  champions: z.array(z.string()).max(4).default([]),
  /** An honorific the account may then display. Empty for all but a handful of steps. */
  title: z.string().max(48).default(''),
});
export type MissionGrant = z.infer<typeof missionGrantSchema>;

export const missionDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(64),
  description: z.string().max(240).default(''),
  /** Which arc this belongs to, 1-based. Arcs open in order. */
  arc: z.number().int().min(1).max(50),
  /** Where it sits inside its arc, for display order. */
  step: z.number().int().min(1).max(50),
  /** The arc's name, repeated on each of its missions so an arc needs no second type. */
  arcName: z.string().min(1).max(64),
  goals: z.array(goalSchema).min(1).max(4),
  rewards: z.record(z.string(), z.number()).default({}),
  grants: missionGrantSchema.default({ champions: [], title: '' }),
  icon: z.string().max(64).default(''),
  active: z.boolean().default(true),
});
export type MissionDef = z.infer<typeof missionDefSchema>;

/**
 * A timed event: points for playing a certain way, and a milestone ladder to spend them on.
 *
 * Events are the one retention system whose *content* is meant to change often, so the
 * shape is deliberately generic — "Champion Training", "Depths Delve" and "Summon Surge"
 * are three rows in this table, not three features. What makes them different is which
 * reports earn points and how many.
 *
 * There is no cron. An event's window is derived from the clock the same way energy and
 * arena tokens are, so nothing has to activate or expire it and nothing can fall behind
 * (docs/ARCHITECTURE.md §5.1).
 */

/**
 * When an event runs.
 *
 * `window` is a one-off between two instants — what an operator schedules for a launch
 * weekend. `weekly` repeats forever from a weekday, measured in **game-days**, so it turns
 * over at the same reset hour as everything else and needs no timezone arithmetic of its
 * own. Recurring is what makes the EA calendar tend itself: with a handful of players and
 * nobody running live-ops, an event that has to be re-scheduled by hand every fortnight is
 * an event that stops happening.
 */
export const eventScheduleSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('window'),
    /** ISO instants. The event is live between them, inclusive of the start. */
    startsAt: z.string(),
    endsAt: z.string(),
  }),
  z.object({
    kind: z.literal('weekly'),
    /** `0` = Sunday, matching `gameDay().weekday` and the Springs rotation. */
    startWeekday: z.number().int().min(0).max(6),
    /** How many game-days it runs for, starting on that weekday. */
    durationDays: z.number().int().min(1).max(7),
  }),
]);
export type EventSchedule = z.infer<typeof eventScheduleSchema>;

/**
 * One way of earning points.
 *
 * A rule is a goal-DSL match plus a rate: `points` are awarded per unit of what the report
 * carries, so `{type: 'championLevelUp', points: 10}` pays ten a level and
 * `{type: 'summon', filters: {poolKey: 'radiant'}, points: 500}` pays five hundred a pull.
 * Reusing the goal DSL means an event can count anything a quest can, and a new report
 * type becomes available to both at once.
 */
export const eventPointRuleSchema = z.object({
  type: z.enum(GOAL_TYPES),
  filters: z.record(z.string(), z.union([z.string(), z.number()])).default({}),
  /** Points per unit reported. */
  points: z.number().int().min(1).max(100_000),
  /** Shown on the event page so a player knows what is worth doing. */
  label: z.string().max(96).default(''),
});
export type EventPointRule = z.infer<typeof eventPointRuleSchema>;

export const eventMilestoneSchema = z.object({
  points: z.number().int().min(1),
  rewards: z.record(z.string(), z.number()).default({}),
});
export type EventMilestone = z.infer<typeof eventMilestoneSchema>;

export const eventDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(64),
  description: z.string().max(400).default(''),
  bannerAsset: z.string().max(64).default(''),
  schedule: eventScheduleSchema,
  /** At least one, or the event is a banner nobody can score on. */
  pointRules: z.array(eventPointRuleSchema).min(1).max(12),
  /** Ascending by points; publish validation enforces the order. */
  milestones: z.array(eventMilestoneSchema).min(1).max(20),
  unlockLevel: z.number().int().min(1).max(60).default(1),
  active: z.boolean().default(true),
});
export type EventDef = z.infer<typeof eventDefSchema>;

/**
 * A login track: the 30-day calendar, or the 7-day welcome strip beside it.
 *
 * One entity per *track*, not per day, because a track is only ever read whole — the
 * screen draws all thirty tiles at once — and because "re-roll the calendar for August" is
 * then one draft to review and publish rather than thirty.
 *
 * **A day is given on the Nth claim, not on the Nth of the month.** Somebody who misses a
 * Tuesday loses that Tuesday and not their place in the track, which is the difference
 * between a calendar that rewards showing up and one that punishes a holiday. The cycle
 * length is simply `days.length`: a shorter calendar is a shorter cycle, with nothing to
 * configure.
 */
export const loginGrantSchema = z.object({
  /** Champions handed over outright. */
  champions: z.array(z.string()).max(4).default([]),
  /**
   * Champions the player picks *one* of — the calendar's day-30 selector. A choice rather
   * than a roll because thirty days of showing up should end in something the player
   * wanted, not something the game decided they got.
   */
  choices: z.array(z.string()).max(8).default([]),
  /** Relics rolled and handed over. Nine is every slot, which is the sensible ceiling. */
  relics: z.array(relicGrantSchema).max(9).default([]),
});
export type LoginGrant = z.infer<typeof loginGrantSchema>;

export const loginTrackDaySchema = z.object({
  /** 1-based. Publish validation enforces that days run 1…n with no gaps. */
  day: z.number().int().min(1).max(60),
  rewards: z.record(z.string(), z.number()).default({}),
  grants: loginGrantSchema.default({ champions: [], choices: [], relics: [] }),
});
export type LoginTrackDay = z.infer<typeof loginTrackDaySchema>;

export const LOGIN_TRACKS = ['calendar', 'welcome'] as const;
export type LoginTrackKind = (typeof LOGIN_TRACKS)[number];

export const loginTrackDefSchema = contentMetaSchema.extend({
  name: z.string().min(1).max(64),
  description: z.string().max(400).default(''),
  /**
   * `calendar` cycles forever; `welcome` runs once and is then finished. The distinction is
   * the track's whole behaviour, so it is a field rather than a convention about the key.
   */
  track: z.enum(LOGIN_TRACKS),
  days: z.array(loginTrackDaySchema).min(1).max(60),
  active: z.boolean().default(true),
});
export type LoginTrackDef = z.infer<typeof loginTrackDefSchema>;

/**
 * A news post: what the Vale is telling everyone this week.
 *
 * Content rather than a table, and deliberately so. A post carries a *window* — it appears
 * and disappears on the clock exactly the way an event does — which means an operator can
 * write Friday's patch note on Tuesday, publish it once, and have it show up by itself. A
 * table would have needed either a scheduler or an operator awake at the right hour.
 *
 * The body is markdown-lite and is rendered by the client as text, never as HTML: an
 * operator writing a post must not be able to inject markup into every player's browser,
 * and "we trust our own operators" is not an argument that survives a compromised session.
 */
export const newsPostDefSchema = contentMetaSchema.extend({
  title: z.string().min(1).max(120),
  /** Paragraphs separated by blank lines; `**bold**` and `*emphasis*` are honoured. */
  body: z.string().min(1).max(4000),
  /** ISO instants. Both optional: a post with neither is simply always up. */
  startsAt: z.string().max(40).default(''),
  endsAt: z.string().max(40).default(''),
  /** Held at the top of the list, above anything newer. */
  pinned: z.boolean().default(false),
  active: z.boolean().default(true),
});
export type NewsPostDef = z.infer<typeof newsPostDefSchema>;

/**
 * One scripted step of the tutorial (CONTENT_PLAN §7).
 *
 * The interesting decision here is that a step's completion condition is **a goal** — the
 * same `{type, target, filters}` a quest, a mission and an event milestone use. So the
 * tutorial is a fourth subscriber to the one fan-out rather than a parallel mechanism that
 * has to be told about battles and summons separately, and "the step where you equip a
 * relic" is authored exactly like "the daily where you equip a relic".
 *
 * A step with no goal is a *beat*: the Wardenmaster says something and the player presses
 * on. That is most of the script — the tutorial's job is mostly to point at things.
 */
export const tutorialStepDefSchema = contentMetaSchema.extend({
  /** 1-based position. Publish validation enforces that steps run 1…n with no gaps. */
  step: z.number().int().min(1).max(60),
  /** Which screen the overlay expects to be on. The client navigates there if it is not. */
  screen: z.string().min(1).max(32),
  /**
   * What to point at, from the client's element registry — `dock:campaign`,
   * `button:summon-ten`. Empty means the dialogue stands alone, centred, with nothing
   * highlighted, which is right for the opening and closing beats.
   */
  highlight: z.string().max(64).default(''),
  title: z.string().min(1).max(64),
  /** The Wardenmaster's line. Markdown-lite, rendered as text like every other prose. */
  body: z.string().min(1).max(600),
  /**
   * What the player must actually do. Omitted for a beat the player simply acknowledges.
   *
   * Progress is counted from the moment the step **opens**, not from what the account has
   * already done: a step asking for a stage clear wants one now. The exception falls out of
   * the fan-out rather than being special-cased here — `accountLevel` is appended to every
   * report, and it is a threshold goal, so "reach level 5" is satisfied by the next thing
   * the player does rather than by levelling again.
   *
   * Author steps that ask for something cheap and repeatable for that reason. "Upgrade a
   * relic to +1" is safe even for somebody who already has one at +6; "clear 1-1" costs a
   * re-run of a stage they can re-run.
   */
  goal: goalSchema.optional(),
  rewards: z.record(z.string(), z.number()).default({}),
  /** Items handed over *before* the step, so a step can ask for what it just gave. */
  grantsBefore: z.record(z.string(), z.number()).default({}),
  /**
   * Relics handed over the same way, rolled on arrival.
   *
   * The step that says "put a piece on somebody" cannot depend on a drop: chapter 1's
   * trash stages drop a relic about two runs in five, so four new wardens in ten would
   * reach that step with an empty bag and an overlay pointing at nothing. What the
   * Wardenmaster gives, he gives.
   */
  grantsRelics: z.array(relicGrantSchema).max(9).default([]),
  /**
   * Who is speaking, as a published image path — `portraits/wardenmaster_avatar.jpg`.
   *
   * Per step rather than one constant for the script, because the speaker is a property of
   * the line: the Wardenmaster carries the whole of it today, and the moment a second voice
   * is worth having it is a field on the beats that voice says, not a code change. Empty
   * falls back to the lantern mark, which is what shipped before there was art.
   */
  portrait: z.string().max(200).default(''),
  /**
   * The line, spoken, as a published audio path — `audio/tutorial/tutorial_step_3.mp3`.
   *
   * Plays once when the step opens and is cut the moment it closes, so a player who reads
   * faster than the Wardenmaster talks is never trailed by the previous beat. Empty — or a
   * path with no file behind it — is ordinary and expected: not every step has a recording,
   * and one that does not is read rather than heard.
   */
  sound: z.string().max(200).default(''),
  active: z.boolean().default(true),
});
export type TutorialStepDef = z.infer<typeof tutorialStepDefSchema>;

// ── Sound cues ──────────────────────────────────────────────────────────────

/**
 * How a cue is made, when no recording stands behind it.
 *
 * A pixel game's interface sounds are short shaped tones and noise bursts — a click, a
 * coin, a forge clang, a refusal. Describing one takes half a dozen numbers, and doing it
 * that way rather than shipping files means every cue is retunable by an operator, weighs
 * nothing, and needs no licence or attribution. A recording always wins where one exists;
 * this is what plays until then.
 */
export const synthVoiceSchema = z.object({
  /** `tone` is an oscillator, `noise` is filtered white noise — a hit rather than a note. */
  source: z.enum(['tone', 'noise']).default('tone'),
  wave: z.enum(['sine', 'square', 'sawtooth', 'triangle']).default('square'),
  /** Hz at the attack. Ignored by `noise`, which has no pitch to speak of. */
  startHz: z.number().min(20).max(12_000).default(660),
  /**
   * Hz at the end of the sweep. Above `startHz` reads as a question or an opening; below
   * reads as a thud or a refusal. Equal is a flat beep.
   */
  endHz: z.number().min(20).max(12_000).default(660),
  /** Seconds. Everything here is interface-length; a second is already a long cue. */
  attack: z.number().min(0).max(1).default(0.004),
  decay: z.number().min(0.01).max(4).default(0.12),
  /** Peak gain before the bus applies the player's volume. */
  gain: z.number().min(0).max(1).default(0.5),
  /** Low-pass corner. The single knob that separates a bright click from a dull knock. */
  filterHz: z.number().min(80).max(20_000).default(20_000),
  /**
   * Extra voices stacked above the first, as semitone offsets.
   *
   * What makes a level-up an arpeggio rather than a beep. Each entry replays the voice
   * transposed and slightly later, so three numbers buy a chord or a flourish.
   */
  overtones: z.array(z.number().int().min(-24).max(24)).max(4).default([]),
});
export type SynthVoice = z.infer<typeof synthVoiceSchema>;

/**
 * One sound the game can make.
 *
 * Named by key rather than by file so the thing that asks — a button, a battle event, a
 * payout — names *what happened* and never how it is produced. Pointing a cue at a
 * recording later is one field, and nothing that plays it changes.
 */
export const soundCueDefSchema = contentMetaSchema.extend({
  /**
   * Which fader this answers to. `ui` rides the effects slider with the rest; it is a
   * separate bus so a future "interface sounds only" preference has somewhere to go.
   */
  bus: z.enum(['music', 'sfx', 'ui']).default('sfx'),
  /**
   * A published audio file to play instead of synthesising, as a path under the client's
   * own tree — `audio/music/background_music_outside_combat.mp3`.
   *
   * The upgrade path, and the reason the cue is the unit rather than the sound: drop files
   * into `assets/`, run `pnpm assets`, point the cues at what it published, and the synth
   * stops being used for those without a line of code moving. The two music tracks are the
   * first entries to use it.
   *
   * Long enough for a real filename, because the owner's are descriptive rather than terse
   * and a path that will not fit is a track that cannot be pointed at.
   */
  sample: z.string().max(200).default(''),
  /**
   * Play it round again when it ends.
   *
   * Only meaningful for a `sample`: a synthesised cue is a few hundred milliseconds of
   * shaped tone and looping one would be a fault alarm. Music sets it; nothing else does.
   */
  loop: z.boolean().default(false),
  voice: synthVoiceSchema.prefault({}),
  /**
   * Ignore a repeat inside this many milliseconds.
   *
   * A battle can land five hits in one skill and a list can render forty rows; without a
   * floor the same cue stacks into a buzz. Zero lets every trigger through, which is right
   * for anything deliberate.
   */
  throttleMs: z.number().int().min(0).max(2000).default(40),
  active: z.boolean().default(true),
});
export type SoundCueDef = z.infer<typeof soundCueDefSchema>;
