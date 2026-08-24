import type { Rng } from '@mistvale/engine';
import {
  GEAR_MAX_LEVEL,
  GEAR_MAX_SUBSTATS,
  GEAR_SUBSTAT_ROLL_LEVELS,
  RARITIES,
  STATS,
  type ActiveSetBonus,
  type GearSetDef,
  type GearSlot,
  type GearSlotDef,
  type GearStatDef,
  type GearStatLine,
  type Rarity,
  type Stat,
  type StatBlock,
} from '@mistvale/shared';

/**
 * Relic arithmetic.
 *
 * Everything a relic is worth is computed here: what a main stat reads at a given rank
 * and upgrade level, what a substat roll adds, what a set contributes, and what the pile
 * of them does to a champion. The client renders these numbers and never derives one.
 *
 * The values themselves are content (`gear_stat_defs`), so this module is formula-only —
 * the split CLAUDE.md asks for. Retuning the economy is a publish; changing how the
 * pieces combine is a deploy, and should be.
 */

/** A relic as the maths needs to see it, independent of how it is stored. */
export interface GearPiece {
  setKey: string;
  slot: GearSlot;
  rank: number;
  rarity: Rarity;
  level: number;
  main: GearStatLine;
  substats: readonly GearStatLine[];
}

/** The content tables the formulas read, indexed for lookup. */
export interface GearTables {
  stats: ReadonlyMap<string, GearStatDef>;
  slots: ReadonlyMap<string, GearSlotDef>;
  sets: ReadonlyMap<string, GearSetDef>;
  /** Stat defs grouped by the `{stat, percent}` pair they describe. */
  byStat: ReadonlyMap<string, GearStatDef>;
}

/** Balance knobs, all from `game_config`. */
export interface GearEconomyConfig {
  /** Success probability per target level, keyed by the level being attempted (1–16). */
  upgradeSuccess: Readonly<Record<number, number>>;
  /** Silver per attempt at ★6, by target level. Lower ranks scale by `costByRank`. */
  upgradeCost: readonly number[];
  costByRank: readonly number[];
  /** Sell value base per rank, before rarity and level. */
  sellBase: readonly number[];
  sellRarityMultiplier: Readonly<Record<Rarity, number>>;
  sellPerLevel: number;
  /** How many substats a relic starts with, by rarity. */
  substatsByRarity: Readonly<Record<Rarity, number>>;
  /** Weights used when a drop does not name a rarity distribution. */
  defaultRarityWeights: Readonly<Record<Rarity, number>>;
  /** Stat weights for the informational power score. */
  powerWeights: Readonly<Record<Stat, number>>;

  // ── The vault (Q5) ────────────────────────────────────────────────────────
  /** Loose relics a player may hold before buying room. Equipped relics are not counted. */
  vaultBaseCapacity: number;
  /** The ceiling purchases cannot pass — and the hard bound on how large the read can get. */
  vaultMaxCapacity: number;
  /** Slots one purchase adds. */
  vaultSlotsPerUpgrade: number;
  /** Silver for the first purchase. */
  vaultUpgradeCost: number;
  /** Multiplied in once per purchase already made, so each slab costs more than the last. */
  vaultUpgradeCostGrowth: number;

  // ── Reforging (C10) ───────────────────────────────────────────────────────
  /**
   * Reliquary Dust a dismantle pays, per rank, before rarity and level.
   *
   * Deliberately a *separate* curve from `sellBase` rather than a fraction of it: silver
   * and dust are wanted at different points in an account's life, and tying one to the
   * other means an operator retuning the silver economy silently retunes reforging too.
   */
  dismantleBase: readonly number[];
  dismantleRarityMultiplier: Readonly<Record<Rarity, number>>;
  dismantlePerLevel: number;
  /** Dust for the first reforge of a relic, at ★6. Lower ranks scale by `costByRank`. */
  reforgeDust: number;
  /** Silver alongside the dust, so the sink drains both. Scales the same way. */
  reforgeSilver: number;
  /** Multiplied in once per reforge already done to *this relic*. */
  reforgeCostGrowth: number;
  /**
   * How many times one relic may be reforged, ever.
   *
   * A ceiling rather than pure price escalation, because escalation alone is only a
   * barrier to somebody with less silver than patience. Zero means no limit.
   */
  reforgeMaxPerRelic: number;
}

