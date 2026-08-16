import { ELEMENT_BEATS, type Element, type StatusDef } from '@mistvale/shared';
import type { CombatConfig } from './config';
import type { Rng } from './rng';
import { clamp, damageTakenMultiplier, effectiveStat } from './stats';
import type { BattleUnit, HitQuality } from './types';

/**
 * Damage: element matchup, hit quality, crit, mitigation.
 *
 * The order these roll in is normative (COMBAT_SYSTEM §4): strong/weak, then crit, then
 * the damage number, then any on-hit debuffs. Changing the order changes every golden
 * replay, so it is pinned by tests rather than left to the reader.
 */

export type Matchup = 'advantage' | 'neutral' | 'disadvantage';

/** How the attacker's element fares against the defender's. Mist is always neutral. */
export function matchupOf(attacker: Element, defender: Element): Matchup {
  if (ELEMENT_BEATS[attacker] === defender) return 'advantage';
  if (ELEMENT_BEATS[defender] === attacker) return 'disadvantage';
  return 'neutral';
}

/**
 * Rolls one hit's quality.
 *
 * Only an advantaged attacker can land STRONG, and only a disadvantaged one can land
 * WEAK. A neutral matchup never rolls at all, which is what keeps Mist predictable.
 */
export function rollHitQuality(matchup: Matchup, rng: Rng, config: CombatConfig): HitQuality {
  if (matchup === 'advantage') return rng.chance(config.strongHitChance) ? 'strong' : 'normal';
  if (matchup === 'disadvantage') return rng.chance(config.weakHitChance) ? 'weak' : 'normal';
  return 'normal';
}

export interface DamageInput {
  attacker: BattleUnit;
  defender: BattleUnit;
  /** Σ (multiplier × scaling stat) for this hit, before any modifiers. */
  raw: number;
  quality: HitQuality;
  matchup: Matchup;
  /** Fraction of the defender's DEF ignored, 0–1. */
  ignoreDefPct?: number;
  /** DoTs and %-MaxHP procs skip mitigation entirely (§6). */
  bypassDefence?: boolean;
}

export interface DamageResult {
  amount: number;
  crit: boolean;
}

/**
 * Resolves one hit into a final number.
 *
 * Mitigation is `K / (K + DEF)` with `K = 10 × attacker level`, so defence is worth the
 * same proportionally at every level — 600 DEF halves damage from a level-60 attacker
 * and keeps halving it as both sides grow.
 */
export function computeDamage(
  input: DamageInput,
  statuses: ReadonlyMap<string, StatusDef>,
  rng: Rng,
  config: CombatConfig,
): DamageResult {
  const { attacker, defender, raw, quality, matchup } = input;

  let amount = raw;

  // 1. Element (§4). A weak hit takes the disadvantage penalty and the weak penalty.
  if (matchup === 'disadvantage') amount *= 1 - config.disadvantagePenalty;
  if (quality === 'strong') amount *= 1 + config.strongHitBonus;
  if (quality === 'weak') amount *= 1 - config.weakHitPenalty;

  // 2. Crit. Weak hits never crit; advantage lends crit chance.
  let crit = false;
  if (quality !== 'weak') {
    const bonus = matchup === 'advantage' ? config.strongHitCritBonus : 0;
    const chance = clamp(effectiveStat(attacker, 'critRate', statuses) + bonus, 0, 100) / 100;
    crit = rng.chance(chance);
    if (crit) amount *= 1 + effectiveStat(attacker, 'critDmg', statuses) / 100;
  }

  // 3. Mitigation. Poison, HP Burn and %-MaxHP procs bypass it.
  if (!input.bypassDefence) {
    const defence =
      effectiveStat(defender, 'def', statuses) * (1 - clamp(input.ignoreDefPct ?? 0, 0, 1));
    const k = config.defenceConstantPerLevel * attacker.level;
    amount *= k / (k + Math.max(0, defence));
  }

  // 4. Weaken / Strengthen, then the spread.
  amount *= damageTakenMultiplier(defender, statuses);
  const variance = config.damageVariance;
  if (variance > 0) amount *= 1 - variance + rng.next() * variance * 2;

  return { amount: Math.max(1, Math.round(amount)), crit };
}

/**
 * Whether a debuff sticks, after its own stated chance has already passed.
 *
 * Parity is ~90%: even matching a target's resistance leaves it a real chance to shrug.
 * Above parity accuracy buys a little more, capped; below it, each point of resistance
 * costs about a percentage point (§5).
 */
export function landChance(accuracy: number, resistance: number, config: CombatConfig): number {
  const delta = accuracy - resistance;
  const bonus = Math.min(
    config.accuracyMaxBonus,
    Math.max(0, delta) * config.accuracyBonusPerPoint,
  );
  const penalty = Math.max(0, -delta) * config.accuracyPenaltyPerPoint;
  return clamp(
    config.accuracyParityLandChance + bonus - penalty,
    config.accuracyMinLandChance,
    config.accuracyMaxLandChance,
  );
}
