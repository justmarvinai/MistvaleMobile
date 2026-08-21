import { describe, expect, it } from 'vitest';
import { TUTORIAL_STEPS } from './tutorial';

/**
 * The script, as a piece of writing.
 *
 * The engine's rules about the script — that it runs 1…n with no gaps, that a goal is a
 * real goal — are enforced at publish and tested there. What is checked here is the part
 * publish cannot see: **that every step tells the player what to do.**
 *
 * The owner's note (2026-08-21) was that the script read as fifteen paragraphs of
 * atmosphere with the actual instruction buried inside one of them. The fix was a shape
 * rather than a rewrite of the voice: a line of the Wardenmaster, then a bolded
 * `**What to do:**` and a plain sentence naming the screen and the control. A shape is
 * only worth anything if the sixteenth step written also has it, which is what this is
 * for.
 */

describe('the tutorial script', () => {
  it('is fifteen steps, numbered 1 to 15 with no gaps', () => {
    expect(TUTORIAL_STEPS.map((step) => step.step)).toEqual(
      Array.from({ length: 15 }, (_, index) => index + 1),
    );
  });

  it('tells the player what to do, on every single step', () => {
    const silent = TUTORIAL_STEPS.filter((step) => !step.body.includes('**What to do:**'));
    expect(silent.map((step) => `${step.step} ${step.key}`)).toEqual([]);
  });

  it('puts the instruction last, where a reader stops', () => {
    for (const step of TUTORIAL_STEPS) {
      const paragraphs = step.body.split('\n\n');
      const instruction = paragraphs.findIndex((block) => block.startsWith('**What to do:**'));
      // Last, or second-to-last where a closing beat follows it — step 15 signs off after
      // the instruction, which is the one place a trailing line earns itself.
      expect(instruction).toBeGreaterThanOrEqual(paragraphs.length - 2);
      expect(instruction).toBeGreaterThan(0);
    }
  });

  /**
   * The failure this guards against is a step whose *voice* grew back over its
   * instruction. Fifty words is roughly four lines in the overlay's card, which is as much
   * as anybody reads before pressing the button.
   */
  it('keeps the voice short enough that the instruction is still on screen', () => {
    for (const step of TUTORIAL_STEPS) {
      const before = step.body.split('**What to do:**')[0] ?? '';
      const words = before.split(/\s+/).filter(Boolean).length;
      expect(words, `step ${step.step} says too much before the instruction`).toBeLessThanOrEqual(
        55,
      );
    }
  });

  it('names a concrete campaign stage wherever it asks for one', () => {
    for (const step of TUTORIAL_STEPS) {
      const stageKey = step.goal?.filters?.stageKey;
      if (typeof stageKey !== 'string' || !stageKey.startsWith('c01_s')) continue;
      // `c01_s4_normal` → the body has to say "1-4" somewhere, because that is what the
      // map is labelled with and a player reading "the fourth stretch" has to count.
      const number = stageKey.slice('c01_s'.length).split('_')[0];
      expect(step.body, `step ${step.step} never names stage 1-${number}`).toContain(`1-${number}`);
    }
  });

  it('still pays what the levelling table promises', () => {
    // The table in the file header sizes each payout against the level gate the *next*
    // step needs. It is prose; this is the same claim as an assertion.
    const xpThrough = (through: number): number =>
      TUTORIAL_STEPS.filter((step) => step.step <= through).reduce(
        (sum, step) => sum + (step.rewards.playerXp ?? 0),
        0,
      );

    expect(xpThrough(3)).toBe(120);
    expect(xpThrough(5)).toBe(290);
    expect(xpThrough(7)).toBe(440);
    expect(xpThrough(9)).toBe(650);
  });
});
