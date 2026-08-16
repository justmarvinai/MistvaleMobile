import type { EffectComponent, SkillDef, StatusDef } from '@mistvale/shared';
import { chooseSkill } from './ai';
import {
  absorbHit,
  bandsCrossed,
  bossRuntime,
  enrageMultiplier,
  freeSlots,
  instantiateAdd,
  resetShield,
  shieldPhase,
  shieldStanding,
  shouldAnnounceEnrage,
  summonAllowance,
} from './boss';
import type { CombatConfig } from './config';
import { computeDamage, landChance, matchupOf, rollHitQuality, type Matchup } from './damage';
import { createRng, createRngFromState, type Rng } from './rng';
import { clamp, effectiveStat, findByEngineType, healReceivedMultiplier } from './stats';
import {
  applyStatus,
  breakOnDamage,
  clearAllStatuses,
  isHardCc,
  removeStatus,
  skipReason,
  tickDurations,
  tickingStatuses,
} from './status';
import { componentTargets, living, resolveTargets, unitAt } from './targeting';
import { advanceToNextActor, consumeTurn, applyTurnMeter, resetMeters } from './turnmeter';
import type {
  BattleAction,
  BattleEvent,
  BattleEventInput,
  BattleRules,
  BattleState,
  BattleUnit,
  HitQuality,
  StepResult,
  UnitRef,
  UnitSnapshot,
} from './types';

/**
 * The simulation.
 *
 * `advance` runs the battle forward until it needs something from the caller — a manual
 * action, or the end of the fight. Everything it does is a pure function of the state
 * and the seeded RNG carried inside it, so replaying a battle from its seed reproduces
 * it exactly, event for event (COMBAT_SYSTEM §13).
 *
 * The event log is the client's only contract. Nothing here computes a number the client
 * has to recompute; every floater, bar and animation reads a value straight off an event.
 */

interface Ctx {
  state: BattleState;
  rules: BattleRules;
  config: CombatConfig;
  rng: Rng;
  events: BattleEvent[];
}

function emit(ctx: Ctx, event: BattleEventInput): void {
  ctx.events.push({ ...event, id: ctx.state.nextEventId++ } as BattleEvent);
}

function snapshot(unit: BattleUnit): UnitSnapshot {
  return {
    ref: unit.ref,
    defKey: unit.defKey,
    name: unit.name,
    element: unit.element,
    level: unit.level,
    maxHp: unit.maxHp,
    hp: unit.hp,
    stats: unit.stats,
    skills: unit.skills,
    isBoss: unit.isBoss,
  };
}

/** The team a unit belongs to, and the team opposite it. */
function sides(ctx: Ctx, unit: BattleUnit): { own: BattleUnit[]; foes: BattleUnit[] } {
  return unit.ref.side === 'ally'
    ? { own: ctx.state.allies, foes: ctx.state.enemies }
    : { own: ctx.state.enemies, foes: ctx.state.allies };
}

/** Ties go to the player's team, except in the Arena where the defender wins them. */
function prioritySide(state: BattleState): 'ally' | 'enemy' {
  return state.mode === 'arena' ? 'enemy' : 'ally';
}

// ── Damage and healing ──────────────────────────────────────────────────────

interface DealtDamage {
  /** HP actually lost, after protection and shields. */
  hpLost: number;
  /** Total before shields — what Reflect and lifesteal compute from. */
  gross: number;
  /** DoT ticks and %-HP procs, which some on-damage rules deliberately ignore. */
  trueDamage: boolean;
}

/**
 * Applies a resolved damage number to a unit.
 *
 * Order is normative (§6): Ally Protection splits the blow first, then shields absorb,
 * then HP takes the rest. Doing it in any other order changes how protection and shields
 * combine, so the sequence is pinned by tests.
 */
function dealDamage(
  ctx: Ctx,
  source: BattleUnit,
  target: BattleUnit,
  amount: number,
  meta: {
    quality: HitQuality;
    crit: boolean;
    hitIndex: number;
    hits: number;
    trueDamage?: boolean;
  },
): DealtDamage {
  if (!target.alive || amount <= 0) {
    return { hpLost: 0, gross: 0, trueDamage: meta.trueDamage === true };
  }

  let remaining = amount;
  let redirectedFrom: UnitRef | undefined;

  // 1. Ally Protection: a share of the blow moves to the protector.
  const protection = findByEngineType(target, 'allyProtection', ctx.rules.statuses);
  if (protection && !meta.trueDamage) {
    const protectorRef = protection.instance.source;
    const protector = protectorRef
      ? unitAt(ctx.state.allies, ctx.state.enemies, protectorRef)
      : undefined;
    if (protector && protector.alive && protector !== target) {
      const share = clamp((protection.def.params.ratio ?? 0) / 100, 0, 1);
      const moved = Math.round(remaining * share);
      if (moved > 0) {
        remaining -= moved;
        applyToUnit(ctx, source, protector, moved, { ...meta, redirectedFrom: target.ref });
      }
    }
  }

  const gross = remaining;
  const result = applyToUnit(ctx, source, target, remaining, { ...meta, redirectedFrom });
  return { hpLost: result, gross, trueDamage: meta.trueDamage === true };
}

