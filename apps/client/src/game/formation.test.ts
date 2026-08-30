import { describe, expect, it } from 'vitest';
import {
  HORIZON,
  MAX_SLOTS,
  UNIT_HEIGHT,
  UNIT_WIDTH,
  VIRTUAL_HEIGHT,
  VIRTUAL_WIDTH,
  slotPosition,
} from './formation';

/**
 * The formation.
 *
 * Pure geometry, and the one thing about the battlefield a test can hold: whether four
 * champions stand apart, whether the two camps mirror, and whether anybody is drawn off the
 * edge of the canvas. The *look* needs a browser and is guarded there; this is the
 * arithmetic underneath it, which is what actually went wrong.
 */

const slots = Array.from({ length: MAX_SLOTS }, (_, slot) => slot);

describe('the ground', () => {
  it('is under the party rather than over it', () => {
    // Both renderers draw the floor from `HORIZON` down and stand the party on it. If the
    // horizon ever dropped below the front rank the champions would be painted over from
    // the feet up, which is the one way these two numbers can be wrong together — and it is
    // exactly the kind of thing a browser guard reports as "the field looks odd".
    for (const side of ['ally', 'enemy'] as const) {
      for (let slot = 0; slot < MAX_SLOTS; slot += 1) {
        expect(slotPosition(side, slot).y, `${side} ${slot} stands on the floor`).toBeGreaterThan(
          HORIZON,
        );
      }
    }
  });
});

describe('slotPosition', () => {
  it('stands four champions far enough apart to count them', () => {
    // The defect this exists for: a step of 34 against a body about 65 virtual pixels wide
    // made a full party overlap by two thirds and read as one heap with several heads.
    const xs = slots.map((slot) => slotPosition('ally', slot).x);
    for (let i = 1; i < xs.length; i += 1) {
      expect(xs[i]! - xs[i - 1]!, `slot ${i} clears slot ${i - 1}`).toBeGreaterThan(UNIT_WIDTH);
    }
  });

  it('gives each slot its own depth, so the line reads back to front', () => {
    const ys = slots.map((slot) => slotPosition('ally', slot).y);
    for (let i = 1; i < ys.length; i += 1) {
      expect(ys[i]!).toBeGreaterThan(ys[i - 1]!);
    }
  });

  it('mirrors the enemy camp exactly', () => {
    // What makes a lunge from the right look like the same gesture as one from the left.
    for (const slot of slots) {
      const ally = slotPosition('ally', slot);
      const enemy = slotPosition('enemy', slot);
      expect(enemy.x).toBe(VIRTUAL_WIDTH - ally.x);
      expect(enemy.y).toBe(ally.y);
    }
  });

  it('keeps both camps on the canvas, bodies and all', () => {
    for (const side of ['ally', 'enemy'] as const) {
      for (const slot of slots) {
        const at = slotPosition(side, slot);
        expect(at.x - UNIT_WIDTH / 2).toBeGreaterThan(0);
        expect(at.x + UNIT_WIDTH / 2).toBeLessThan(VIRTUAL_WIDTH);
        // Feet on the canvas, and the head above them still on it.
        expect(at.y).toBeLessThan(VIRTUAL_HEIGHT);
        expect(at.y - UNIT_HEIGHT).toBeGreaterThan(0);
      }
    }
  });

  it('leaves a no-mans-land between the camps', () => {
    // The two innermost slots are the closest anybody gets. If they met, a strike would
    // have nowhere to travel and the two sides would read as one crowd.
    const ally = slotPosition('ally', MAX_SLOTS - 1).x;
    const enemy = slotPosition('enemy', MAX_SLOTS - 1).x;
    expect(enemy - ally).toBeGreaterThan(UNIT_WIDTH * 2);
  });

  it('stands the party in the lower half, where the eye already is', () => {
    // The other half of the defect: the party stood at 300 of 540 with nothing under it but
    // floor, so the bottom two fifths of every fight in the game were empty.
    for (const slot of slots) {
      expect(slotPosition('ally', slot).y).toBeGreaterThan(VIRTUAL_HEIGHT * 0.6);
    }
  });
});
