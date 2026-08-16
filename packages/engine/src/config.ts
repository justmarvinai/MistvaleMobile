/**
 * The tunable constants the simulation reads.
 *
 * Formulas are code; their inputs are data (CLAUDE.md). Every value here comes from a
 * `game_config` row an operator can edit in the Admin Suite, so rebalancing is a publish
 * rather than a deploy. The defaults below exist only so the engine can be exercised in
 * isolation — the server always passes the published values in.
 */

export interface CombatConfig {
  /** TM gained per point of SPD per tick. */
  turnMeterPerTick: number;

  // Element hit quality (§4).
  strongHitChance: number;
  strongHitBonus: number;
  strongHitCritBonus: number;
  weakHitChance: number;
  weakHitPenalty: number;
  disadvantagePenalty: number;

  // Damage (§6).
  defenceConstantPerLevel: number;
  damageVariance: number;

  // Accuracy versus resistance (§5).
  accuracyParityLandChance: number;
  accuracyMaxLandChance: number;
  accuracyMinLandChance: number;
  accuracyBonusPerPoint: number;
  accuracyMaxBonus: number;
  accuracyPenaltyPerPoint: number;

  // Status bookkeeping (§7).
  poisonStackCap: number;
  effectBarCap: number;
  hpBurnSplashPct: number;
  /** Arena only: added resist chance per consecutive hard CC on the same unit. */
  arenaCcDiminishing: number;

  // Battle flow (§2).
  waveHealPct: number;
  maxTurns: number;
}

export const DEFAULT_COMBAT_CONFIG: CombatConfig = Object.freeze({
  turnMeterPerTick: 0.07,

  strongHitChance: 0.5,
  strongHitBonus: 0.3,
  strongHitCritBonus: 15,
  weakHitChance: 0.35,
  weakHitPenalty: 0.3,
  disadvantagePenalty: 0.2,

  defenceConstantPerLevel: 10,
  damageVariance: 0.05,

  accuracyParityLandChance: 0.9,
  accuracyMaxLandChance: 0.97,
  accuracyMinLandChance: 0.05,
  accuracyBonusPerPoint: 0.0025,
  accuracyMaxBonus: 0.07,
  accuracyPenaltyPerPoint: 0.01,

  poisonStackCap: 5,
  effectBarCap: 10,
  hpBurnSplashPct: 3,
  arenaCcDiminishing: 0.25,

  waveHealPct: 10,
  maxTurns: 300,
});

/** Maps `game_config` keys onto the engine's config fields. */
const CONFIG_KEYS: Readonly<Record<keyof CombatConfig, string>> = Object.freeze({
  turnMeterPerTick: 'combat.turnMeterPerTick',
  strongHitChance: 'combat.strongHitChance',
  strongHitBonus: 'combat.strongHitBonus',
  strongHitCritBonus: 'combat.strongHitCritBonus',
  weakHitChance: 'combat.weakHitChance',
  weakHitPenalty: 'combat.weakHitPenalty',
  disadvantagePenalty: 'combat.disadvantagePenalty',
  defenceConstantPerLevel: 'combat.defenceConstantPerLevel',
  damageVariance: 'combat.damageVariance',
  accuracyParityLandChance: 'combat.accuracyParityLandChance',
  accuracyMaxLandChance: 'combat.accuracyMaxLandChance',
  accuracyMinLandChance: 'combat.accuracyMinLandChance',
  accuracyBonusPerPoint: 'combat.accuracyBonusPerPoint',
  accuracyMaxBonus: 'combat.accuracyMaxBonus',
  accuracyPenaltyPerPoint: 'combat.accuracyPenaltyPerPoint',
  poisonStackCap: 'combat.poisonStackCap',
  effectBarCap: 'combat.effectBarCap',
  hpBurnSplashPct: 'combat.hpBurnSplashPct',
  arenaCcDiminishing: 'combat.arenaCcDiminishing',
  waveHealPct: 'combat.waveHealPct',
  maxTurns: 'combat.maxTurns',
});

/**
 * Reads the engine's constants out of a published config map.
 *
 * A missing or non-numeric key falls back to its default rather than throwing: an
 * operator deleting one row should not take the game down, and the validator already
 * warns about it at publish time.
 */
export function combatConfigFrom(config: Readonly<Record<string, unknown>>): CombatConfig {
  const resolved = { ...DEFAULT_COMBAT_CONFIG };
  for (const [field, key] of Object.entries(CONFIG_KEYS) as [keyof CombatConfig, string][]) {
    const value = config[key];
    if (typeof value === 'number' && Number.isFinite(value)) resolved[field] = value;
  }
  return Object.freeze(resolved);
}

/** How a champion's authored ★6/60/Asc6 anchor scales down to lower tiers. */
export interface ChampionScalingConfig {
  levelCurveExponent: number;
  levelFloorPct: number;
  rankMultipliers: readonly number[];
  ascensionBonusPct: number;
}

export const DEFAULT_CHAMPION_SCALING: ChampionScalingConfig = Object.freeze({
  levelCurveExponent: 1.35,
  levelFloorPct: 18,
  rankMultipliers: Object.freeze([0.42, 0.55, 0.68, 0.79, 0.9, 1]),
  ascensionBonusPct: 2,
});

export function championScalingFrom(
  config: Readonly<Record<string, unknown>>,
): ChampionScalingConfig {
  const number = (key: string, fallback: number): number => {
    const value = config[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };

  const ranks = config['champion.rankMultipliers'];
  const rankMultipliers =
    Array.isArray(ranks) && ranks.length > 0 && ranks.every((value) => typeof value === 'number')
      ? (ranks as number[])
      : DEFAULT_CHAMPION_SCALING.rankMultipliers;

  return Object.freeze({
    levelCurveExponent: number(
      'champion.levelCurveExponent',
      DEFAULT_CHAMPION_SCALING.levelCurveExponent,
    ),
    levelFloorPct: number('champion.levelFloorPct', DEFAULT_CHAMPION_SCALING.levelFloorPct),
    rankMultipliers: Object.freeze([...rankMultipliers]),
    ascensionBonusPct: number(
      'champion.ascensionBonusPct',
      DEFAULT_CHAMPION_SCALING.ascensionBonusPct,
    ),
  });
}