/** Shields, unkillable, the damage event, death — the part that actually touches HP. */
function applyToUnit(
  ctx: Ctx,
  source: BattleUnit,
  target: BattleUnit,
  amount: number,
  meta: {
    quality: HitQuality;
    crit: boolean;
    hitIndex: number;
    hits: number;
    trueDamage?: boolean;
    redirectedFrom?: UnitRef;
  },
): number {
  let remaining = amount;
  let absorbed = 0;

  // 2a. A boss's hit-counter shield eats the blow whole and loses one count for it.
  // Only real hits register: a DoT tick is not a hit, so poison chips through the shield
  // without ever breaking it — the slow way in, next to the fast one (§8).
  if (!meta.trueDamage && shieldStanding(target)) {
    const left = absorbHit(target);
    emit(ctx, {
      type: 'damage',
      source: source.ref,
      target: target.ref,
      amount: 0,
      absorbed: remaining,
      quality: meta.quality,
      crit: meta.crit,
      hitIndex: meta.hitIndex,
      hits: meta.hits,
      remainingHp: target.hp,
      ...(meta.redirectedFrom ? { redirectedFrom: meta.redirectedFrom } : {}),
    });
    emit(ctx, { type: 'bossShield', unit: target.ref, hits: left, up: left > 0 });
    return 0;
  }

  // 2b. Shields soak before HP, and vanish when spent.
  for (let index = target.buffs.length - 1; index >= 0 && remaining > 0; index -= 1) {
    const instance = target.buffs[index]!;
    if (ctx.rules.statuses.get(instance.key)?.engineType !== 'shield') continue;
    const pool = instance.shield ?? 0;
    const taken = Math.min(pool, remaining);
    instance.shield = pool - taken;
    absorbed += taken;
    remaining -= taken;
    if (instance.shield <= 0) {
      target.buffs.splice(index, 1);
      emit(ctx, { type: 'statusRemoved', target: target.ref, status: instance.key, by: 'broken' });
    }
  }

  // 3. Unkillable floors HP at 1 rather than preventing the hit.
  const unkillable = findByEngineType(target, 'unkillable', ctx.rules.statuses);
  if (unkillable && remaining >= target.hp) {
    remaining = Math.max(0, target.hp - 1);
    emit(ctx, { type: 'unkillable', unit: target.ref });
  }

  target.hp = Math.max(0, target.hp - remaining);

  emit(ctx, {
    type: 'damage',
    source: source.ref,
    target: target.ref,
    amount: remaining,
    absorbed,
    quality: meta.quality,
    crit: meta.crit,
    hitIndex: meta.hitIndex,
    hits: meta.hits,
    remainingHp: target.hp,
    ...(meta.redirectedFrom ? { redirectedFrom: meta.redirectedFrom } : {}),
    ...(meta.trueDamage ? { trueDamage: true } : {}),
  });

  if (remaining > 0) {
    for (const key of breakOnDamage(target, ctx.rules.statuses)) {
      emit(ctx, { type: 'statusRemoved', target: target.ref, status: key, by: 'broken' });
    }
  }

  if (target.hp <= 0 && target.alive) {
    target.alive = false;
    emit(ctx, { type: 'died', unit: target.ref });
  }
  return remaining;
}

function heal(ctx: Ctx, source: BattleUnit | null, target: BattleUnit, amount: number): number {
  if (!target.alive || amount <= 0) return 0;
  const scaled = Math.round(amount * healReceivedMultiplier(target, ctx.rules.statuses));
  const healed = Math.min(scaled, target.maxHp - target.hp);
  if (healed <= 0) return 0;
  target.hp += healed;
  emit(ctx, {
    type: 'heal',
    source: source?.ref ?? null,
    target: target.ref,
    amount: healed,
    remainingHp: target.hp,
  });
  return healed;
}

/**
 * Everything that fires because a unit was struck: lifesteal, Leech, Reflect, counters.
 *
 * Kept in one place so every damage source — a skill, a counterattack, a reflected hit —
 * triggers them identically.
 */
