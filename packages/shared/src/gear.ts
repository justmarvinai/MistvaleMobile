import { z } from 'zod';
import { GEAR_SLOTS, MAX_RANK, MIN_RANK, RARITIES, STATS, type Stat } from './enums';

/**
 * Relics as the player owns them.
 *
 * A relic instance is a *rolled* thing — its main stat, its substats and their upgrade
 * history are decided when it drops and never recomputed from content afterwards, so a
 * balance edit to the stat tables cannot silently restat a piece somebody already farmed.
 * What content *does* still own is the value each roll is worth, which is why the numbers
 * below are all server-computed and simply reported here.
 */

/** The maximum upgrade level; substats roll at every fourth level up to it. */
export const GEAR_MAX_LEVEL = 16;
export const GEAR_SUBSTAT_ROLL_LEVELS: readonly number[] = [4, 8, 12, 16];
export const GEAR_MAX_SUBSTATS = 4;

/** One stat line on a relic. `percent` distinguishes ATK +200 from ATK +15%. */
export const gearStatLineSchema = z.object({
  stat: z.enum(STATS),
  percent: z.boolean(),
  value: z.number(),
  /** How many times this substat has been rolled into. Absent on a main stat. */
  rolls: z.number().int().min(1).optional(),
});
export type GearStatLine = z.infer<typeof gearStatLineSchema>;

export const gearInstanceSchema = z.object({
  id: z.string(),
  setKey: z.string(),
  slot: z.enum(GEAR_SLOTS),
  rank: z.number().int().min(MIN_RANK).max(MAX_RANK),
  rarity: z.enum(RARITIES),
  level: z.number().int().min(0).max(GEAR_MAX_LEVEL),
  main: gearStatLineSchema,
  substats: z.array(gearStatLineSchema),
  equippedChampionId: z.string().nullable(),
  locked: z.boolean(),
  /** Where it came from, for the inventory's "new" grouping and for support. */
  source: z.string(),
  acquiredAt: z.string(),
  /** What selling it pays right now, and what the next upgrade attempt would cost. */
  sellValue: z.number().int(),
  upgradeCost: z.number().int(),
  upgradeChance: z.number(),
});
export type GearInstance = z.infer<typeof gearInstanceSchema>;

// ── Requests ────────────────────────────────────────────────────────────────

export const equipGearRequestSchema = z.object({
  championId: z.string().uuid(),
});
export type EquipGearRequest = z.infer<typeof equipGearRequestSchema>;

export const upgradeGearRequestSchema = z.object({
  /**
   * How many attempts to run in one call.
   *
   * Bulk-continue stops early on success, on running out of silver, or at the cap — the
   * response reports every attempt so the client can animate them one at a time without
   * ever deciding an outcome itself.
   */
  times: z.number().int().min(1).max(20).default(1),
  actionId: z.string().min(8).max(64),
});
export type UpgradeGearRequest = z.infer<typeof upgradeGearRequestSchema>;

export const sellGearRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  actionId: z.string().min(8).max(64),
});
export type SellGearRequest = z.infer<typeof sellGearRequestSchema>;

export const lockGearRequestSchema = z.object({ locked: z.boolean() });
export type LockGearRequest = z.infer<typeof lockGearRequestSchema>;

// ── Responses ───────────────────────────────────────────────────────────────

/** One upgrade attempt, in the order they happened. */
export const gearUpgradeAttemptSchema = z.object({
  fromLevel: z.number().int(),
  toLevel: z.number().int(),
  success: z.boolean(),
  cost: z.number().int(),
  chance: z.number(),
  /** The substat this level rolled into, when it was a roll level. */
  rolled: gearStatLineSchema.nullable(),
});
export type GearUpgradeAttempt = z.infer<typeof gearUpgradeAttemptSchema>;

export const gearUpgradeResultSchema = z.object({
  gear: gearInstanceSchema,
  attempts: z.array(gearUpgradeAttemptSchema),
  silverSpent: z.number().int(),
  silver: z.number().int(),
});
export type GearUpgradeResult = z.infer<typeof gearUpgradeResultSchema>;

/** Stats grouped by where they come from, so the detail screen can show the sum honestly. */
export const statBlockSchema = z.object({
  hp: z.number(),
  atk: z.number(),
  def: z.number(),
  spd: z.number(),
  critRate: z.number(),
  critDmg: z.number(),
  res: z.number(),
  acc: z.number(),
});
export type StatBlock = Record<Stat, number>;

export const activeSetBonusSchema = z.object({
  setKey: z.string(),
  name: z.string(),
  /** How many pieces of the set are equipped. */
  equipped: z.number().int(),
  /** How many complete copies of the bonus are active. */
  copies: z.number().int(),
  description: z.string(),
});
export type ActiveSetBonus = z.infer<typeof activeSetBonusSchema>;

/**
 * A champion's assembled stats.
 *
 * `base` is the definition scaled to this copy's tier; `gear` is everything the relics
 * add, percentages already resolved against `base`. The client renders the split — it
 * never performs the addition itself (CLAUDE.md — no game math client-side).
 */
export const championStatsSchema = z.object({
  base: statBlockSchema,
  gear: statBlockSchema,
  /** What learned masteries add. Separate from relics so the screen can show both. */
  mastery: statBlockSchema,
  total: statBlockSchema,
  setBonuses: z.array(activeSetBonusSchema),
  power: z.number().int(),
});
export type ChampionStats = z.infer<typeof championStatsSchema>;

/** What equipping a relic would change, computed server-side so the numbers are real. */
export const gearPreviewSchema = z.object({
  championId: z.string(),
  before: championStatsSchema,
  after: championStatsSchema,
  /** The relic currently in that slot, which equipping would displace. */
  replaces: gearInstanceSchema.nullable(),
});
export type GearPreview = z.infer<typeof gearPreviewSchema>;
