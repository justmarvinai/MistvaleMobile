import type { MasteryCondition, MasteryEffect, Stat } from '@mistvale/shared';
import type { BattleUnit, MasteryRuntime } from './types';

/**
 * Masteries, at battle time.
 *
 * The server resolves a champion's chosen nodes into a flat list of effects before the
 * fight starts, so nothing here reads content — the engine sees `{type: 'damageDealt', pct:
 * 12, condition: …}` and never learns that it came from Opportunist. That keeps this module
 * a small vocabulary of behaviours rather than a catalogue of forty-eight special cases,
 * and it is why adding a node is an Admin edit (docs/COMBAT_SYSTEM.md §9).
 *
 * Everything unconditional was already folded into the champion's stats by the server, the
 * same road relics take. What arrives here is what could not be settled in advance:
 * conditions that depend on the state of a fight, and procs that fire on things happening.
 */

export function masteryRuntime(unit: BattleUnit): MasteryRuntime {
  unit.masteryState ??= {
    killStacks: 0,
    a1Uses: 0,
    struckFirst: [],
    debuffsThisTurn: 0,
    livingFoes: 0,
  };
  return unit.masteryState;
}

/** Every effect of one type a unit carries. Cheap: a full build is fifteen nodes. */
function effectsOf<T extends MasteryEffect['type']>(
  unit: BattleUnit,
  type: T,
): Extract<MasteryEffect, { type: T }>[] {
  const held = unit.masteries;
  if (!held || held.length === 0) return [];
  return held.filter(
    (effect): effect is Extract<MasteryEffect, { type: T }> => effect.type === type,
  );
}

/** True when a unit carries at least one effect of a type — for the cheap early exits. */
export function hasMastery(unit: BattleUnit, type: MasteryEffect['type']): boolean {
  return (unit.masteries ?? []).some((effect) => effect.type === type);
}

// ── Conditions ──────────────────────────────────────────────────────────────

/** What a condition needs to know beyond the two units involved. */
export interface MasteryContext {
  /** The skill in flight struck more than one target. */
  aoe?: boolean;
  mode?: string;
  /** Whether the target counts as crowd-controlled right now. */
  targetCrowdControlled?: boolean;
  /** Whether the target is holding a shield. */
  targetShielded?: boolean;
}

/**
 * How many times a condition holds.
 *
 * Most conditions are yes or no, so they answer 0 or 1. The stacking ones — one bonus per
 * debuff carried, per living enemy — answer how many, and the caller multiplies. Returning
 * a count rather than a boolean is what lets Fury Brand and Swarmreader be ordinary
 * conditions instead of two more effect types.
 */
function conditionStacks(
  condition: MasteryCondition | undefined,
  self: BattleUnit,
  target: BattleUnit | null,
  context: MasteryContext,
): number {
  if (!condition) return 1;

  switch (condition.type) {
    case 'targetShielded':
      return context.targetShielded ? 1 : 0;
    case 'targetCrowdControlled':
      return context.targetCrowdControlled ? 1 : 0;
    case 'targetHpBelow':
      return target && target.maxHp > 0 && (target.hp / target.maxHp) * 100 < condition.pct ? 1 : 0;
    case 'targetMaxHpAbove':
      return target && target.maxHp > self.maxHp ? 1 : 0;
    case 'selfHpBelow':
      return self.maxHp > 0 && (self.hp / self.maxHp) * 100 < condition.pct ? 1 : 0;
    case 'perOwnDebuff':
      return Math.min(condition.maxStacks, self.debuffs.length);
    case 'perLivingEnemy':
      return Math.min(condition.maxStacks, masteryRuntime(self).livingFoes);
    case 'selfHasNoBuffs':
      return self.buffs.length === 0 ? 1 : 0;
    case 'aoeSkill':
      return context.aoe ? 1 : 0;
    case 'mode':
      return context.mode === condition.mode ? 1 : 0;
    default:
      return 0;
  }
}

// ── Damage ──────────────────────────────────────────────────────────────────

/** The attacker's outgoing damage multiplier from masteries. */
export function damageDealtMultiplier(
  attacker: BattleUnit,
  target: BattleUnit,
  context: MasteryContext,
): number {
  let multiplier = 1;
  for (const effect of effectsOf(attacker, 'damageDealt')) {
    const stacks = conditionStacks(effect.condition, attacker, target, context);
    if (stacks > 0) multiplier += (effect.pct / 100) * stacks;
  }
  return Math.max(0, multiplier);
}

