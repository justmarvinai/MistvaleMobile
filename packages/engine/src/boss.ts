import type { BattleUnit, BossRuntime, UnitRef } from './types';

/**
 * Boss mechanics.
 *
 * A boss is not a big lizard with more HP — it is a puzzle with a stated answer, and the
 * four behaviours here are those answers made mechanical (docs/COMBAT_SYSTEM.md §8):
 *
 *  - **Hit shield** — damage is worthless until the counter is emptied, so the answer is
 *    *hit count*, not hit size: multi-hit kits and cheap A1s beat one enormous nuke.
 *  - **Threshold retaliation** — the boss swings back every time its HP falls through a
 *    band, so the answer is *pacing*: burst it down in fewer, larger steps.
 *  - **Add summoning** — the fight widens if it is ignored, so the answer is *AoE*.
 *  - **Enrage** — the fight gets lethal after a while, so the answer is *a clock*.
 *
 * This module owns only the arithmetic and the bookkeeping. Emitting events and touching
 * HP stay in `battle.ts`, which is the one place allowed to mutate the fight.
 */

export function bossRuntime(unit: BattleUnit): BossRuntime | undefined {
  if (!unit.isBoss) return undefined;
  unit.bossState ??= {
    shieldHits: unit.boss.hitShield?.hits ?? 0,
    shieldRecovering: false,
    bandsPassed: 0,
    enraged: false,
  };
  return unit.bossState;
}

/** Whether the unit's hit-counter shield is currently absorbing. */
export function shieldStanding(unit: BattleUnit): boolean {
  if (!unit.isBoss || !unit.boss.hitShield) return false;
  return (bossRuntime(unit)?.shieldHits ?? 0) > 0;
}

/**
 * Records one hit against the shield.
 *
 * Returns what is left. A hit is a hit regardless of its size, which is the whole point:
 * the counter is the boss's actual health bar until it empties. Counts **persist across
 * the boss's turns** — a shield that reset every cycle would make the mechanic unbeatable
 * for any team without a five-hit kit, which is not the puzzle it is meant to be.
 */
export function absorbHit(unit: BattleUnit): number {
  const runtime = bossRuntime(unit);
  if (!runtime) return 0;
  runtime.shieldHits = Math.max(0, runtime.shieldHits - 1);
  return runtime.shieldHits;
}

/** Puts the shield back up. Returns the count it was restored to. */
export function resetShield(unit: BattleUnit): number {
  const runtime = bossRuntime(unit);
  const hits = unit.boss.hitShield?.hits ?? 0;
  if (runtime) {
    runtime.shieldHits = hits;
    runtime.shieldRecovering = false;
  }
  return hits;
}

/**
 * What the boss does about its shield on reaching its turn.
 *
 * Three states, and each is one beat of the loop the Cinderspire is built on:
 *  - `punish` — the shield still stands, so the team pays for being slow. Progress on the
 *    counter is kept, which is what makes chipping at it worthwhile.
 *  - `expose` — it was broken in time: the boss forfeits this turn, and stays hurtable
 *    right through it.
 *  - `restore` — it has finished reeling, and the counter goes back to full.
 */
export function shieldPhase(unit: BattleUnit): 'punish' | 'expose' | 'restore' | 'none' {
  const runtime = bossRuntime(unit);
  if (!unit.boss.hitShield || !runtime) return 'none';
  if (runtime.shieldHits > 0) return 'punish';
  if (runtime.shieldRecovering) return 'restore';
  runtime.shieldRecovering = true;
  return 'expose';
}

/**
 * How many HP bands the boss has newly fallen through.
 *
 * Bands are counted from full HP downwards, so a single enormous hit that crosses three of
 * them owes three retaliations rather than one — otherwise burst would dodge the mechanic
 * entirely, and the mechanic exists to make burst think.
 */
export function bandsCrossed(unit: BattleUnit): number {
  const rule = unit.boss.thresholdRetaliation;
  const runtime = bossRuntime(unit);
  if (!rule || !runtime || unit.maxHp <= 0) return 0;

  const lost = Math.max(0, unit.maxHp - unit.hp);
  const reached = Math.floor((lost / unit.maxHp) * (100 / rule.perHpPct));
  const owed = reached - runtime.bandsPassed;
  if (owed <= 0) return 0;
  runtime.bandsPassed = reached;
  return owed;
}

/**
 * The lowest slots adds may take on the boss's side.
 *
 * A slot held by a living unit is taken; one held by a corpse may be reused, because a ref
 * only has to be unique among the living — the summon event carries a full snapshot, so
 * the client replaces whatever stood there. Without that, a long fight would grow the
 * enemy array forever.
 */
export function freeSlots(side: readonly BattleUnit[], count: number): number[] {
  const taken = new Set(side.filter((unit) => unit.alive).map((unit) => unit.ref.slot));
  const slots: number[] = [];
  for (let slot = 0; slots.length < count; slot += 1) {
    if (!taken.has(slot)) slots.push(slot);
    // A side cannot sprawl indefinitely: past this the summon simply does not fit.
    if (slot > MAX_SIDE_SLOTS) break;
  }
  return slots;
}

/** The widest a side may get. Beyond this a formation stops reading as a formation. */
export const MAX_SIDE_SLOTS = 9;

/** How many adds the boss may call right now, respecting both `perTurn` and `cap`. */
export function summonAllowance(unit: BattleUnit, side: readonly BattleUnit[]): number {
  const rule = unit.boss.addSummon;
  if (!rule) return 0;
  const alive = side.filter(
    (other) => other.alive && other !== unit && other.defKey === rule.template.defKey,
  ).length;
  return Math.max(0, Math.min(rule.perTurn, rule.cap - alive));
}

/** Stamps a fresh copy of the add template into a slot. */
export function instantiateAdd(template: BattleUnit, ref: UnitRef): BattleUnit {
  return {
    ...template,
    ref,
    stats: Object.freeze({ ...template.stats }),
    hp: template.maxHp,
    tm: 0,
    cooldowns: {},
    buffs: [],
    debuffs: [],
    alive: true,
    ccStreak: 0,
  };
}

/**
 * The boss's outgoing damage multiplier at this point in the fight.
 *
 * The ramp is linear from `afterTurn` onward and uncapped by design — a team that cannot
 * finish inside the grace period is meant to lose, and slowly enough to see it coming.
 */
export function enrageMultiplier(unit: BattleUnit, turn: number): number {
  const rule = unit.boss.enrage;
  if (!rule || turn <= rule.afterTurn) return 1;
  return 1 + ((turn - rule.afterTurn) * rule.dmgPctPerTurn) / 100;
}

/** Whether the ramp has just started and still owes the player an announcement. */
export function shouldAnnounceEnrage(unit: BattleUnit, turn: number): boolean {
  const rule = unit.boss.enrage;
  const runtime = bossRuntime(unit);
  if (!rule || !runtime || runtime.enraged) return false;
  if (turn <= rule.afterTurn) return false;
  runtime.enraged = true;
  return true;
}
