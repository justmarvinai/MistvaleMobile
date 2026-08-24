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

/**
 * The item key reforging is paid in.
 *
 * A constant rather than a config knob: the *price* is content and the *currency* is not,
 * because pointing reforging at a different item mid-life would strand every stack a
 * player had already ground out. The item itself is ordinary content — its name, art and
 * description are all editable in Admin, which is the part an operator actually wants.
 */
export const REFORGE_DUST_ITEM = 'reliquary_dust';

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
  /** What grinding it down pays instead, in Reliquary Dust. */
  dismantleValue: z.number().int(),
  /**
   * How many times this relic has been reforged.
   *
   * On the instance rather than derived, because the price of the next reforge is built
   * on it: each one costs more than the last, which is what stops a relic being fed
   * through a slot machine until every line is perfect.
   */
  reforges: z.number().int(),
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

export const upgradeManyRequestSchema = z.object({
  /** Relics to forge. Equipped ones are allowed — a worn piece is the piece worth forging. */
  ids: z.array(z.string().uuid()).min(1).max(50),
  /** The level to take each of them to. Ones already there are left alone. */
  toLevel: z.number().int().min(1).max(GEAR_MAX_LEVEL),
  actionId: z.string().min(8).max(64),
});
export type UpgradeManyRequest = z.infer<typeof upgradeManyRequestSchema>;

/**
 * What one relic got out of a bulk forge run.
 *
 * A summary rather than the per-attempt log a single forge returns: a bulk run is twenty
 * relics and could be two hundred attempts, and the screen shows a table of outcomes rather
 * than animating each one — which is the difference between "take these to +8" and "watch
 * this one climb".
 */
export const bulkUpgradeEntrySchema = z.object({
  gearId: z.string(),
  fromLevel: z.number().int(),
  toLevel: z.number().int(),
  attempts: z.number().int(),
  silverSpent: z.number().int(),
});
export type BulkUpgradeEntry = z.infer<typeof bulkUpgradeEntrySchema>;

export const bulkUpgradeResultSchema = z.object({
  entries: z.array(bulkUpgradeEntrySchema),
  silverSpent: z.number().int(),
  /** The wallet afterwards. */
  silver: z.number().int(),
  /** Set when the run stopped early, phrased for the player. */
  stoppedBecause: z.string().nullable(),
});
export type BulkUpgradeResult = z.infer<typeof bulkUpgradeResultSchema>;

export const sellGearRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  actionId: z.string().min(8).max(64),
});
export type SellGearRequest = z.infer<typeof sellGearRequestSchema>;

export const lockGearRequestSchema = z.object({ locked: z.boolean() });
export type LockGearRequest = z.infer<typeof lockGearRequestSchema>;

/**
 * Grinding relics down for Reliquary Dust rather than selling them for silver.
 *
 * The same shape as a sell because it is the same decision made differently, and the same
 * refusals: a worn or locked relic stops the whole run rather than being quietly spared.
 */
export const dismantleGearRequestSchema = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  actionId: z.string().min(8).max(64),
});
export type DismantleGearRequest = z.infer<typeof dismantleGearRequestSchema>;

/**
 * Rerolling one substat line into a different stat.
 *
 * The line is chosen, the stat that replaces it is not — that is the gamble, and the
 * reason this is a sink rather than a shop. `substatIndex` addresses the line as the
 * player sees it, so a relic whose lines have moved (they never do; substats only ever
 * gain) could not be reforged by a stale screen without the server noticing.
 */
export const reforgeGearRequestSchema = z.object({
  substatIndex: z
    .number()
    .int()
    .min(0)
    .max(GEAR_MAX_SUBSTATS - 1),
  /** The line the client believed it was reforging, as a guard against a stale screen. */
  expectStat: z.enum(STATS),
  expectPercent: z.boolean(),
  actionId: z.string().min(8).max(64),
});
export type ReforgeGearRequest = z.infer<typeof reforgeGearRequestSchema>;

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

