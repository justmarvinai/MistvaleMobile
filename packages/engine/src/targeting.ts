import type { EffectTarget, SkillDef, StatusDef, Targeting } from '@mistvale/shared';
import type { Rng } from './rng';
import { provokedBy } from './status';
import type { BattleUnit, UnitRef } from './types';

/**
 * Target selection.
 *
 * Two layers: a skill's `targeting` says which side and how many, and the AI's hints say
 * which one it prefers when there is a choice. Manual play supplies the target directly
 * and skips the second layer entirely (COMBAT_SYSTEM §12).
 *
 * Every path that can pick more than one candidate goes through the seeded RNG, never
 * `Math.random`, so a replay picks the same targets every time.
 */

export function living(units: readonly BattleUnit[]): BattleUnit[] {
  return units.filter((unit) => unit.alive);
}

export function unitAt(
  allies: readonly BattleUnit[],
  enemies: readonly BattleUnit[],
  ref: UnitRef,
): BattleUnit | undefined {
  const pool = ref.side === 'ally' ? allies : enemies;
  return pool.find((unit) => unit.ref.slot === ref.slot);
}

/** The candidate pool a skill may choose from, before preference or a manual pick. */
export function candidatesFor(
  targeting: Targeting,
  caster: BattleUnit,
  allies: readonly BattleUnit[],
  enemies: readonly BattleUnit[],
): BattleUnit[] {
  if (targeting.side === 'self') return [caster];
  const own = caster.ref.side === 'ally' ? allies : enemies;
  const foes = caster.ref.side === 'ally' ? enemies : allies;
  return living(targeting.side === 'ally' ? own : foes);
}

export type Preference = NonNullable<SkillDef['aiHints']['prefer']>;

/** Applies an AI preference to a candidate pool. Ties break on the seeded RNG. */
export function preferred(
  candidates: readonly BattleUnit[],
  preference: Preference | undefined,
  rng: Rng,
): BattleUnit | undefined {
  if (candidates.length === 0) return undefined;
  if (candidates.length === 1) return candidates[0];

  const best = (score: (unit: BattleUnit) => number): BattleUnit => {
    let bestScore = -Infinity;
    let pool: BattleUnit[] = [];
    for (const unit of candidates) {
      const value = score(unit);
      if (value > bestScore) {
        bestScore = value;
        pool = [unit];
      } else if (value === bestScore) {
        pool.push(unit);
      }
    }
    return pool.length === 1 ? pool[0]! : rng.pick(pool);
  };

  switch (preference) {
    case 'lowestHp':
    case 'lowestHpAlly':
      return best((unit) => -(unit.hp / unit.maxHp));
    case 'highestAtk':
      return best((unit) => unit.stats.atk);
    case 'highestTm':
      return best((unit) => unit.tm);
    case 'random':
    case undefined:
      return rng.pick([...candidates]);
    default:
      return rng.pick([...candidates]);
  }
}

/**
 * Resolves the units a skill actually strikes.
 *
 * Provoke overrides everything for single-target enemy skills: a provoked unit must
 * swing its A1 at whoever provoked it, which is the whole point of the debuff.
 */
export function resolveTargets(
  skill: SkillDef,
  caster: BattleUnit,
  allies: readonly BattleUnit[],
  enemies: readonly BattleUnit[],
  statuses: ReadonlyMap<string, StatusDef>,
  rng: Rng,
  explicit?: UnitRef,
): BattleUnit[] {
  const targeting = skill.targeting;
  const candidates = candidatesFor(targeting, caster, allies, enemies);
  if (candidates.length === 0) return [];

  if (targeting.mode === 'self') return [caster];
  if (targeting.mode === 'all') return candidates;

  if (targeting.side === 'enemy') {
    const provoker = provokedBy(caster, statuses);
    if (provoker) {
      const forced = candidates.find(
        (unit) => unit.ref.side === provoker.side && unit.ref.slot === provoker.slot,
      );
      if (forced) return [forced];
    }
  }

  if (targeting.mode === 'random') {
    const count = Math.min(targeting.count ?? 1, candidates.length);
    // Distinct targets: a "hit three random enemies" skill should not hit one thrice.
    return rng.shuffle(candidates).slice(0, count);
  }

  if (explicit) {
    const chosen = candidates.find(
      (unit) => unit.ref.side === explicit.side && unit.ref.slot === explicit.slot,
    );
    if (chosen) return [chosen];
  }

  if (targeting.mode === 'lowestHp') {
    const chosen = preferred(candidates, 'lowestHp', rng);
    return chosen ? [chosen] : [];
  }

  const chosen = preferred(candidates, skill.aiHints.prefer, rng);
  return chosen ? [chosen] : [];
}

/** Where a component sends its effect, relative to the skill's own targets. */
export function componentTargets(
  target: EffectTarget,
  caster: BattleUnit,
  hitTargets: readonly BattleUnit[],
  allies: readonly BattleUnit[],
  enemies: readonly BattleUnit[],
  rng: Rng,
): BattleUnit[] {
  const own = living(caster.ref.side === 'ally' ? allies : enemies);
  const foes = living(caster.ref.side === 'ally' ? enemies : allies);

  switch (target) {
    case 'self':
      return [caster];
    case 'allAllies':
      return own;
    case 'allEnemies':
      return foes;
    case 'lowestHpAlly': {
      const chosen = preferred(own, 'lowestHpAlly', rng);
      return chosen ? [chosen] : [];
    }
    case 'randomAlly': {
      const chosen = preferred(own, 'random', rng);
      return chosen ? [chosen] : [];
    }
    case 'hitTargets':
    default:
      return hitTargets.filter((unit) => unit.alive);
  }
}