function onDamageDealt(
  ctx: Ctx,
  attacker: BattleUnit,
  target: BattleUnit,
  dealt: DealtDamage,
  options: { allowCounter: boolean },
): void {
  if (dealt.gross <= 0) return;

  // Vampiric heals the attacker; Leech heals whoever is attacking its holder.
  const vampiric = findByEngineType(attacker, 'lifesteal', ctx.rules.statuses);
  if (vampiric && ctx.rules.statuses.get(vampiric.instance.key)?.kind === 'buff') {
    heal(
      ctx,
      attacker,
      attacker,
      Math.round((dealt.hpLost * (vampiric.def.params.ratio ?? 0)) / 100),
    );
  }
  const leech = findByEngineType(target, 'lifesteal', ctx.rules.statuses);
  if (leech && ctx.rules.statuses.get(leech.instance.key)?.kind === 'debuff') {
    heal(ctx, attacker, attacker, Math.round((dealt.hpLost * (leech.def.params.ratio ?? 0)) / 100));
  }

  // Reflect computes off the pre-shield number, so a shielded holder still punishes.
  const reflect = findByEngineType(target, 'reflectDamage', ctx.rules.statuses);
  if (reflect && attacker.alive) {
    const back = Math.round((dealt.gross * (reflect.def.params.ratio ?? 0)) / 100);
    if (back > 0) {
      emit(ctx, { type: 'reflected', unit: target.ref, target: attacker.ref, amount: back });
      dealDamage(ctx, target, attacker, back, {
        quality: 'normal',
        crit: false,
        hitIndex: 0,
        hits: 1,
        trueDamage: true,
      });
    }
  }

  // Neither of the two swing-back rules may chain: a retaliation that provoked another
  // retaliation would loop until the turn cap.
  if (!options.allowCounter || !target.alive || !attacker.alive) return;

  // A boss punishing the band it just fell through. Checked before Counterattack because
  // it is the boss's own mechanic rather than a status somebody put on it.
  if (retaliateForBands(ctx, target, attacker, dealt)) return;

  // Counterattack: the holder swings its A1 back.
  const counter = findByEngineType(target, 'counterattack', ctx.rules.statuses);
  if (!counter) return;

  const a1 = firstSkillOf(ctx, target, 'a1');
  if (!a1) return;

  emit(ctx, { type: 'counterattack', unit: target.ref, target: attacker.ref });
  executeSkill(ctx, target, a1, [attacker], {
    damageScale: (counter.def.params.ratio ?? 100) / 100,
    allowCounter: false,
  });
}

function firstSkillOf(ctx: Ctx, unit: BattleUnit, slot: string): SkillDef | undefined {
  const key = unit.skills.find((entry) => ctx.rules.skills.get(entry)?.slot === slot);
  return key ? ctx.rules.skills.get(key) : undefined;
}

/**
 * The Ice-Golem answer: fall through an HP band, take one back.
 *
 * Returns whether it fired, so the ordinary Counterattack rule does not also run — a boss
 * hitting back twice for the same blow would read as a bug rather than a mechanic.
 */
function retaliateForBands(
  ctx: Ctx,
  boss: BattleUnit,
  attacker: BattleUnit,
  dealt: DealtDamage,
): boolean {
  const rule = boss.isBoss ? boss.boss.thresholdRetaliation : undefined;
  if (!rule) return false;
  if (rule.skipIfDot && dealt.trueDamage) return false;

  const owed = bandsCrossed(boss);
  if (owed <= 0) return false;

  const a1 = firstSkillOf(ctx, boss, 'a1');
  if (!a1) return false;

  for (let index = 0; index < owed && attacker.alive && boss.alive; index += 1) {
    emit(ctx, { type: 'bossRetaliate', unit: boss.ref, target: attacker.ref });
    executeSkill(ctx, boss, a1, [attacker], { allowCounter: false });
  }
  return true;
}

// ── Skill execution ─────────────────────────────────────────────────────────

interface ExecuteOptions {
  /** Counterattacks land at a fraction of normal damage. */
  damageScale?: number;
  allowCounter?: boolean;
}

function conditionHolds(
  condition: NonNullable<EffectComponent['condition']>,
  caster: BattleUnit,
  target: BattleUnit,
  ctx: Ctx,
): boolean {
  switch (condition.type) {
    case 'targetHasStatus':
      return [...target.buffs, ...target.debuffs].some((s) => s.key === condition.status);
    case 'targetMissingStatus':
      return ![...target.buffs, ...target.debuffs].some((s) => s.key === condition.status);
    case 'selfHpBelow':
      return (caster.hp / caster.maxHp) * 100 < condition.pct;
    case 'targetHpBelow':
      return (target.hp / target.maxHp) * 100 < condition.pct;
    case 'alliesDead': {
      const { own } = sides(ctx, caster);
      return own.filter((unit) => !unit.alive).length >= condition.atLeast;
    }
    default:
      return true;
  }
}

