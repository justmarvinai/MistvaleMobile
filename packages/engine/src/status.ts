import type { StatusDef } from '@mistvale/shared';
import type { CombatConfig } from './config';
import type { BattleUnit, StatusInstance, UnitRef } from './types';

/**
 * Status effects: applying, stacking, expiring.
 *
 * Two rules do most of the work (COMBAT_SYSTEM §7):
 *
 *  - **Families.** Statuses in the same family compete rather than coexist: a stronger
 *    member replaces a weaker one, an equal member refreshes its duration. That is why
 *    ATK Up 50% and ATK Up 25% never stack, and why applying the weaker one over the
 *    stronger one does nothing.
 *  - **Duration ticks at the end of the holder's turn.** A buff a unit casts on itself
 *    therefore loses a turn immediately, which is deliberate and which the authored kits
 *    already account for.
 *
 * Everything here mutates the unit in place and reports what happened, so the caller can
 * emit the right events without re-deriving them.
 */

export type ApplyOutcome =
  | { applied: true; instance: StatusInstance; replaced: string | null }
  | { applied: false; reason: 'blocked' | 'immune' | 'full' };

const HARD_CC: ReadonlySet<StatusDef['engineType']> = new Set([
  'skipTurn',
  'skipTurnBreakOnDamage',
  'forceTargetA1',
]);

export function isHardCc(def: StatusDef): boolean {
  return HARD_CC.has(def.engineType);
}

function barFor(unit: BattleUnit, def: StatusDef): StatusInstance[] {
  return def.kind === 'buff' ? unit.buffs : unit.debuffs;
}

/**
 * Puts a status on a unit, honouring blocks, immunities, families and the bar cap.
 *
 * The ACC-versus-RES contest happens before this is called — by the time we are here the
 * effect has already earned its place, and only the target's own defences can stop it.
 */
export function applyStatus(
  unit: BattleUnit,
  def: StatusDef,
  turns: number,
  source: UnitRef | null,
  statuses: ReadonlyMap<string, StatusDef>,
  config: CombatConfig,
): ApplyOutcome {
  // Bosses shrug off hard crowd control entirely — the baseline every boss carries.
  if (unit.isBoss && unit.boss.almightyImmunity && isHardCc(def)) {
    return { applied: false, reason: 'immune' };
  }

  // Block Buffs / Block Debuffs stop the matching kind outright.
  const blocker = def.kind === 'buff' ? 'blockBuffs' : 'blockDebuffs';
  for (const instance of [...unit.buffs, ...unit.debuffs]) {
    if (statuses.get(instance.key)?.engineType === blocker) {
      return { applied: false, reason: 'blocked' };
    }
  }

  const bar = barFor(unit, def);

  // Same family: stronger wins, equal refreshes, weaker is ignored.
  const rivalIndex = bar.findIndex((instance) => statuses.get(instance.key)?.family === def.family);
  const rival = rivalIndex >= 0 ? bar[rivalIndex] : undefined;

  if (rival) {
    const rivalDef = statuses.get(rival.key);
    const rivalPotency = rivalDef?.potency ?? 1;

    // Poison is the one stacking family: same key adds a stack instead of refreshing.
    const stacking = def.params.maxStacks > 1 && rival.key === def.key;
    if (stacking) {
      const cap = Math.min(def.params.maxStacks, config.poisonStackCap);
      rival.stacks = Math.min(cap, rival.stacks + 1);
      rival.turns = Math.max(rival.turns, turns);
      return { applied: true, instance: rival, replaced: null };
    }

    if (def.potency < rivalPotency) return { applied: false, reason: 'blocked' };
    if (def.potency === rivalPotency && rival.key === def.key) {
      rival.turns = Math.max(rival.turns, turns);
      return { applied: true, instance: rival, replaced: null };
    }
    // Stronger member: take the slot.
    bar.splice(rivalIndex, 1);
    const instance = newInstance(def, turns, source);
    bar.push(instance);
    return { applied: true, instance, replaced: rival.key };
  }

  if (bar.length >= config.effectBarCap) return { applied: false, reason: 'full' };

  const instance = newInstance(def, turns, source);
  bar.push(instance);
  return { applied: true, instance, replaced: null };
}

function newInstance(def: StatusDef, turns: number, source: UnitRef | null): StatusInstance {
  return { key: def.key, turns, source, stacks: 1 };
}

/** Removes a status by key from whichever bar holds it. */
export function removeStatus(unit: BattleUnit, key: string): boolean {
  for (const bar of [unit.buffs, unit.debuffs]) {
    const index = bar.findIndex((instance) => instance.key === key);
    if (index >= 0) {
      bar.splice(index, 1);
      return true;
    }
  }
  return false;
}

/**
 * Ticks durations at the end of a unit's turn and reports what expired.
 *
 * Shields expire on duration like anything else; a shield whose absorb is exhausted is
 * dropped by the damage path instead, so both routes converge on the same removal event.
 */
export function tickDurations(unit: BattleUnit): string[] {
  const expired: string[] = [];
  for (const bar of [unit.buffs, unit.debuffs]) {
    for (let index = bar.length - 1; index >= 0; index -= 1) {
      const instance = bar[index]!;
      instance.turns -= 1;
      if (instance.turns <= 0) {
        bar.splice(index, 1);
        expired.push(instance.key);
      }
    }
  }
  return expired;
}

/** Every status on a unit whose definition ticks at the given moment. */
export function tickingStatuses(
  unit: BattleUnit,
  when: NonNullable<StatusDef['params']['tick']>,
  statuses: ReadonlyMap<string, StatusDef>,
): { instance: StatusInstance; def: StatusDef }[] {
  const found: { instance: StatusInstance; def: StatusDef }[] = [];
  for (const instance of [...unit.debuffs, ...unit.buffs]) {
    const def = statuses.get(instance.key);
    if (def && def.params.tick === when) found.push({ instance, def });
  }
  return found;
}

/** True when this unit cannot act at all right now. */
export function skipReason(
  unit: BattleUnit,
  statuses: ReadonlyMap<string, StatusDef>,
): 'stun' | 'freeze' | 'sleep' | null {
  for (const instance of unit.debuffs) {
    const def = statuses.get(instance.key);
    if (!def) continue;
    if (def.engineType === 'skipTurn') return instance.key === 'freeze' ? 'freeze' : 'stun';
    if (def.engineType === 'skipTurnBreakOnDamage') return 'sleep';
  }
  return null;
}

/** Sleep breaks the moment the sleeper takes damage. */
export function breakOnDamage(
  unit: BattleUnit,
  statuses: ReadonlyMap<string, StatusDef>,
): string[] {
  const broken: string[] = [];
  for (let index = unit.debuffs.length - 1; index >= 0; index -= 1) {
    const instance = unit.debuffs[index]!;
    if (statuses.get(instance.key)?.engineType === 'skipTurnBreakOnDamage') {
      unit.debuffs.splice(index, 1);
      broken.push(instance.key);
    }
  }
  return broken;
}

/** Who is forcing this unit's targeting, if anyone (Provoke). */
export function provokedBy(
  unit: BattleUnit,
  statuses: ReadonlyMap<string, StatusDef>,
): UnitRef | null {
  for (const instance of unit.debuffs) {
    if (statuses.get(instance.key)?.engineType === 'forceTargetA1') return instance.source;
  }
  return null;
}

/** Wave transitions clear both bars outright (§2). */
export function clearAllStatuses(unit: BattleUnit): void {
  unit.buffs.length = 0;
  unit.debuffs.length = 0;
}