export const DEFAULT_GEAR_ECONOMY: GearEconomyConfig = Object.freeze({
  upgradeSuccess: Object.freeze({
    1: 1,
    2: 1,
    3: 1,
    4: 1,
    5: 0.85,
    6: 0.78,
    7: 0.71,
    8: 0.64,
    9: 0.55,
    10: 0.48,
    11: 0.42,
    12: 0.36,
    13: 0.3,
    14: 0.26,
    15: 0.23,
    16: 0.2,
  }),
  upgradeCost: Object.freeze([
    3_000, 3_000, 3_000, 3_000, 6_000, 6_000, 6_000, 6_000, 12_000, 12_000, 12_000, 12_000, 28_000,
    28_000, 28_000, 28_000,
  ]),
  costByRank: Object.freeze([0.1, 0.18, 0.3, 0.45, 0.65, 1]),
  sellBase: Object.freeze([120, 300, 800, 1_800, 3_400, 8_000]),
  sellRarityMultiplier: Object.freeze({
    common: 1,
    uncommon: 1.2,
    rare: 1.5,
    epic: 2,
    legendary: 2.8,
  }),
  sellPerLevel: 0.35,
  substatsByRarity: Object.freeze({
    common: 0,
    uncommon: 1,
    rare: 2,
    epic: 3,
    legendary: 4,
  }),
  defaultRarityWeights: Object.freeze({
    common: 45,
    uncommon: 30,
    rare: 18,
    epic: 6,
    legendary: 1,
  }),
  powerWeights: Object.freeze({
    hp: 0.06,
    atk: 1,
    def: 0.9,
    spd: 12,
    critRate: 8,
    critDmg: 4,
    res: 3,
    acc: 3,
  }),
  vaultBaseCapacity: 250,
  vaultMaxCapacity: 1_000,
  vaultSlotsPerUpgrade: 50,
  vaultUpgradeCost: 25_000,
  vaultUpgradeCostGrowth: 1.3,
  // The exchange rate the whole feature rests on, measured rather than guessed
  // (`stats.test.ts` pins it): a ★6 Legendary at +16 grinds down to about 1,040 dust, and
  // the first reroll of a ★6 relic costs 1,000 — so one keeper's worth of overflow buys
  // one reroll of the keeper. The junk a farmed evening actually produces is ★5–6 at +0,
  // worth 50–110 each, so a session's overflow is one or two rerolls.
  dismantleBase: Object.freeze([2, 5, 12, 22, 38, 70]),
  dismantleRarityMultiplier: Object.freeze({
    common: 1,
    uncommon: 1.15,
    rare: 1.35,
    epic: 1.6,
    legendary: 2,
  }),
  dismantlePerLevel: 0.4,
  reforgeDust: 1_000,
  // Roughly one ★6 Legendary's sell value, so the two halves of the price are comparable —
  // but dust is meant to be the binding one, since dust is the half that can only come
  // from letting relics go.
  reforgeSilver: 100_000,
  reforgeCostGrowth: 1.6,
  reforgeMaxPerRelic: 6,
});

const CONFIG_KEYS = {
  upgradeSuccess: 'economy.gearUpgradeSuccess',
  upgradeCost: 'economy.gearUpgradeCost',
  costByRank: 'economy.gearUpgradeCostByRank',
  sellBase: 'economy.gearSellBase',
  sellRarityMultiplier: 'economy.gearSellRarityMultiplier',
  sellPerLevel: 'economy.gearSellPerLevel',
  substatsByRarity: 'economy.gearSubstatsByRarity',
  defaultRarityWeights: 'economy.gearDropRarityWeights',
  powerWeights: 'economy.powerWeights',
  vaultBaseCapacity: 'economy.vaultBaseCapacity',
  vaultMaxCapacity: 'economy.vaultMaxCapacity',
  vaultSlotsPerUpgrade: 'economy.vaultSlotsPerUpgrade',
  vaultUpgradeCost: 'economy.vaultUpgradeCost',
  vaultUpgradeCostGrowth: 'economy.vaultUpgradeCostGrowth',
  dismantleBase: 'economy.gearDismantleBase',
  dismantleRarityMultiplier: 'economy.gearDismantleRarityMultiplier',
  dismantlePerLevel: 'economy.gearDismantlePerLevel',
  reforgeDust: 'economy.gearReforgeDust',
  reforgeSilver: 'economy.gearReforgeSilver',
  reforgeCostGrowth: 'economy.gearReforgeCostGrowth',
  reforgeMaxPerRelic: 'economy.gearReforgeMaxPerRelic',
} as const;