function scaleValue(unit: BattleUnit, scale: string, mult: number, ctx: Ctx): number {
  switch (scale) {
    case 'def':
      return effectiveStat(unit, 'def', ctx.rules.statuses) * mult;
    case 'maxHp':
      return unit.maxHp * mult;
    case 'spd':
      return effectiveStat(unit, 'spd', ctx.rules.statuses) * mult;
    case 'atk':
    default:
      return effectiveStat(unit, 'atk', ctx.rules.statuses) * mult;
  }
}

/** Rolls the ACC-vs-RES contest for an enemy-targeted debuff. */
function debuffLands(ctx: Ctx, caster: BattleUnit, target: BattleUnit, def: StatusDef): boolean {
  const accuracy = effectiveStat(caster, 'acc', ctx.rules.statuses);
  const resistance = effectiveStat(target, 'res', ctx.rules.statuses);
  let chance = landChance(accuracy, resistance, ctx.config);

  // Arena only: stacking hard CC on one unit gets progressively harder (§7).
  if (ctx.state.mode === 'arena' && isHardCc(def)) {
    chance = Math.max(
      ctx.config.accuracyMinLandChance,
      chance - target.ccStreak * ctx.config.arenaCcDiminishing,
    );
  }
  return ctx.rng.chance(chance);
}

