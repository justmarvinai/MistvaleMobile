import type { BaseStats, Stat, StatusDef } from '@mistvale/shared';
import type { ChampionScalingConfig } from './config';
import type { BattleUnit, StatusInstance } from './types';

/**
 * Stat derivation and battle-time modification.
 *
 * Two distinct stages, and keeping them apart matters:
 *
 *  1. **Out of battle** — a champion's authored `base_stats` are its values at
 *     ★6 / level 60 / ascension 6. `deriveStats` scales that anchor down to whatever tier
 *     the unit is actually at, and the server then layers gear, sets, Hall of Valor,
 *     masteries and the aura on top. The result is frozen into `BattleUnit.stats`.
 *  2. **In battle** — `effectiveStat` applies live buffs and debuffs on top of that
 *     frozen baseline. Nothing in the simulation mutates `stats`, so a dispel always
 *     restores exactly the value the unit started with (COMBAT_SYSTEM §1).
 */

/** Stats that scale with level, rank and ascension. The rest are flat by design. */
const SCALED_STATS = ['hp', 'atk', 'def'] as const;

/**
 * Scales an authored ★6/60/Asc6 anchor down to a given tier.
 *
 * The level curve blends a level-1 floor up to the full anchor, so a champion feels
 * meaningfully weak at 1 and reaches exactly its authored numbers at 60 — no drift
 * between what an operator types into Admin and what the engine fights with.
 */
export function deriveStats(
  anchor: BaseStats,
  tier: { level: number; rank: number; ascension: number },
  scaling: ChampionScalingConfig,
): Record<Stat, number> {
  const level = clamp(tier.level, 1, 60);
  const rank = clamp(tier.rank, 1, scaling.rankMultipliers.length);
  const ascension = Math.max(0, tier.ascension);

  const floor = scaling.levelFloorPct / 100;
  const progress = (level - 1) / 59;
  const levelFactor = floor + (1 - floor) * Math.pow(progress, scaling.levelCurveExponent);
  const rankFactor = scaling.rankMultipliers[rank - 1] ?? 1;
  const ascensionFactor = 1 + (ascension * scaling.ascensionBonusPct) / 100;
  const factor = levelFactor * rankFactor * ascensionFactor;

  const derived: Record<Stat, number> = {
    hp: anchor.hp,
    atk: anchor.atk,
    def: anchor.def,
    // SPD, crit and the accuracy pair are flat: a champion's tempo and its debuff
    // maths are part of its identity, not a reward for levelling it.
    spd: anchor.spd,
    critRate: anchor.critRate ?? 15,
    critDmg: anchor.critDmg ?? 50,
    res: anchor.res ?? 30,
    acc: anchor.acc ?? 0,
  };

  for (const stat of SCALED_STATS) {
    derived[stat] = Math.max(1, Math.round(derived[stat] * factor));
  }
  return derived;
}

/** Percentage and flat modifiers a unit's statuses contribute to one stat. */
function statusModifiers(
  unit: BattleUnit,
  stat: Stat,
  statuses: ReadonlyMap<string, StatusDef>,
): { pct: number; flat: number } {
  let pct = 0;
  let flat = 0;

  for (const instance of [...unit.buffs, ...unit.debuffs]) {
    const def = statuses.get(instance.key);
    if (!def || def.engineType !== 'statModifier') continue;
    // A statModifier with no `stat` is a damage-taken modifier (Weaken, Strengthen),
    // which `damageTakenMultiplier` reads instead.
    if (def.params.stat !== stat) continue;

    if (typeof def.params.pct === 'number') pct += def.params.pct * instance.stacks;
    if (typeof def.params.flat === 'number') flat += def.params.flat * instance.stacks;
  }
  return { pct, flat };
}

/**
 * A stat as it stands right now, buffs and debuffs included.
 *
 * Percentages apply to the frozen baseline rather than compounding on each other, which
 * is what keeps ATK Up 50% worth exactly 50% no matter what else is running.
 */
export function effectiveStat(
  unit: BattleUnit,
  stat: Stat,
  statuses: ReadonlyMap<string, StatusDef>,
): number {
  const base = unit.stats[stat];
  const { pct, flat } = statusModifiers(unit, stat, statuses);
  const value = base * (1 + pct / 100) + flat;

  // Crit rate is a probability; the rest are magnitudes that simply cannot go negative.
  if (stat === 'critRate') return clamp(value, 0, 100);
  return Math.max(0, value);
}

/**
 * How much more (or less) damage this unit takes, from Weaken and Strengthen.
 *
 * Those two are `statModifier` statuses with no `stat`: positive `pct` increases damage
 * taken, negative reduces it.
 */
export function damageTakenMultiplier(
  unit: BattleUnit,
  statuses: ReadonlyMap<string, StatusDef>,
): number {
  let pct = 0;
  for (const instance of [...unit.buffs, ...unit.debuffs]) {
    const def = statuses.get(instance.key);
    if (!def || def.engineType !== 'statModifier' || def.params.stat !== undefined) continue;
    if (typeof def.params.pct === 'number') pct += def.params.pct * instance.stacks;
  }
  return Math.max(0, 1 + pct / 100);
}

/** How much healing this unit receives, after Heal Reduction. */
export function healReceivedMultiplier(
  unit: BattleUnit,
  statuses: ReadonlyMap<string, StatusDef>,
): number {
  let reduction = 0;
  for (const instance of unit.debuffs) {
    const def = statuses.get(instance.key);
    if (def?.engineType !== 'healReduction') continue;
    reduction = Math.max(reduction, def.params.pct ?? 0);
  }
  return clamp(1 - reduction / 100, 0, 1);
}

/** Finds the first status instance on a unit whose definition has the given behaviour. */
export function findByEngineType(
  unit: BattleUnit,
  engineType: StatusDef['engineType'],
  statuses: ReadonlyMap<string, StatusDef>,
): { instance: StatusInstance; def: StatusDef } | undefined {
  for (const instance of [...unit.buffs, ...unit.debuffs]) {
    const def = statuses.get(instance.key);
    if (def?.engineType === engineType) return { instance, def };
  }
  return undefined;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