/**
 * Reads the gear economy out of a published config map.
 *
 * A missing or malformed key falls back to its default rather than throwing — the same
 * posture the engine's config takes, and for the same reason: one deleted row should not
 * take the game down.
 */
export function gearEconomyFrom(config: Readonly<Record<string, unknown>>): GearEconomyConfig {
  const numbers = (key: string, fallback: readonly number[]): readonly number[] => {
    const value = config[key];
    return Array.isArray(value) && value.length > 0 && value.every((n) => typeof n === 'number')
      ? Object.freeze([...(value as number[])])
      : fallback;
  };
  const record = <T extends string>(
    key: string,
    fallback: Readonly<Record<T, number>>,
  ): Readonly<Record<T, number>> => {
    const value = config[key];
    if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
    const merged = { ...fallback } as Record<string, number>;
    for (const [entryKey, entryValue] of Object.entries(value as Record<string, unknown>)) {
      if (typeof entryValue === 'number' && Number.isFinite(entryValue)) {
        merged[entryKey] = entryValue;
      }
    }
    return Object.freeze(merged) as Readonly<Record<T, number>>;
  };
  const number = (key: string, fallback: number): number => {
    const value = config[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };

  return Object.freeze({
    upgradeSuccess: record(CONFIG_KEYS.upgradeSuccess, DEFAULT_GEAR_ECONOMY.upgradeSuccess),
    upgradeCost: numbers(CONFIG_KEYS.upgradeCost, DEFAULT_GEAR_ECONOMY.upgradeCost),
    costByRank: numbers(CONFIG_KEYS.costByRank, DEFAULT_GEAR_ECONOMY.costByRank),
    sellBase: numbers(CONFIG_KEYS.sellBase, DEFAULT_GEAR_ECONOMY.sellBase),
    sellRarityMultiplier: record(
      CONFIG_KEYS.sellRarityMultiplier,
      DEFAULT_GEAR_ECONOMY.sellRarityMultiplier,
    ),
    sellPerLevel: number(CONFIG_KEYS.sellPerLevel, DEFAULT_GEAR_ECONOMY.sellPerLevel),
    substatsByRarity: record(CONFIG_KEYS.substatsByRarity, DEFAULT_GEAR_ECONOMY.substatsByRarity),
    defaultRarityWeights: record(
      CONFIG_KEYS.defaultRarityWeights,
      DEFAULT_GEAR_ECONOMY.defaultRarityWeights,
    ),
    powerWeights: record(CONFIG_KEYS.powerWeights, DEFAULT_GEAR_ECONOMY.powerWeights),
    vaultBaseCapacity: number(
      CONFIG_KEYS.vaultBaseCapacity,
      DEFAULT_GEAR_ECONOMY.vaultBaseCapacity,
    ),
    vaultMaxCapacity: number(CONFIG_KEYS.vaultMaxCapacity, DEFAULT_GEAR_ECONOMY.vaultMaxCapacity),
    vaultSlotsPerUpgrade: number(
      CONFIG_KEYS.vaultSlotsPerUpgrade,
      DEFAULT_GEAR_ECONOMY.vaultSlotsPerUpgrade,
    ),
    vaultUpgradeCost: number(CONFIG_KEYS.vaultUpgradeCost, DEFAULT_GEAR_ECONOMY.vaultUpgradeCost),
    vaultUpgradeCostGrowth: number(
      CONFIG_KEYS.vaultUpgradeCostGrowth,
      DEFAULT_GEAR_ECONOMY.vaultUpgradeCostGrowth,
    ),
    dismantleBase: numbers(CONFIG_KEYS.dismantleBase, DEFAULT_GEAR_ECONOMY.dismantleBase),
    dismantleRarityMultiplier: record(
      CONFIG_KEYS.dismantleRarityMultiplier,
      DEFAULT_GEAR_ECONOMY.dismantleRarityMultiplier,
    ),
    dismantlePerLevel: number(
      CONFIG_KEYS.dismantlePerLevel,
      DEFAULT_GEAR_ECONOMY.dismantlePerLevel,
    ),
    reforgeDust: number(CONFIG_KEYS.reforgeDust, DEFAULT_GEAR_ECONOMY.reforgeDust),
    reforgeSilver: number(CONFIG_KEYS.reforgeSilver, DEFAULT_GEAR_ECONOMY.reforgeSilver),
    reforgeCostGrowth: number(
      CONFIG_KEYS.reforgeCostGrowth,
      DEFAULT_GEAR_ECONOMY.reforgeCostGrowth,
    ),
    reforgeMaxPerRelic: number(
      CONFIG_KEYS.reforgeMaxPerRelic,
      DEFAULT_GEAR_ECONOMY.reforgeMaxPerRelic,
    ),
  });
}

// ── The vault (Q5) ──────────────────────────────────────────────────────────

/**
 * How many loose relics this account may hold.
 *
 * `bought` is what the player has paid for; the base and the ceiling are content, so an
 * operator raising the base in Admin raises everybody's vault at once without touching a
 * single player row. Clamped both ways: a ceiling lowered below what somebody already
 * bought must not hand them a negative vault, and a base above the ceiling is an operator
 * typo rather than a licence.
 */
export function vaultCapacity(economy: GearEconomyConfig, bought: number): number {
  const base = Math.max(0, Math.floor(economy.vaultBaseCapacity));
  const ceiling = Math.max(base, Math.floor(economy.vaultMaxCapacity));
  return Math.min(base + Math.max(0, Math.floor(bought)), ceiling);
}

/** Slots the next purchase would add, or 0 when the vault is already at the ceiling. */
export function vaultUpgradeSlots(economy: GearEconomyConfig, bought: number): number {
  const capacity = vaultCapacity(economy, bought);
  const ceiling = Math.max(
    Math.floor(economy.vaultBaseCapacity),
    Math.floor(economy.vaultMaxCapacity),
  );
  const room = ceiling - capacity;
  if (room <= 0) return 0;
  // A last purchase that would overshoot the ceiling buys the remainder rather than being
  // refused: "24 slots for the same price" is a better last step than a button that never
  // becomes pressable.
  return Math.min(Math.max(1, Math.floor(economy.vaultSlotsPerUpgrade)), room);
}

/**
 * What the next purchase costs, in silver.
 *
 * Geometric in the number of purchases *made*, not in the slots held, so the curve does
 * not change shape when an operator retunes how many slots a purchase adds. Rounded to a
 * hundred so the number in the Bazaar reads like a price rather than a calculation.
 */
export function vaultUpgradeCost(economy: GearEconomyConfig, bought: number): number {
  const perUpgrade = Math.max(1, Math.floor(economy.vaultSlotsPerUpgrade));
  const purchases = Math.max(0, Math.floor(bought / perUpgrade));
  const growth = economy.vaultUpgradeCostGrowth > 0 ? economy.vaultUpgradeCostGrowth : 1;
  const raw = Math.max(0, economy.vaultUpgradeCost) * growth ** purchases;
  return Math.max(1, Math.round(raw / 100) * 100);
}

/** Indexes the published gear content for lookup. */
export function gearTablesFrom(content: {
  gearStats: readonly GearStatDef[];
  gearSlots: readonly GearSlotDef[];
  gearSets: readonly GearSetDef[];
}): GearTables {
  return {
    stats: new Map(content.gearStats.map((def) => [def.key, def])),
    slots: new Map(content.gearSlots.map((def) => [def.key, def])),
    sets: new Map(content.gearSets.map((def) => [def.key, def])),
    byStat: new Map(content.gearStats.map((def) => [statFormKey(def.stat, def.percent), def])),
  };
}

/** The lookup key for a `{stat, percent}` pair — `atk_pct`, `spd_flat`. */
export function statFormKey(stat: Stat, percent: boolean): string {
  return `${stat}:${percent ? 'pct' : 'flat'}`;
}

function rankIndex(rank: number): number {
  return Math.min(Math.max(Math.trunc(rank), 1), 6) - 1;
}

// ── Values ──────────────────────────────────────────────────────────────────

/**
 * What a main stat reads at a given rank and upgrade level.
 *
 * Content gives the value at +0 and at +16 and this interpolates, so a relic hits its
 * published ceiling exactly instead of landing near it after sixteen roundings.
 */
export function mainStatValue(def: GearStatDef, rank: number, level: number): number {
  const index = rankIndex(rank);
  const base = def.mainBase[index] ?? 0;
  const max = def.mainMax[index] ?? base;
  const progress = Math.min(Math.max(level, 0), GEAR_MAX_LEVEL) / GEAR_MAX_LEVEL;
  return roundStat(base + (max - base) * progress, def.percent);
}

/** One substat roll. */
export function rollSubstatValue(rng: Rng, def: GearStatDef, rank: number): number {
  const index = rankIndex(rank);
  const min = def.subMin[index] ?? 0;
  const max = def.subMax[index] ?? min;
  if (max <= min) return roundStat(min, def.percent);
  // Percentage stats are worth keeping a decimal on; flat stats are whole numbers.
  const raw = min + rng.next() * (max - min);
  return roundStat(raw, def.percent);
}

/** Percentages keep one decimal; flat values are integers. */
function roundStat(value: number, percent: boolean): number {
  return percent ? Math.round(value * 10) / 10 : Math.round(value);
}

/** What one upgrade attempt costs, in silver. */
export function upgradeCost(economy: GearEconomyConfig, rank: number, targetLevel: number): number {
  const level = Math.min(Math.max(targetLevel, 1), GEAR_MAX_LEVEL);
  const base = economy.upgradeCost[level - 1] ?? economy.upgradeCost.at(-1) ?? 0;
  const multiplier = economy.costByRank[rankIndex(rank)] ?? 1;
  return Math.max(1, Math.round(base * multiplier));
}

/** The chance one attempt at `targetLevel` succeeds. */
export function upgradeChance(economy: GearEconomyConfig, targetLevel: number): number {
  const value = economy.upgradeSuccess[Math.min(Math.max(targetLevel, 1), GEAR_MAX_LEVEL)];
  return typeof value === 'number' ? Math.min(Math.max(value, 0), 1) : 0;
}

/** What selling a relic pays (ECONOMY_BALANCE §4). */
export function sellValue(economy: GearEconomyConfig, piece: GearPiece): number {
  const base = economy.sellBase[rankIndex(piece.rank)] ?? 0;
  const rarity = economy.sellRarityMultiplier[piece.rarity] ?? 1;
  return Math.max(1, Math.round(base * rarity * (1 + economy.sellPerLevel * piece.level)));
}

// ── Reforging (C10) ─────────────────────────────────────────────────────────

/** What grinding a relic down pays, in Reliquary Dust. */
export function dismantleValue(economy: GearEconomyConfig, piece: GearPiece): number {
  const base = economy.dismantleBase[rankIndex(piece.rank)] ?? 0;
  const rarity = economy.dismantleRarityMultiplier[piece.rarity] ?? 1;
  return Math.max(1, Math.round(base * rarity * (1 + economy.dismantlePerLevel * piece.level)));
}

export interface ReforgePrice {
  dust: number;
  silver: number;
}

/**
 * What the next reforge of this relic costs.
 *
 * Two things move it: the relic's **rank**, so a ★2 practice piece is cheap to play with
 * and a ★6 build piece is not, and **how many times this relic has already been reforged**,
 * which is what stops one relic being fed through until every line is perfect. The growth
 * compounds per relic rather than per account, so a player is never priced out of fixing a
 * new drop by the work they did on an old one.
 */
export function reforgePrice(
  economy: GearEconomyConfig,
  rank: number,
  reforges: number,
): ReforgePrice {
  const rankMultiplier = economy.costByRank[rankIndex(rank)] ?? 1;
  const done = Math.max(0, Math.floor(reforges));
  const growth = Math.pow(Math.max(1, economy.reforgeCostGrowth), done);
  return {
    dust: Math.max(1, Math.round(economy.reforgeDust * rankMultiplier * growth)),
    silver: Math.max(0, Math.round(economy.reforgeSilver * rankMultiplier * growth)),
  };
}

/**
 * Every stat one line could turn into.
 *
 * The same exclusion rule a fresh roll and an upgrade already use — a relic never carries
 * one stat *form* twice — and **the line's own form is excluded as well**, so a reforge
 * always comes back as a different line. That is a deliberate choice against the source
 * genre, where a reroll can hand back exactly what you started with: this feature exists
 * to answer "perfect rolls, wrong stat", and paying its price to be told *no* is the one
 * outcome that teaches a player never to press it again.
 *
 * The exclusion is by form rather than by stat, which is the game's own rule everywhere
 * else — a weapon may carry flat ATK and ATK% at once. So flat DEF can reforge into DEF%,
 * and that is a real change: at Mistvale's numbers the two are worth wildly different
 * amounts on the same champion. What cannot happen is flat DEF coming back as flat DEF.
 *
 * Published rather than hidden, so the panel can say exactly what a reroll may turn into
 * before anything is spent — the Mistgate's transparency rule applied to relics.
 */
export function reforgeCandidates(
  tables: GearTables,
  piece: GearPiece,
  index: number,
): GearStatDef[] {
  const line = piece.substats[index];
  if (!line) return [];
  const taken = new Set<string>([
    statFormKey(piece.main.stat, piece.main.percent),
    ...piece.substats.map((other) => statFormKey(other.stat, other.percent)),
  ]);
  return [...tables.stats.values()].filter(
    (def) => def.canBeSub && !taken.has(statFormKey(def.stat, def.percent)),
  );
}

/** What one stat rolls between at a rank, per roll — the numbers a quote publishes. */
export function substatRange(def: GearStatDef, rank: number): { min: number; max: number } {
  const at = rankIndex(rank);
  const min = def.subMin[at] ?? 0;
  const max = def.subMax[at] ?? min;
  return { min: roundStat(min, def.percent), max: roundStat(Math.max(min, max), def.percent) };
}

/**
 * Rerolls one substat into a different stat, keeping the work that went into it.
 *
 * The **rolls are preserved and re-rolled**, not carried across: a line that had been
 * deepened four times comes back as four fresh rolls of the new stat. That is the honest
 * middle between the two bad options — carrying the old *value* onto a new stat would make
 * a +4 ACC line into a +4-sized SPD line, which is nonsense across stats of different
 * scales, and dropping to a single roll would make reforging a punishment for having
 * invested. What is gambled is the stat, and how well four rolls land.
 *
 * Returns `null` when there is nothing it could become, which a caller must refuse rather
 * than charge for.
 */
export function applyReforge(
  rng: Rng,
  tables: GearTables,
  piece: GearPiece,
  index: number,
): { substats: GearStatLine[]; before: GearStatLine; after: GearStatLine } | null {
  const before = piece.substats[index];
  if (!before) return null;
  const pool = reforgeCandidates(tables, piece, index);
  if (pool.length === 0) return null;

  const def = pool[rng.int(0, pool.length - 1)]!;
  const rolls = Math.max(1, Math.floor(before.rolls ?? 1));
  let value = 0;
  for (let roll = 0; roll < rolls; roll += 1) {
    value += rollSubstatValue(rng, def, piece.rank);
  }
  const after: GearStatLine = {
    stat: def.stat,
    percent: def.percent,
    value: roundStat(value, def.percent),
    rolls,
  };
  const substats = piece.substats.map((entry, at) => (at === index ? after : { ...entry }));
  return { substats, before: { ...before }, after };
}

// ── Rolling a new relic ─────────────────────────────────────────────────────

export interface RollGearParams {
  setKey: string;
  slot: GearSlot;
  rank: number;
  rarity: Rarity;
}

/**
 * Rolls a fresh relic: a main stat the slot allows, then substats that avoid it.
 *
 * Substats are drawn without replacement — a relic never carries the same stat twice, in
 * either form, which is what stops a piece from being four rolls of the same number.
 */
export function rollGear(
  rng: Rng,
  tables: GearTables,
  economy: GearEconomyConfig,
  params: RollGearParams,
): Pick<GearPiece, 'main' | 'substats'> {
  const slot = tables.slots.get(params.slot);
  const candidates = mainCandidates(tables, slot);
  const mainDef = candidates.length > 0 ? rng.pick(candidates) : undefined;
  const main: GearStatLine = mainDef
    ? {
        stat: mainDef.stat,
        percent: mainDef.percent,
        value: mainStatValue(mainDef, params.rank, 0),
      }
    : { stat: 'atk', percent: false, value: 1 };

  const wanted = economy.substatsByRarity[params.rarity] ?? 0;
  const mainForm = statFormKey(main.stat, main.percent);
  // Drawn without replacement by exact form, so a relic never carries the same line
  // twice — but a flat-ATK weapon may still roll ATK%, as the source game allows.
  const remaining = [...tables.stats.values()].filter(
    (def) => def.canBeSub && statFormKey(def.stat, def.percent) !== mainForm,
  );
  const substats: GearStatLine[] = [];
  for (let index = 0; index < wanted && remaining.length > 0; index += 1) {
    const pickIndex = rng.int(0, remaining.length - 1);
    const def = remaining.splice(pickIndex, 1)[0]!;
    substats.push({
      stat: def.stat,
      percent: def.percent,
      value: rollSubstatValue(rng, def, params.rank),
      rolls: 1,
    });
  }

  return { main, substats };
}

/**
 * Which stat definitions may roll as a slot's main.
 *
 * A slot names the *stats* it allows; which form of each it takes is the slot's
 * `allowsPercentMain` flag. So boots offer ATK% rather than both ATK% and flat ATK, and
 * an amulet still offers C.DMG even though it takes flat mains — because C.DMG has no
 * flat form. Picking one form per stat is what stops a percentage slot from rolling the
 * near-worthless flat variant (docs/ECONOMY_BALANCE.md §4).
 */
function mainCandidates(tables: GearTables, slot: GearSlotDef | undefined): GearStatDef[] {
  const rollable = [...tables.stats.values()].filter((def) => def.canBeMain);
  if (!slot) return rollable;

  const chosen: GearStatDef[] = [];
  for (const stat of slot.allowedMainStats) {
    const forms = rollable.filter((def) => def.stat === stat);
    if (forms.length === 0) continue;
    const preferred = slot.allowsPercentMain
      ? (forms.find((def) => def.percent) ?? forms[0]!)
      : (forms.find((def) => !def.percent) ?? forms[0]!);
    chosen.push(preferred);
  }
  return chosen;
}

/**
 * Applies one successful upgrade level.
 *
 * At a roll level the relic gains a new substat if it has room, and otherwise deepens one
 * it already has — the source game's rule, and the reason a legendary's fourth substat is
 * worth so much more than a rare's.
 */
export function applyUpgrade(
  rng: Rng,
  tables: GearTables,
  piece: GearPiece,
): { main: GearStatLine; substats: GearStatLine[]; rolled: GearStatLine | null } {
  const level = piece.level + 1;
  const mainDef = tables.byStat.get(statFormKey(piece.main.stat, piece.main.percent));
  const main: GearStatLine = {
    ...piece.main,
    value: mainDef ? mainStatValue(mainDef, piece.rank, level) : piece.main.value,
  };
  const substats = piece.substats.map((line) => ({ ...line }));

  if (!GEAR_SUBSTAT_ROLL_LEVELS.includes(level)) return { main, substats, rolled: null };

  if (substats.length < GEAR_MAX_SUBSTATS) {
    const taken = new Set<string>([
      statFormKey(main.stat, main.percent),
      ...substats.map((line) => statFormKey(line.stat, line.percent)),
    ]);
    const pool = [...tables.stats.values()].filter(
      (def) => def.canBeSub && !taken.has(statFormKey(def.stat, def.percent)),
    );
    if (pool.length === 0) return { main, substats, rolled: null };
    const def = pool[rng.int(0, pool.length - 1)]!;
    const added: GearStatLine = {
      stat: def.stat,
      percent: def.percent,
      value: rollSubstatValue(rng, def, piece.rank),
      rolls: 1,
    };
    substats.push(added);
    return { main, substats, rolled: added };
  }

  const index = rng.int(0, substats.length - 1);
  const line = substats[index]!;
  const def = tables.byStat.get(statFormKey(line.stat, line.percent));
  if (!def) return { main, substats, rolled: null };
  const added = rollSubstatValue(rng, def, piece.rank);
  line.value = roundStat(line.value + added, line.percent);
  line.rolls = (line.rolls ?? 1) + 1;
  return { main, substats, rolled: { ...line } };
}

// ── Assembling a champion ───────────────────────────────────────────────────

export function emptyStatBlock(): StatBlock {
  return { hp: 0, atk: 0, def: 0, spd: 0, critRate: 0, critDmg: 0, res: 0, acc: 0 };
}

/**
 * What a set of relics adds to a champion.
 *
 * Percentages resolve against the champion's *base* stat, never against a running total,
 * so two 15% pieces are worth exactly 30% and the order they are applied in cannot matter
 * (docs/COMBAT_SYSTEM.md §1). Set bonuses are counted in complete copies: six pieces of a
 * two-piece set is three copies of its bonus, which is what makes a full Swiftwind build
 * the tempo commitment it is meant to be.
 */
export function assembleGearBonus(
  base: StatBlock,
  pieces: readonly GearPiece[],
  tables: GearTables,
  /**
   * How much stronger the *set* bonuses are, as a percentage.
   *
   * Sustained Ward, and nothing else at EA. It amplifies only the set half of a relic's
   * contribution — never the main stat or the substats — which is what makes it a reward
   * for wearing complete sets rather than a flat damage node in disguise.
   */
  setBonusAmplifyPct = 0,
): { bonus: StatBlock; setBonuses: ActiveSetBonus[] } {
  const bonus = emptyStatBlock();

  const add = (line: GearStatLine): void => {
    if (!STATS.includes(line.stat)) return;
    bonus[line.stat] += line.percent ? (base[line.stat] * line.value) / 100 : line.value;
  };

  const counts = new Map<string, number>();
  for (const piece of pieces) {
    add(piece.main);
    for (const line of piece.substats) add(line);
    counts.set(piece.setKey, (counts.get(piece.setKey) ?? 0) + 1);
  }

  const setBonuses: ActiveSetBonus[] = [];
  for (const [setKey, equipped] of counts) {
    const def = tables.sets.get(setKey);
    if (!def) continue;
    const copies = Math.floor(equipped / def.pieces);
    if (copies < 1) continue;

    // Only `stat` sets touch the stat block; the rest are battle behaviours the engine
    // reads off the same list, and are reported here so the UI can show them.
    if (def.bonusType === 'stat' && def.bonus.stat) {
      const stat = def.bonus.stat;
      const amplify = 1 + setBonusAmplifyPct / 100;
      if (typeof def.bonus.pct === 'number')
        bonus[stat] += (base[stat] * def.bonus.pct * copies * amplify) / 100;
      if (typeof def.bonus.flat === 'number') bonus[stat] += def.bonus.flat * copies * amplify;
    }

    setBonuses.push({
      setKey,
      name: def.name,
      equipped,
      copies,
      description: describeSetBonus(def, copies),
    });
  }

  for (const stat of STATS) bonus[stat] = roundStat(bonus[stat], false);
  return { bonus, setBonuses };
}

/** Human text for an active set bonus, built from the definition rather than stored. */
export function describeSetBonus(def: GearSetDef, copies: number): string {
  const times = copies > 1 ? ` ×${copies}` : '';
  if (def.bonusType === 'stat' && def.bonus.stat) {
    const amount =
      typeof def.bonus.pct === 'number' ? `+${def.bonus.pct}%` : `+${def.bonus.flat ?? 0}`;
    return `${STAT_LABELS[def.bonus.stat]} ${amount}${times}`;
  }
  const chance =
    typeof def.bonus.chance === 'number' ? `${Math.round(def.bonus.chance * 100)}% ` : '';
  const pct = typeof def.bonus.pct === 'number' ? ` ${def.bonus.pct}%` : '';
  return `${chance}${BONUS_LABELS[def.bonusType] ?? def.bonusType}${pct}${times}`;
}

const STAT_LABELS: Readonly<Record<Stat, string>> = Object.freeze({
  hp: 'HP',
  atk: 'ATK',
  def: 'DEF',
  spd: 'SPD',
  critRate: 'C.RATE',
  critDmg: 'C.DMG',
  res: 'RES',
  acc: 'ACC',
});

const BONUS_LABELS: Readonly<Record<string, string>> = Object.freeze({
  lifesteal: 'Lifesteal',
  regen: 'Regeneration',
  provokeOnHit: 'Provoke on hit',
  stunOnHit: 'Stun on hit',
  burnOnHit: 'Burn on hit',
  counterOnHit: 'Counterattack',
  tmOnDamageTaken: 'Turn meter on damage taken',
});

/**
 * The informational power score.
 *
 * Used for sorting, arena bands and bot synthesis — never as a gameplay input, so it can
 * stay a weighted sum without anybody having to defend the weights in a fight
 * (GAME_DESIGN §7).
 */
export function powerScore(total: StatBlock, economy: GearEconomyConfig): number {
  let score = 0;
  for (const stat of STATS) score += total[stat] * (economy.powerWeights[stat] ?? 0);
  return Math.round(score);
}

/** Adds two stat blocks. */
export function addStatBlocks(a: StatBlock, b: StatBlock): StatBlock {
  const sum = emptyStatBlock();
  for (const stat of STATS) sum[stat] = a[stat] + b[stat];
  return sum;
}

/** Picks a rarity from a weight map, falling back to the configured defaults. */
export function pickRarity(
  rng: Rng,
  weights: Partial<Record<Rarity, number>>,
  economy: GearEconomyConfig,
): Rarity {
  const table = Object.keys(weights).length > 0 ? weights : economy.defaultRarityWeights;
  const total = RARITIES.reduce((sum, rarity) => sum + Math.max(0, table[rarity] ?? 0), 0);
  if (total <= 0) return 'common';
  let roll = rng.next() * total;
  for (const rarity of RARITIES) {
    roll -= Math.max(0, table[rarity] ?? 0);
    if (roll <= 0) return rarity;
  }
  return 'common';
}