function runComponent(
  ctx: Ctx,
  caster: BattleUnit,
  component: EffectComponent,
  hitTargets: BattleUnit[],
  options: ExecuteOptions,
): void {
  const { own, foes } = sides(ctx, caster);
  const allies = caster.ref.side === 'ally' ? own : foes;
  const enemies = caster.ref.side === 'ally' ? foes : own;

  if (component.type === 'damage') {
    const hits = component.hits;
    for (const target of hitTargets) {
      if (!target.alive) continue;
      const matchup: Matchup = matchupOf(caster.element, target.element);
      for (let hitIndex = 0; hitIndex < hits; hitIndex += 1) {
        if (!target.alive) break;
        if (component.condition && !conditionHolds(component.condition, caster, target, ctx))
          continue;
        if (component.chance !== undefined && !ctx.rng.chance(component.chance)) continue;

        const quality = rollHitQuality(matchup, ctx.rng, ctx.config);
        const raw =
          scaleValue(caster, component.scale, component.mult, ctx) *
          (options.damageScale ?? 1) *
          // An enraged boss hits harder every turn it is left standing.
          (caster.isBoss ? enrageMultiplier(caster, ctx.state.turn) : 1);
        const { amount, crit } = computeDamage(
          {
            attacker: caster,
            defender: target,
            raw,
            quality,
            matchup,
            ignoreDefPct: component.ignoreDefPct,
          },
          ctx.rules.statuses,
          ctx.rng,
          ctx.config,
        );
        const dealt = dealDamage(ctx, caster, target, amount, { quality, crit, hitIndex, hits });
        onDamageDealt(ctx, caster, target, dealt, {
          allowCounter: options.allowCounter !== false,
        });
      }
    }
    return;
  }

  if (component.type === 'applyStatus') {
    const def = ctx.rules.statuses.get(component.status);
    if (!def) return; // Publish validation rejects this; belt and braces at runtime.
    const targets = componentTargets(
      component.target,
      caster,
      hitTargets,
      allies,
      enemies,
      ctx.rng,
    );

    for (const target of targets) {
      if (!target.alive) continue;
      if (component.condition && !conditionHolds(component.condition, caster, target, ctx))
        continue;
      if (component.chance !== undefined && !ctx.rng.chance(component.chance)) continue;

      // Only enemy-targeted debuffs contest; buffs and self/ally effects never do.
      const hostile = def.kind === 'debuff' && target.ref.side !== caster.ref.side;
      if (hostile && !debuffLands(ctx, caster, target, def)) {
        emit(ctx, {
          type: 'statusResisted',
          source: caster.ref,
          target: target.ref,
          status: def.key,
          reason: 'resist',
        });
        target.ccStreak = 0;
        continue;
      }

      const outcome = applyStatus(
        target,
        def,
        component.turns,
        caster.ref,
        ctx.rules.statuses,
        ctx.config,
      );
      if (!outcome.applied) {
        emit(ctx, {
          type: 'statusResisted',
          source: caster.ref,
          target: target.ref,
          status: def.key,
          reason: outcome.reason,
        });
        continue;
      }
      if (hostile && isHardCc(def)) target.ccStreak += 1;
      emit(ctx, {
        type: 'statusApplied',
        source: caster.ref,
        target: target.ref,
        status: def.key,
        turns: outcome.instance.turns,
        stacks: outcome.instance.stacks,
      });
    }
    return;
  }

  if (component.type === 'heal') {
    const targets = componentTargets(
      component.target,
      caster,
      hitTargets,
      allies,
      enemies,
      ctx.rng,
    );
    const amount = Math.round(scaleValue(caster, component.scale, component.mult, ctx));
    for (const target of targets) {
      if (component.condition && !conditionHolds(component.condition, caster, target, ctx))
        continue;
      if (component.chance !== undefined && !ctx.rng.chance(component.chance)) continue;
      heal(ctx, caster, target, amount);
    }
    return;
  }

  if (component.type === 'shield') {
    const def = ctx.rules.statuses.get('shield');
    if (!def) return;
    const targets = componentTargets(
      component.target,
      caster,
      hitTargets,
      allies,
      enemies,
      ctx.rng,
    );
    const amount = Math.round(scaleValue(caster, component.scale, component.mult, ctx));
    for (const target of targets) {
      if (!target.alive) continue;
      if (component.condition && !conditionHolds(component.condition, caster, target, ctx))
        continue;
      const outcome = applyStatus(
        target,
        def,
        component.turns,
        caster.ref,
        ctx.rules.statuses,
        ctx.config,
      );
      if (!outcome.applied) continue;
      // A refreshed shield takes the larger pool rather than adding to it.
      outcome.instance.shield = Math.max(outcome.instance.shield ?? 0, amount);
      emit(ctx, { type: 'shieldGained', target: target.ref, amount, turns: component.turns });
    }
    return;
  }

  if (component.type === 'turnMeter') {
    const targets = componentTargets(
      component.target,
      caster,
      hitTargets,
      allies,
      enemies,
      ctx.rng,
    );
    for (const target of targets) {
      if (!target.alive) continue;
      if (component.condition && !conditionHolds(component.condition, caster, target, ctx))
        continue;
      if (component.chance !== undefined && !ctx.rng.chance(component.chance)) continue;

      const hostile = target.ref.side !== caster.ref.side;
      // Depletion is a debuff-class effect: it contests, and some bosses ignore it.
      if (hostile && component.deltaPct < 0) {
        if (target.isBoss && target.boss.tmReductionImmune) {
          emit(ctx, {
            type: 'statusResisted',
            source: caster.ref,
            target: target.ref,
            status: 'turnMeter',
            reason: 'immune',
          });
          continue;
        }
        const accuracy = effectiveStat(caster, 'acc', ctx.rules.statuses);
        const resistance = effectiveStat(target, 'res', ctx.rules.statuses);
        if (!ctx.rng.chance(landChance(accuracy, resistance, ctx.config))) {
          emit(ctx, {
            type: 'statusResisted',
            source: caster.ref,
            target: target.ref,
            status: 'turnMeter',
            reason: 'resist',
          });
          continue;
        }
      }
      applyTurnMeter(target, component.deltaPct);
      emit(ctx, {
        type: 'turnMeter',
        source: caster.ref,
        target: target.ref,
        deltaPct: component.deltaPct,
        value: target.tm,
      });
    }
    return;
  }

  if (component.type === 'cleanse' || component.type === 'dispel') {
    const targets = componentTargets(
      component.target,
      caster,
      hitTargets,
      allies,
      enemies,
      ctx.rng,
    );
    const removing = component.type === 'cleanse' ? 'debuffs' : 'buffs';
    for (const target of targets) {
      if (!target.alive) continue;
      if (component.condition && !conditionHolds(component.condition, caster, target, ctx))
        continue;
      const bar = target[removing];
      const count = component.count === 'all' ? bar.length : Math.min(component.count, bar.length);
      for (let index = 0; index < count; index += 1) {
        const instance = bar[0];
        if (!instance) break;
        removeStatus(target, instance.key);
        emit(ctx, {
          type: 'statusRemoved',
          target: target.ref,
          status: instance.key,
          by: component.type === 'cleanse' ? 'cleanse' : 'dispel',
        });
      }
    }
    return;
  }

  if (component.type === 'extraTurn') {
    if (component.chance !== undefined && !ctx.rng.chance(component.chance)) return;
    // Filling the bar is how an extra turn happens: the unit simply acts again next.
    applyTurnMeter(caster, 100);
    emit(ctx, { type: 'extraTurn', unit: caster.ref });
    return;
  }

  if (component.type === 'cooldown') {
    const targets = componentTargets(
      component.target,
      caster,
      hitTargets,
      allies,
      enemies,
      ctx.rng,
    );
    for (const target of targets) {
      if (!target.alive) continue;
      if (component.chance !== undefined && !ctx.rng.chance(component.chance)) continue;
      for (const key of target.skills) {
        const definition = ctx.rules.skills.get(key);
        if (!definition || definition.slot === 'a1' || definition.slot === 'passive') continue;
        const current = target.cooldowns[key] ?? 0;
        const next = clamp(current + component.delta, 0, definition.cooldown);
        if (next === current) continue;
        target.cooldowns[key] = next;
        emit(ctx, { type: 'cooldownChanged', unit: target.ref, skill: key, value: next });
      }
    }
  }
}