export const dismantleResultSchema = z.object({
  /** Ids that no longer exist. */
  removed: z.array(z.string()),
  dust: z.number().int(),
  /** The player's dust after the run, so the screen never has to add up. */
  dustHeld: z.number().int(),
});
export type DismantleResult = z.infer<typeof dismantleResultSchema>;

/**
 * What one line could become, and what the reroll would cost.
 *
 * Published before anything is spent, for the same reason the Mistgate publishes its
 * rates: a gamble a player cannot see the shape of is not a decision, it is a slot
 * machine. The candidates are the stats the relic could take — every substat form the
 * tables allow, less its own main and less the lines it already carries.
 */
export const reforgeQuoteLineSchema = z.object({
  index: z.number().int(),
  line: gearStatLineSchema,
  /** Every stat this line could turn into, in the tables' own order. */
  candidates: z.array(
    z.object({
      stat: z.enum(STATS),
      percent: z.boolean(),
      /** What this stat rolls between at the relic's rank, per roll. */
      min: z.number(),
      max: z.number(),
    }),
  ),
});
export type ReforgeQuoteLine = z.infer<typeof reforgeQuoteLineSchema>;

export const reforgeQuoteSchema = z.object({
  gearId: z.string(),
  reforges: z.number().int(),
  /** What the next reforge costs, whichever line is chosen. */
  dust: z.number().int(),
  silver: z.number().int(),
  /** What the player holds right now, so the button can say why it is off. */
  dustHeld: z.number().int(),
  silverHeld: z.number().int(),
  lines: z.array(reforgeQuoteLineSchema),
  /** Why it cannot be reforged at all, when it cannot. Null when it can. */
  blockedReason: z.string().nullable(),
});
export type ReforgeQuote = z.infer<typeof reforgeQuoteSchema>;

export const reforgeResultSchema = z.object({
  gear: gearInstanceSchema,
  /** The line as it was, and as it is now — the whole point of the screen. */
  before: gearStatLineSchema,
  after: gearStatLineSchema,
  dustSpent: z.number().int(),
  silverSpent: z.number().int(),
  dustHeld: z.number().int(),
  silver: z.number().int(),
});
export type ReforgeResult = z.infer<typeof reforgeResultSchema>;

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

// ── The vault (Q5) ──────────────────────────────────────────────────────────

/**
 * How full the vault is, and what more room costs.
 *
 * A cap is what makes selling and dismantling matter — without one nothing is ever sold,
 * and the read that lists the vault grows for the life of the account. Only *loose* relics
 * count: a relic on a champion lives there rather than in the vault, so equipping is a way
 * to make room and the pressure lands on hoarding rather than on collecting.
 */
export const vaultStateSchema = z.object({
  /** Loose relics held. */
  used: z.number().int(),
  /** Loose relics allowed: the content base plus what has been bought, under the ceiling. */
  capacity: z.number().int(),
  /** Slots bought so far, over the content base. */
  bought: z.number().int(),
  /** The ceiling purchases cannot pass. */
  max: z.number().int(),
  /** Slots the next purchase adds — 0 once the ceiling is reached. */
  nextSlots: z.number().int(),
  /** Silver the next purchase costs — 0 once there is nothing left to buy. */
  nextCost: z.number().int(),
});
export type VaultState = z.infer<typeof vaultStateSchema>;

export const buyVaultSlotsRequestSchema = z.object({
  actionId: z.string().min(8).max(64),
});
export type BuyVaultSlotsRequest = z.infer<typeof buyVaultSlotsRequestSchema>;

/**
 * Relics a payout could not fit, and the silver paid in their place.
 *
 * Losing the drop outright is the obvious alternative and the wrong one: farming ten runs
 * is a single press, and a player who comes back to nine relics and no explanation has
 * been punished for a cap they never saw themselves hit.
 */
export const vaultOverflowSchema = z.object({
  count: z.number().int(),
  silver: z.number().int(),
});
export type VaultOverflow = z.infer<typeof vaultOverflowSchema>;
