import { describe, expect, it } from 'vitest';
import { DRAG_THRESHOLD, isDrag, refusesDrag, scrollableAxes } from './dragScroll';
import type { PressTarget } from './dragScroll';

/**
 * The three rules that decide whether a press scrolls something.
 *
 * The gesture itself is pointer plumbing a browser has to run, but every decision in it is
 * a rule that can be stated: which elements are scrollable, where a press means something
 * else, and when a click has become a drag. Those are what go wrong — a scroller that is
 * `overflow: hidden` and merely *taller* than its box would be dragged for no reason, and a
 * range slider dragged sideways would scroll the panel behind it instead of moving.
 */

const metrics = (over: Partial<Parameters<typeof scrollableAxes>[0]>) =>
  scrollableAxes({
    overflowX: 'visible',
    overflowY: 'visible',
    clientWidth: 100,
    scrollWidth: 100,
    clientHeight: 100,
    scrollHeight: 100,
    ...over,
  });

describe('scrollableAxes', () => {
  it('finds the axis that actually overflows', () => {
    expect(metrics({ overflowY: 'auto', scrollHeight: 400 })).toEqual({ x: false, y: true });
    expect(metrics({ overflowX: 'auto', scrollWidth: 400 })).toEqual({ x: true, y: false });
    expect(
      metrics({ overflowX: 'scroll', overflowY: 'scroll', scrollWidth: 400, scrollHeight: 400 }),
    ).toEqual({
      x: true,
      y: true,
    });
  });

  it('refuses a box that is merely bigger than its content box', () => {
    // `overflow: hidden` clips rather than scrolls, and `visible` does not even clip. Both
    // report a scrollHeight past the client height, and neither is something to drag.
    expect(metrics({ overflowY: 'hidden', scrollHeight: 400 })).toBeNull();
    expect(metrics({ overflowY: 'visible', scrollHeight: 400 })).toBeNull();
  });

  it('refuses a scroller with nothing to scroll to', () => {
    // The common case by far: an `overflow-y: auto` panel whose content fits. Dragging one
    // would feel like a dead grab on most of the game.
    expect(metrics({ overflowY: 'auto' })).toBeNull();
    // And a single pixel is rounding, not room.
    expect(metrics({ overflowY: 'auto', scrollHeight: 101 })).toBeNull();
  });
});

describe('refusesDrag', () => {
  const press = (over: Partial<PressTarget> = {}): PressTarget => ({
    ownsTheGesture: false,
    editable: false,
    fieldType: null,
    ...over,
  });

  it('lets a press on a card, a button or a link start a drag', () => {
    // The whole point of the gesture: you grab the list *by* the things in it, and the
    // click is given back when the pointer did not travel.
    expect(refusesDrag(press())).toBe(false);
  });

  it('leaves a text field, a slider and anything editable alone', () => {
    expect(refusesDrag(press({ editable: true }))).toBe(true);
    expect(refusesDrag(press({ fieldType: 'text' }))).toBe(true);
    expect(refusesDrag(press({ fieldType: 'password' }))).toBe(true);
  });

  it('treats a checkbox as a target rather than as a field', () => {
    expect(refusesDrag(press({ fieldType: 'checkbox' }))).toBe(false);
    expect(refusesDrag(press({ fieldType: 'radio' }))).toBe(false);
  });

  it('stands off anything that drags itself', () => {
    // The Haven's rail, which has had its own pointer handling since C4. Two handlers on
    // one track move it twice as far as the pointer does.
    expect(refusesDrag(press({ ownsTheGesture: true }))).toBe(true);
  });
});

describe('isDrag', () => {
  it('is a click until the pointer has actually travelled', () => {
    expect(isDrag(0, 0)).toBe(false);
    expect(isDrag(DRAG_THRESHOLD - 1, DRAG_THRESHOLD - 1)).toBe(false);
    expect(isDrag(0, DRAG_THRESHOLD)).toBe(true);
    expect(isDrag(-DRAG_THRESHOLD, 0)).toBe(true);
  });
});
