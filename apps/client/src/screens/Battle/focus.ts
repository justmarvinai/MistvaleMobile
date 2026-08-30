import type { BattleUnit, UnitRef } from '@mistvale/engine';

/**
 * Who the plate in the middle of the fight is about.
 *
 * Three rules, and the third is the one worth writing down. A fight with nobody in the
 * middle of the screen reads as a fight against nothing, so there is always somebody there
 * — the unit the player picked, or else the first enemy still standing. But since C26b a
 * boss has its own bar across the whole top of the screen, and a plate underneath it
 * carrying the same name and the same health is the screen saying one thing twice in the
 * two most prominent places it has (C12c). So the automatic choice skips the boss the bar
 * already names; a unit the player **deliberately picked** always gets a plate, boss or not,
 * because that click is a question and the plate is the answer.
 *
 * Pure, because it is a rule rather than a rendering, and because the browser cannot prove
 * it: whether the boss happens to be the first enemy in the list at the moment a spec looks
 * depends on which escorts are still alive, so a browser assertion about it would pass for
 * reasons that have nothing to do with the rule.
 */
export function focusUnit(
  allies: readonly BattleUnit[],
  enemies: readonly BattleUnit[],
  target: UnitRef | null,
  boss: UnitRef | null,
): BattleUnit | null {
  const picked = target
    ? ([...allies, ...enemies].find((unit) => sameRef(unit.ref, target)) ?? null)
    : null;
  if (picked) return picked;

  const standing = enemies.find((unit) => unit.alive) ?? null;
  if (standing && boss && sameRef(standing.ref, boss)) return null;
  return standing;
}

export function sameRef(a: UnitRef, b: UnitRef): boolean {
  return a.side === b.side && a.slot === b.slot;
}