function executeSkill(
  ctx: Ctx,
  caster: BattleUnit,
  skill: SkillDef,
  targets: BattleUnit[],
  options: ExecuteOptions = {},
): void {
  emit(ctx, {
    type: 'skillUsed',
    unit: caster.ref,
    skill: skill.key,
    targets: targets.map((unit) => unit.ref),
  });
  for (const component of skill.components) {
    runComponent(ctx, caster, component, targets, options);
  }
}

// ── Turn flow ───────────────────────────────────────────────────────────────

/** Poison, HP Burn and Continuous Heal all resolve here, at the holder's turn start. */
function runStartOfTurnTicks(ctx: Ctx, unit: BattleUnit): void {
  for (const { instance, def } of tickingStatuses(unit, 'ownerTurnStart', ctx.rules.statuses)) {
    if (!unit.alive) break;
    const source = instance.source
      ? unitAt(ctx.state.allies, ctx.state.enemies, instance.source)
      : null;

    if (def.engineType === 'damageOverTime') {
      const amount = Math.round((unit.maxHp * (def.params.tickPct ?? 0) * instance.stacks) / 100);
      applyToUnit(ctx, source ?? unit, unit, amount, {
        quality: 'normal',
        crit: false,
        hitIndex: 0,
        hits: 1,
        trueDamage: true,
      });

      // HP Burn splashes onto the burning unit's own allies.
      if (def.key === 'hp_burn') {
        const { own } = sides(ctx, unit);
        const splash = Math.round((unit.maxHp * ctx.config.hpBurnSplashPct) / 100);
        for (const ally of living(own)) {
          if (ally === unit) continue;
          applyToUnit(ctx, source ?? unit, ally, splash, {
            quality: 'normal',
            crit: false,
            hitIndex: 0,
            hits: 1,
            trueDamage: true,
          });
        }
      }
    }

    if (def.engineType === 'healOverTime') {
      heal(ctx, source ?? null, unit, Math.round((unit.maxHp * (def.params.tickPct ?? 0)) / 100));
    }
  }
}

/**
 * What a boss does simply by reaching its turn.
 *
 * Runs before it chooses a skill, so the punish, the adds and the ramp are all things the
 * player watches happen *to* them rather than consequences of a skill they might dodge.
 *
 * Returns true when the boss forfeits the turn entirely — the reward for breaking a
 * hit-counter shield.
 */
function runBossTurnStart(ctx: Ctx, unit: BattleUnit): boolean {
  if (!unit.isBoss) return false;
  bossRuntime(unit);

  // The shield cycle, and the whole of the Cinderspire's puzzle. Reach the boss's turn
  // with it intact and the team is punished; break it first and the boss forfeits the turn
  // and stays hurtable through it, until it recovers on the turn after.
  const shield = unit.boss.hitShield;
  switch (shieldPhase(unit)) {
    case 'punish': {
      emit(ctx, { type: 'bossPunish', unit: unit.ref, tmPct: shield?.punishTmPct ?? 0 });
      const { foes } = sides(ctx, unit);
      for (const foe of living(foes)) {
        applyTurnMeter(foe, -(shield?.punishTmPct ?? 0));
        emit(ctx, {
          type: 'turnMeter',
          source: unit.ref,
          target: foe.ref,
          deltaPct: -(shield?.punishTmPct ?? 0),
          value: foe.tm,
        });
      }
      break;
    }
    case 'expose': {
      emit(ctx, { type: 'bossExposed', unit: unit.ref });
      return true;
    }
    case 'restore': {
      const restored = resetShield(unit);
      emit(ctx, { type: 'bossShield', unit: unit.ref, hits: restored, up: restored > 0 });
      break;
    }
    default:
      break;
  }

  // Adds, up to what the cap still has room for.
  const summon = unit.boss.addSummon;
  if (summon) {
    const { own } = sides(ctx, unit);
    const slots = freeSlots(own, summonAllowance(unit, own));
    const arrived: BattleUnit[] = [];
    for (const slot of slots) {
      const add = instantiateAdd(summon.template, { side: unit.ref.side, slot });
      const existing = own.findIndex((other) => other.ref.slot === slot);
      if (existing >= 0) own[existing] = add;
      else own.push(add);
      arrived.push(add);
    }
    if (arrived.length > 0) {
      emit(ctx, { type: 'bossSummon', unit: unit.ref, summoned: arrived.map(snapshot) });
    }
  }

  if (shouldAnnounceEnrage(unit, ctx.state.turn)) {
    emit(ctx, {
      type: 'bossEnraged',
      unit: unit.ref,
      pct: Math.round((enrageMultiplier(unit, ctx.state.turn) - 1) * 100),
    });
  }
  return false;
}

