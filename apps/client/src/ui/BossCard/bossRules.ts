import type { EnemyDef } from '@mistvale/shared';

/**
 * What the thing at the end of a chapter or a keep actually does.
 *
 * Every boss in the game carries `bossMechanics` in content, and until now **no screen in
 * the client ever said what was in it**. The Depths are described as puzzles; a puzzle
 * whose rules are secret is not a puzzle, it is a wall you lose to twice before guessing.
 * This turns the flags into the sentences a player needs *before* spending the energy.
 *
 * Rules rather than a component so the wording is testable on its own, and so a mechanic
 * added in Admin surfaces as a missing case here rather than as silence on the screen.
 */

export interface BossRule {
  /** Short label for the chip. */
  label: string;
  /** The sentence under it — what the player has to do about it. */
  detail: string;
  /** Glyph asset id for the chip. */
  glyph: string;
}

export type BossMechanics = NonNullable<EnemyDef['bossMechanics']>;

export function bossRules(mechanics: BossMechanics | undefined): BossRule[] {
  if (!mechanics) return [];
  const rules: BossRule[] = [];

  if (mechanics.almightyImmunity) {
    rules.push({
      label: 'Unbreakable',
      detail: 'Stun, freeze and sleep do not land. Bring damage, not control.',
      glyph: 'glyph-shield-block',
    });
  }
  if (mechanics.tmReductionImmune) {
    rules.push({
      label: 'Unhurried',
      detail: 'Its turn meter cannot be pushed back. Speed will not steal its turns.',
      glyph: 'glyph-hourglass',
    });
  }
  if (mechanics.enrage) {
    rules.push({
      label: `Enrages on turn ${mechanics.enrage.afterTurn}`,
      detail: `After that it hits ${mechanics.enrage.dmgPctPerTurn}% harder every turn. This fight has a clock.`,
      glyph: 'glyph-flaming-skull',
    });
  }

  return rules;
}

/**
 * The boss a stage ends on, if it ends on one.
 *
 * A stage's waves are content and its last wave is where the thing that matters stands —
 * the warlord at the end of a chapter, the keep-holder on a floor. Looked up rather than
 * declared, so a stage re-cut in Admin points at its new boss with no client change.
 */
export function stageBoss(
  stage: { waves: readonly (readonly { enemyKey: string }[])[] },
  enemies: readonly EnemyDef[] | undefined,
): EnemyDef | undefined {
  const last = stage.waves.at(-1);
  if (!last || !enemies) return undefined;
  const byKey = new Map(enemies.map((enemy) => [enemy.key, enemy]));
  // The *boss* of the wave, not merely its first entry: a warlord shares its last wave
  // with nobody today, and content is free to change that.
  return last.map((slot) => byKey.get(slot.enemyKey)).find((enemy) => enemy?.isBoss);
}
