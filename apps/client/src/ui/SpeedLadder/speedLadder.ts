import { BATTLE_SPEEDS, DIFFICULTIES, type BattleSpeed, type Difficulty } from '@mistvale/shared';

/**
 * The playback ladder, as rungs a player can see rather than one number that cycles.
 *
 * The library's `BattleControls` draws speed as a single button that steps to the next
 * *unlocked* multiplier, which means a rung an account has not earned is not merely
 * unpressable — it is invisible. So ×4 and ×6 existed with nothing anywhere in the game to
 * say so, and an unlock nobody can see is a feature that does not exist (owner, 2026-08-22:
 * "add an indicator/UI that later x4 and x6 speed is available").
 *
 * Pure, because the interesting part is the wording: a locked rung has to say *which*
 * campaign earns it, and that pairing is content (`battle.speedUnlocks`) rather than
 * something this file is allowed to know.
 */

export type RungState = 'current' | 'open' | 'locked';

export interface SpeedRung {
  speed: BattleSpeed;
  state: RungState;
  /** What earns it, when it is not earned yet. */
  requires?: string;
}

const DIFFICULTY_NAMES: Readonly<Record<Difficulty, string>> = Object.freeze({
  normal: 'Normal',
  hard: 'Hard',
  brutal: 'Brutal',
});

/** "Finish the campaign on Brutal" — the sentence a locked rung is worth. */
export function unlockSentence(difficulty: string): string {
  const known = (DIFFICULTIES as readonly string[]).includes(difficulty)
    ? DIFFICULTY_NAMES[difficulty as Difficulty]
    : difficulty;
  return `Finish the campaign on ${known}`;
}

export function speedRungs(context: {
  /** Speeds this account has earned, from the server. */
  open: readonly number[];
  current: number;
  /** `battle.speedUnlocks` — speed to the difficulty that earns it. */
  unlocks: Readonly<Record<string, string>>;
}): SpeedRung[] {
  return BATTLE_SPEEDS.map((speed) => {
    const earned = context.open.includes(speed);
    const needs = context.unlocks[String(speed)];
    return {
      speed,
      state: !earned ? 'locked' : speed === context.current ? 'current' : 'open',
      // Only on a locked rung, and only when the config actually names a condition: a rung
      // that is locked for a reason nobody wrote down should say nothing rather than guess.
      ...(!earned && typeof needs === 'string' && needs.length > 0
        ? { requires: unlockSentence(needs) }
        : {}),
    };
  });
}