function endTurn(ctx: Ctx, unit: BattleUnit): void {
  for (const key of tickDurations(unit)) {
    emit(ctx, { type: 'statusExpired', target: unit.ref, status: key });
  }
  for (const key of Object.keys(unit.cooldowns)) {
    if (unit.cooldowns[key]! > 0) unit.cooldowns[key]! -= 1;
  }
  ctx.state.turn += 1;
}

/**
 * Opens a unit's turn: spends the meter and resolves start-of-turn ticks.
 *
 * Split from the acting half because manual play pauses between them. A unit that dies
 * to its own Poison, or that is stunned, never reaches the acting half at all — which is
 * why the pause must come after this, not before it. Awaiting an action from a stunned
 * unit would leave the client with a skill bar it cannot use.
 */
function beginTurn(ctx: Ctx, unit: BattleUnit): 'dead' | 'skipped' | 'ready' {
  emit(ctx, { type: 'turnStart', unit: unit.ref, turn: ctx.state.turn });
  consumeTurn(unit);

  runStartOfTurnTicks(ctx, unit);
  if (!unit.alive) {
    ctx.state.turn += 1;
    return 'dead';
  }

  const skipped = skipReason(unit, ctx.rules.statuses);
  if (skipped) {
    emit(ctx, { type: 'turnSkipped', unit: unit.ref, reason: skipped });
    endTurn(ctx, unit);
    return 'skipped';
  }

  if (runBossTurnStart(ctx, unit)) {
    endTurn(ctx, unit);
    return 'skipped';
  }
  return 'ready';
}

/** The acting half: choose a skill, resolve it, then close the turn. */
function actAndEndTurn(ctx: Ctx, unit: BattleUnit, action?: BattleAction): void {
  const { own, foes } = sides(ctx, unit);
  const allies = unit.ref.side === 'ally' ? own : foes;
  const enemies = unit.ref.side === 'ally' ? foes : own;

  let skill: SkillDef | undefined;
  let explicit: UnitRef | undefined;

  if (action) {
    const chosen = ctx.rules.skills.get(action.skill);
    // An illegal manual action falls through to the AI rather than wedging the battle;
    // the route layer rejects it first, so this only guards a corrupted session.
    if (chosen && unit.skills.includes(action.skill) && (unit.cooldowns[action.skill] ?? 0) <= 0) {
      skill = chosen;
      explicit = action.target;
    }
  }

  if (!skill) {
    const choice = chooseSkill(
      unit,
      living(foes),
      ctx.rules.skills,
      ctx.rules.statuses,
      ctx.state.turn === 0,
      ctx.rng,
    );
    skill = choice?.skill;
  }

  if (!skill) {
    endTurn(ctx, unit);
    return;
  }

  const targets = resolveTargets(
    skill,
    unit,
    allies,
    enemies,
    ctx.rules.statuses,
    ctx.rng,
    explicit,
  );
  executeSkill(ctx, unit, skill, targets);

  if (skill.cooldown > 0) {
    unit.cooldowns[skill.key] = skill.cooldown + 1; // +1 because endTurn ticks it immediately.
    emit(ctx, {
      type: 'cooldownChanged',
      unit: unit.ref,
      skill: skill.key,
      value: skill.cooldown + 1,
    });
  }

  endTurn(ctx, unit);
}

// ── Waves and endings ───────────────────────────────────────────────────────

function checkOutcome(ctx: Ctx): boolean {
  const state = ctx.state;

  if (living(state.allies).length === 0) {
    finish(ctx, 'defeat');
    return true;
  }

  if (living(state.enemies).length === 0) {
    if (state.pendingWaves.length > 0) {
      advanceWave(ctx);
      return false;
    }
    finish(ctx, 'victory');
    return true;
  }

  if (state.turn >= ctx.config.maxTurns) {
    finish(ctx, 'turnLimit');
    return true;
  }
  return false;
}

/**
 * Moves to the next wave.
 *
 * Source-faithful (§2): both effect bars clear, cooldowns tick down one, survivors heal a
 * share of max HP, and meters reset so the fastest unit opens. HP and deaths carry over —
 * that persistence is what makes a multi-wave stage a war of attrition.
 */
