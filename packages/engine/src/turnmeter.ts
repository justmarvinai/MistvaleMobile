import type { StatusDef } from '@mistvale/shared';
import type { CombatConfig } from './config';
import { clamp, effectiveStat } from './stats';
import type { BattleUnit, Side, UnitRef } from './types';

/**
 * Turn meter.
 *
 * Every unit fills a 0–100 bar at `SPD × turnMeterPerTick` per tick and acts on reaching
 * 100, keeping the overflow. Simulating tick by tick would be correct but wasteful — a
 * slow unit can need hundreds of ticks — so the engine solves for the next actor
 * directly: work out how many ticks each living unit needs, take the smallest, and jump
 * the whole battle forward by exactly that much (COMBAT_SYSTEM §3).
 *
 * Jumping in whole ticks (rather than fractional time) is what preserves source-faithful
 * behaviour: two units that would reach 100 on the same tick genuinely tie, and the tie
 * is broken by the documented order rather than by floating-point noise.
 */

const FULL_BAR = 100;

/** Ticks this unit still needs to reach a full bar. */
function ticksToAct(
  unit: BattleUnit,
  statuses: ReadonlyMap<string, StatusDef>,
  config: CombatConfig,
): number {
  const speed = effectiveStat(unit, 'spd', statuses);
  const perTick = speed * config.turnMeterPerTick;
  // A unit at zero effective speed never acts. Guard rather than divide by zero.
  if (perTick <= 0) return Number.POSITIVE_INFINITY;
  return Math.ceil((FULL_BAR - unit.tm) / perTick);
}

export interface NextActor {
  unit: BattleUnit;
  /** Ticks the battle advanced to get here. */
  ticks: number;
}

/**
 * Advances every living unit's meter until at least one can act, and returns that unit.
 *
 * Ties break the documented way (§3): highest meter first, then the priority side, then
 * the lower slot. `prioritySide` is the attacker's team, except in the Arena where the
 * defender wins ties.
 */
export function advanceToNextActor(
  units: readonly BattleUnit[],
  statuses: ReadonlyMap<string, StatusDef>,
  config: CombatConfig,
  prioritySide: Side,
): NextActor | null {
  const living = units.filter((unit) => unit.alive);
  if (living.length === 0) return null;

  let ticks = Number.POSITIVE_INFINITY;
  for (const unit of living) {
    ticks = Math.min(ticks, ticksToAct(unit, statuses, config));
  }
  if (!Number.isFinite(ticks)) return null; // Nobody can ever act; caller ends the battle.

  for (const unit of living) {
    const speed = effectiveStat(unit, 'spd', statuses);
    unit.tm = unit.tm + speed * config.turnMeterPerTick * ticks;
  }

  const ready = living
    .filter((unit) => unit.tm >= FULL_BAR)
    .sort((a, b) => compareForTurnOrder(a, b, prioritySide));

  const actor = ready[0];
  if (!actor) return null;
  return { unit: actor, ticks };
}

/** The documented tie-break, exposed so the turn-order strip can show the same order. */
export function compareForTurnOrder(a: BattleUnit, b: BattleUnit, prioritySide: Side): number {
  if (b.tm !== a.tm) return b.tm - a.tm;
  if (a.ref.side !== b.ref.side) return a.ref.side === prioritySide ? -1 : 1;
  return a.ref.slot - b.ref.slot;
}

/** Spends a full bar after acting, keeping any overflow. */
export function consumeTurn(unit: BattleUnit): void {
  unit.tm = Math.max(0, unit.tm - FULL_BAR);
}

/**
 * Applies an instant turn-meter change.
 *
 * Boosts and depletions are percentages of a whole bar. A depletion below zero is simply
 * a reset — meters never go negative — and a boost can carry a unit past 100, which is
 * exactly how a well-timed boost steals a turn.
 */
export function applyTurnMeter(unit: BattleUnit, deltaPct: number): number {
  const before = unit.tm;
  unit.tm = Math.max(0, unit.tm + deltaPct);
  return unit.tm - before;
}

/** Everyone starts empty; the fastest unit therefore opens the wave. */
export function resetMeters(units: readonly BattleUnit[]): void {
  for (const unit of units) unit.tm = 0;
}

/**
 * The projected turn order, for the client's turn-order strip.
 *
 * Purely informational: it re-derives the same comparison the simulation uses, without
 * touching state, so what the player sees matches what happens.
 */
export function projectTurnOrder(
  units: readonly BattleUnit[],
  statuses: ReadonlyMap<string, StatusDef>,
  config: CombatConfig,
  prioritySide: Side,
  count = 8,
): UnitRef[] {
  const projection = units
    .filter((unit) => unit.alive)
    .map((unit) => ({
      ref: unit.ref,
      side: unit.ref.side,
      slot: unit.ref.slot,
      tm: unit.tm,
      perTick: effectiveStat(unit, 'spd', statuses) * config.turnMeterPerTick,
    }))
    .filter((entry) => entry.perTick > 0);

  const order: UnitRef[] = [];
  while (order.length < count && projection.length > 0) {
    let soonest = Number.POSITIVE_INFINITY;
    for (const entry of projection) {
      soonest = Math.min(soonest, Math.ceil((FULL_BAR - entry.tm) / entry.perTick));
    }
    if (!Number.isFinite(soonest)) break;

    for (const entry of projection) entry.tm += entry.perTick * soonest;

    const ready = projection
      .filter((entry) => entry.tm >= FULL_BAR)
      .sort((a, b) => {
        if (b.tm !== a.tm) return b.tm - a.tm;
        if (a.side !== b.side) return a.side === prioritySide ? -1 : 1;
        return a.slot - b.slot;
      });

    for (const entry of ready) {
      if (order.length >= count) break;
      order.push(entry.ref);
      entry.tm = clamp(entry.tm - FULL_BAR, 0, FULL_BAR);
    }
  }
  return order;
}
