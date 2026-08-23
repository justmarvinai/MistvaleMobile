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
  // The three below were carried in content from P6 and stated by nothing — the same gap
  // this file was written to close, left open in its own middle. The hit shield in
  // particular is the *only* mechanic that changes which champions belong on a team rather
  // than how they are geared, so leaving it unsaid made a team-building puzzle a guess.
  if (mechanics.hitShield) {
    rules.push({
      label: `Shield — ${mechanics.hitShield.hits} hits`,
      detail: `Land ${mechanics.hitShield.hits} hits between its turns to break it, or the whole team loses ${Math.round(mechanics.hitShield.punishTmPct)}% of its turn meter. A multi-hit attack is worth more here than a bigger one.`,
      glyph: 'glyph-shield-block',
    });
  }
  if (mechanics.thresholdRetaliation) {
    rules.push({
      label: `Answers every ${mechanics.thresholdRetaliation.perHpPct}%`,
      detail: mechanics.thresholdRetaliation.skipIfDot
        ? `It strikes back each time its health falls through another ${mechanics.thresholdRetaliation.perHpPct}%. Poison and burns do not set it off — chip it, or burst past a band in one blow.`
        : `It strikes back each time its health falls through another ${mechanics.thresholdRetaliation.perHpPct}%, however the damage arrived.`,
      glyph: 'glyph-fist-punch',
    });
  }
  if (mechanics.addSummon) {
    rules.push({
      label: 'Calls for help',
      detail: `It brings ${mechanics.addSummon.perTurn} more each turn, up to ${mechanics.addSummon.cap} at once. Bring something that hits everybody, or the adds will bury you.`,
      glyph: 'glyph-cloaked-figure',
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
