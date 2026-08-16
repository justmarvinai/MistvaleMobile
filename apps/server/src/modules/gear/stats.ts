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
  });
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
      if (typeof def.bonus.pct === 'number')
        bonus[stat] += (base[stat] * def.bonus.pct * copies) / 100;
      if (typeof def.bonus.flat === 'number') bonus[stat] += def.bonus.flat * copies;
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