function advanceWave(ctx: Ctx): void {
  const state = ctx.state;
  emit(ctx, {
    type: 'waveCleared',
    wave: state.wave,
    healed: [],
  });

  const healed: { unit: UnitRef; amount: number }[] = [];
  for (const unit of state.allies) {
    clearAllStatuses(unit);
    for (const key of Object.keys(unit.cooldowns)) {
      if (unit.cooldowns[key]! > 0) unit.cooldowns[key]! -= 1;
    }
    if (!unit.alive) continue;
    const amount = Math.min(
      Math.round((unit.maxHp * ctx.config.waveHealPct) / 100),
      unit.maxHp - unit.hp,
    );
    if (amount > 0) {
      unit.hp += amount;
      healed.push({ unit: unit.ref, amount });
    }
  }

  // Rewrite the event we just pushed now that the heals are known.
  const cleared = ctx.events[ctx.events.length - 1];
  if (cleared && cleared.type === 'waveCleared') cleared.healed = healed;

  state.wave += 1;
  state.enemies = state.pendingWaves.shift() ?? [];
  resetMeters([...state.allies, ...state.enemies]);

  emit(ctx, {
    type: 'waveStart',
    wave: state.wave,
    enemies: state.enemies.map(snapshot),
  });
}

function finish(ctx: Ctx, outcome: BattleState['outcome']): void {
  ctx.state.finished = true;
  ctx.state.outcome = outcome;
  ctx.state.awaiting = null;
  emit(ctx, { type: 'battleEnd', outcome: outcome!, turns: ctx.state.turn });
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface BattleSetup {
  seed: number;
  mode: BattleState['mode'];
  allies: BattleUnit[];
  /** One entry per wave; the first is the wave the battle opens on. */
  waves: BattleUnit[][];
}

/** Builds the opening state and its `battleStart` event. */
export function createBattle(
  setup: BattleSetup,
  rules: BattleRules,
  config: CombatConfig,
): StepResult {
  const [first, ...rest] = setup.waves;
  const state: BattleState = {
    seed: setup.seed,
    rngState: [1, 2, 3, 4],
    mode: setup.mode,
    wave: 0,
    pendingWaves: rest,
    allies: setup.allies,
    enemies: first ?? [],
    turn: 0,
    awaiting: null,
    finished: false,
    outcome: null,
    nextEventId: 0,
  };

  const rng = createRng(setup.seed);
  const ctx: Ctx = { state, rules, config, rng, events: [] };

  resetMeters([...state.allies, ...state.enemies]);
  emit(ctx, {
    type: 'battleStart',
    wave: 0,
    allies: state.allies.map(snapshot),
    enemies: state.enemies.map(snapshot),
  });

  state.rngState = rng.getState();
  return { state, events: ctx.events };
}

/**
 * Runs the battle forward.
 *
 * With `auto` set it plays every turn, both sides, until the fight ends. Without it, the
 * simulation stops as soon as a player unit is due to act and records that unit in
 * `awaiting`, so the client can present the skill bar.
 */
export function advance(
  state: BattleState,
  rules: BattleRules,
  config: CombatConfig,
  options: { auto: boolean; action?: BattleAction } = { auto: true },
): StepResult {
  const rng = createRngFromState(state.rngState);
  const ctx: Ctx = { state, rules, config, rng, events: [] };

  if (state.finished) return { state, events: [] };

  // A pending manual action belongs to whoever the battle was waiting on.
  let pendingAction = options.action;

  // Resume a turn that was already opened before the battle paused. Its meter is spent
  // and its start-of-turn ticks have run, so it only has left to act.
  if (state.awaiting) {
    const resuming = unitAt(state.allies, state.enemies, state.awaiting);
    state.awaiting = null;
    if (resuming?.alive) {
      actAndEndTurn(ctx, resuming, pendingAction);
      pendingAction = undefined;
    }
  }

  for (;;) {
    if (checkOutcome(ctx)) break;

    const units = [...state.allies, ...state.enemies];
    const next = advanceToNextActor(units, rules.statuses, config, prioritySide(state));
    if (!next) {
      finish(ctx, 'turnLimit');
      break;
    }

    const phase = beginTurn(ctx, next.unit);
    if (phase !== 'ready') {
      if (checkOutcome(ctx)) break;
      continue;
    }

    // Only pause once the unit has genuinely reached the point of choosing an action.
    const isPlayerUnit = next.unit.ref.side === 'ally';
    if (isPlayerUnit && !options.auto && !pendingAction) {
      state.awaiting = next.unit.ref;
      break;
    }

    const action = isPlayerUnit ? pendingAction : undefined;
    pendingAction = undefined;

    actAndEndTurn(ctx, next.unit, action);

    if (checkOutcome(ctx)) break;
  }

  state.rngState = rng.getState();
  return { state, events: ctx.events };
}

/** Ends the battle early at the player's request. */
export function retreat(state: BattleState, rules: BattleRules, config: CombatConfig): StepResult {
  if (state.finished) return { state, events: [] };
  const ctx: Ctx = {
    state,
    rules,
    config,
    rng: createRngFromState(state.rngState),
    events: [],
  };
  finish(ctx, 'retreat');
  return { state, events: ctx.events };
}