/** The defender's incoming damage multiplier from masteries. */
export function damageTakenMultiplier(
  defender: BattleUnit,
  attacker: BattleUnit | null,
  context: MasteryContext,
): number {
  let multiplier = 1;
  for (const effect of effectsOf(defender, 'damageTaken')) {
    const stacks = conditionStacks(effect.condition, defender, attacker, context);
    if (stacks > 0) multiplier += (effect.pct / 100) * stacks;
  }
  return Math.max(0, multiplier);
}

/**
 * A conditional stat addition, in points.
 *
 * Only the conditional ones live here — an unconditional `+75 ATK` was folded into the
 * champion's stats before the battle, which is why it shows on the champion screen.
 */
export function conditionalStatBonus(unit: BattleUnit, stat: Stat, baseValue: number): number {
  let bonus = 0;
  for (const effect of effectsOf(unit, 'stat')) {
    if (effect.stat !== stat || !effect.condition) continue;
    const stacks = conditionStacks(effect.condition, unit, null, {});
    if (stacks <= 0) continue;
    bonus += effect.flat * stacks + (baseValue * effect.pct * stacks) / 100;
  }
  return bonus;
}

/** How much the holder heals off a blow it just landed. */
export function lifestealFrom(attacker: BattleUnit, target: BattleUnit, hpLost: number): number {
  if (hpLost <= 0) return 0;
  let healed = 0;
  for (const effect of effectsOf(attacker, 'lifesteal')) {
    if (conditionStacks(effect.condition, attacker, target, {}) <= 0) continue;
    healed += Math.round((hpLost * effect.pct) / 100);
  }
  return healed;
}

/** The Warmaster-analog, if the attacker has it. */
export function bonusDamageRule(
  attacker: BattleUnit,
): Extract<MasteryEffect, { type: 'bonusDamageMaxHp' }> | undefined {
  return effectsOf(attacker, 'bonusDamageMaxHp')[0];
}

/** The A1 ramp multiplier, from however many times it has been used in a row. */
export function a1RampMultiplier(unit: BattleUnit): number {
  const effect = effectsOf(unit, 'a1Ramp')[0];
  if (!effect) return 1;
  const gained = Math.min(effect.maxPct, masteryRuntime(unit).a1Uses * effect.pctPerUse);
  return 1 + gained / 100;
}

/** Records an A1 use, or resets the ramp because something else was cast. */
export function noteSkillUse(unit: BattleUnit, isA1: boolean): void {
  if (!hasMastery(unit, 'a1Ramp')) return;
  const runtime = masteryRuntime(unit);
  runtime.a1Uses = isA1 ? runtime.a1Uses + 1 : 0;
}

/**
 * The meter this A1 takes off a target it has not struck before.
 *
 * Once per target per battle by design: it is an opener, not a tempo engine.
 */
export function firstStrikeAgainst(attacker: BattleUnit, target: BattleUnit): number {
  const effect = effectsOf(attacker, 'firstStrike')[0];
  if (!effect) return 0;
  const runtime = masteryRuntime(attacker);
  const id = `${target.ref.side}:${target.ref.slot}`;
  if (runtime.struckFirst.includes(id)) return 0;
  runtime.struckFirst.push(id);
  return effect.pct;
}

// ── Defence ─────────────────────────────────────────────────────────────────

/** The share of an ally's damage a nearby holder takes instead. */
export function redirectShare(unit: BattleUnit): number {
  let pct = 0;
  for (const effect of effectsOf(unit, 'redirect')) pct += effect.pct;
  return Math.min(50, pct);
}

/** How much Ally Protection is amplified. */
export function protectionBonus(unit: BattleUnit): number {
  let pct = 0;
  for (const effect of effectsOf(unit, 'protectionBonus')) pct += effect.pct;
  return pct;
}

/** Counterattack damage, from a status or a mastery proc alike. */
export function counterDamageMultiplier(unit: BattleUnit): number {
  let multiplier = 1;
  for (const effect of effectsOf(unit, 'counterDamage')) multiplier += effect.pct / 100;
  return Math.max(0, multiplier);
}

