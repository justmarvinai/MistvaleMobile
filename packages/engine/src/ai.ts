import type { SkillDef, StatusDef } from '@mistvale/shared';
import type { Rng } from './rng';
import type { BattleUnit } from './types';

/**
 * The brain, for enemies and for auto-battle.
 *
 * Deterministic and hint-driven: no per-champion code, no heuristics that content
 * authors cannot see. A kit's behaviour is authored in its `aiHints`, so tuning an
 * enemy is an Admin edit (COMBAT_SYSTEM §12).
 *
 * Priority: a forced opener on the first turn, then the highest-slot skill that is off
 * cooldown and whose hints pass, then the A1 — which is always available because A1s
 * cannot have a cooldown.
 */

export interface SkillChoice {
  skill: SkillDef;
  key: string;
}

/** Whether a skill's hints allow it right now. */
export function hintsAllow(
  skill: SkillDef,
  caster: BattleUnit,
  foes: readonly BattleUnit[],
  statuses: ReadonlyMap<string, StatusDef>,
): boolean {
  const hints = skill.aiHints;

  if (typeof hints.onlyBelowHpPct === 'number') {
    if ((caster.hp / caster.maxHp) * 100 > hints.onlyBelowHpPct) return false;
  }

  // "Don't re-apply what is already running." A skill whose whole job is a debuff should
  // not be spent while every candidate already carries it.
  if (hints.dontRepeatWhileActive) {
    const wanted = hints.dontRepeatWhileActive;
    const pool = skill.targeting.side === 'enemy' ? foes : [caster];
    const candidates = pool.filter((unit) => unit.alive);
    if (candidates.length > 0) {
      const everyoneHasIt = candidates.every((unit) =>
        [...unit.buffs, ...unit.debuffs].some((instance) => {
          if (instance.key === wanted) return true;
          // Family match too, so ATK Down 50% blocks a re-cast of ATK Down 25%.
          const def = statuses.get(instance.key);
          return def?.family === statuses.get(wanted)?.family;
        }),
      );
      if (everyoneHasIt) return false;
    }
  }

  return true;
}

function isReady(unit: BattleUnit, key: string): boolean {
  return (unit.cooldowns[key] ?? 0) <= 0;
}

/**
 * Picks the skill this unit uses.
 *
 * Returns `null` only when the unit has no usable skill at all, which content validation
 * makes impossible for a well-formed kit (every unit has an A1, and A1s never cool down).
 */
export function chooseSkill(
  unit: BattleUnit,
  foes: readonly BattleUnit[],
  skills: ReadonlyMap<string, SkillDef>,
  statuses: ReadonlyMap<string, StatusDef>,
  isFirstTurn: boolean,
  _rng: Rng,
): SkillChoice | null {
  const usable: SkillChoice[] = [];
  for (const key of unit.skills) {
    const skill = skills.get(key);
    if (!skill || skill.slot === 'passive') continue;
    if (!isReady(unit, key)) continue;
    usable.push({ skill, key });
  }
  if (usable.length === 0) return null;

  if (isFirstTurn) {
    const opener = usable.find((choice) => choice.skill.aiHints.openWith);
    if (opener) return opener;
  }

  // Highest slot first: a kit's later skills are its expensive ones, and spending them
  // when they are available is what makes an enemy feel like it is playing its kit.
  const ordered = [...usable].sort((a, b) => slotRank(b.skill.slot) - slotRank(a.skill.slot));
  for (const choice of ordered) {
    if (choice.skill.slot === 'a1') continue;
    if (hintsAllow(choice.skill, unit, foes, statuses)) return choice;
  }

  return (
    ordered.find((choice) => choice.skill.slot === 'a1') ?? ordered[ordered.length - 1] ?? null
  );
}

function slotRank(slot: SkillDef['slot']): number {
  switch (slot) {
    case 'a1':
      return 1;
    case 'a2':
      return 2;
    case 'a3':
      return 3;
    case 'a4':
      return 4;
    default:
      return 0;
  }
}
