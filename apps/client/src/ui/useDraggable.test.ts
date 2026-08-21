import { describe, expect, it } from 'vitest';
import { clampToViewport, keyStep } from './useDraggable';

/**
 * The two pieces of a draggable panel that are arithmetic rather than DOM.
 *
 * The rest of the hook is listeners and a bounding box, which a browser answers and jsdom
 * would only approximate; what is worth pinning here is the rule that a moved panel can
 * never be lost, because there is no scrollbar out beyond the viewport and no way back.
 */

const card = { width: 560, height: 300 };
const window1440 = { width: 1440, height: 900 };

describe('keeping a moved panel reachable', () => {
  it('leaves a position that is already inside alone', () => {
    expect(clampToViewport({ x: 400, y: 200 }, card, window1440)).toEqual({ x: 400, y: 200 });
  });

  it('pulls it back from past the right and bottom edges', () => {
    // 1440 − 560 − 8 = 872, and 900 − 300 − 8 = 592.
    expect(clampToViewport({ x: 5000, y: 5000 }, card, window1440)).toEqual({ x: 872, y: 592 });
  });

  it('pulls it back from past the left and top edges', () => {
    expect(clampToViewport({ x: -900, y: -900 }, card, window1440)).toEqual({ x: 8, y: 8 });
  });

  it('keeps the top-left visible when the panel is bigger than the window', () => {
    // Both edges cannot be satisfied at once. The top of the card is the step number and the
    // first line of the instruction; the bottom is buttons a bigger window will reach.
    const tall = { width: 560, height: 1200 };
    expect(clampToViewport({ x: 0, y: -400 }, tall, window1440)).toEqual({ x: 8, y: 8 });
  });

  it('rounds, so a panel never lands on a half pixel', () => {
    expect(clampToViewport({ x: 100.4, y: 200.6 }, card, window1440)).toEqual({ x: 100, y: 201 });
  });
});

describe('nudging a panel from the keyboard', () => {
  it('moves by the arrow keys in both axes', () => {
    expect(keyStep('ArrowLeft', false)).toEqual({ x: -16, y: 0 });
    expect(keyStep('ArrowRight', false)).toEqual({ x: 16, y: 0 });
    expect(keyStep('ArrowUp', false)).toEqual({ x: 0, y: -16 });
    expect(keyStep('ArrowDown', false)).toEqual({ x: 0, y: 16 });
  });

  it('moves further with shift held, so crossing a screen is not forty presses', () => {
    expect(keyStep('ArrowRight', true)).toEqual({ x: 64, y: 0 });
  });

  it('ignores everything else, so typing still reaches the page', () => {
    for (const key of ['Enter', 'Escape', 'a', 'Tab', ' ']) {
      expect(keyStep(key, false), key).toBeNull();
    }
  });
});