/** The counter-proc rules a unit holds for one trigger. */
export function counterProcs(
  unit: BattleUnit,
  trigger: 'heavyHit' | 'allyCrowdControlled',
): Extract<MasteryEffect, { type: 'counterProc' }>[] {
  return effectsOf(unit, 'counterProc').filter((effect) => effect.trigger === trigger);
}

export function hasLastStand(unit: BattleUnit): boolean {
  return hasMastery(unit, 'lastStand') && unit.usedLastStand !== true;
}

// ── Healing and shields ─────────────────────────────────────────────────────

/** Multiplier on healing this unit gives out, or receives. */
export function healingMultiplier(
  unit: BattleUnit,
  mode: 'dealt' | 'received' | 'shieldReceived',
): number {
  let multiplier = 1;
  for (const effect of effectsOf(unit, 'healing')) {
    if (effect.mode === mode) multiplier += effect.pct / 100;
  }
  return Math.max(0, multiplier);
}

export function battleStartShield(
  unit: BattleUnit,
): Extract<MasteryEffect, { type: 'battleStartShield' }> | undefined {
  return effectsOf(unit, 'battleStartShield')[0];
}

/** What a kill is worth: a stat stack, a shield, or both. */
export function killRewards(unit: BattleUnit): {
  stat?: Stat;
  amount: number;
  shieldPctMaxHp: number;
} | null {
  const effects = effectsOf(unit, 'onKill');
  if (effects.length === 0) return null;

  const runtime = masteryRuntime(unit);
  let stat: Stat | undefined;
  let amount = 0;
  let shieldPctMaxHp = 0;

  for (const effect of effects) {
    if (effect.stat && runtime.killStacks < effect.maxStacks) {
      stat = effect.stat;
      amount += effect.flat;
    }
    shieldPctMaxHp += effect.shieldPctMaxHp;
  }
  if (stat) runtime.killStacks += 1;
  return { ...(stat ? { stat } : {}), amount, shieldPctMaxHp };
}

// ── Statuses and tempo ──────────────────────────────────────────────────────

/** Added chance for a debuff to stick, before the ACC-versus-RES contest. */
export function debuffChanceBonus(unit: BattleUnit, isHardCc: boolean): number {
  let pct = 0;
  for (const effect of effectsOf(unit, 'debuffChance')) {
    if (effect.hardCcOnly && !isHardCc) continue;
    pct += effect.pct;
  }
  return pct / 100;
}

/** The duration-extension rule a caster holds, if any applies to this status. */
export function durationExtension(
  caster: BattleUnit,
  mode: 'ownDebuffs' | 'allyBuffs',
  isHardCc: boolean,
): Extract<MasteryEffect, { type: 'statusDuration' }> | undefined {
  return effectsOf(caster, 'statusDuration').find(
    (effect) => effect.mode === mode && !(effect.excludeHardCc && isHardCc),
  );
}

export function cleanseProc(
  unit: BattleUnit,
): Extract<MasteryEffect, { type: 'cleanseProc' }> | undefined {
  return effectsOf(unit, 'cleanseProc')[0];
}

export function turnMeterProcs(
  unit: BattleUnit,
  trigger: Extract<MasteryEffect, { type: 'turnMeterProc' }>['trigger'],
): Extract<MasteryEffect, { type: 'turnMeterProc' }>[] {
  return effectsOf(unit, 'turnMeterProc').filter((effect) => effect.trigger === trigger);
}

export function cooldownProcs(
  unit: BattleUnit,
): Extract<MasteryEffect, { type: 'cooldownProc' }>[] {
  return effectsOf(unit, 'cooldownProc');
}

/** Opens a unit's turn: the counters that are measured per turn start again. */
export function resetTurnCounters(unit: BattleUnit, livingFoes: number): void {
  if (!unit.masteries || unit.masteries.length === 0) return;
  const runtime = masteryRuntime(unit);
  runtime.debuffsThisTurn = 0;
  runtime.livingFoes = livingFoes;
}

/** Counts a debuff this unit just landed, and reports whether a threshold was crossed. */
export function noteDebuffLanded(unit: BattleUnit, threshold: number): boolean {
  const runtime = masteryRuntime(unit);
  runtime.debuffsThisTurn += 1;
  return runtime.debuffsThisTurn === threshold;
}
