import { describe, expect, it } from 'vitest';
import {
  DRAG_SLOP,
  FLICK_MAX,
  clampOffset,
  flickDistance,
  isDrag,
  nearestStop,
  railEdges,
  stepStop,
} from './rail';

describe('isDrag', () => {
  it('lets a wobble through as a click', () => {
    expect(isDrag(0)).toBe(false);
    expect(isDrag(DRAG_SLOP - 1)).toBe(false);
    expect(isDrag(-(DRAG_SLOP - 1))).toBe(false);
  });

  it('counts real travel in either direction', () => {
    expect(isDrag(DRAG_SLOP)).toBe(true);
    expect(isDrag(-40)).toBe(true);
  });
});

describe('flickDistance', () => {
  it('ignores a release that was not a throw', () => {
    expect(flickDistance(0)).toBe(0);
    expect(flickDistance(0.1)).toBe(0);
    expect(flickDistance(-0.1)).toBe(0);
  });

  it('keeps the sign of the throw', () => {
    expect(flickDistance(1)).toBeGreaterThan(0);
    expect(flickDistance(-1)).toBeLessThan(0);
  });

  it('caps a hard swipe so it cannot fling the rail end to end', () => {
    expect(flickDistance(50)).toBe(FLICK_MAX);
    expect(flickDistance(-50)).toBe(-FLICK_MAX);
  });

  it('survives a velocity that never got two samples', () => {
    expect(flickDistance(Number.NaN)).toBe(0);
    expect(flickDistance(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('clampOffset', () => {
  it('keeps the rail inside its range', () => {
    expect(clampOffset(-30, 500)).toBe(0);
    expect(clampOffset(900, 500)).toBe(500);
    expect(clampOffset(250, 500)).toBe(250);
  });

  it('pins a rail with nothing to scroll', () => {
    expect(clampOffset(120, 0)).toBe(0);
  });
});

describe('nearestStop', () => {
  const stops = [0, 200, 400, 600];

  it('snaps to the closest panel edge', () => {
    expect(nearestStop(180, stops)).toBe(200);
    expect(nearestStop(410, stops)).toBe(400);
  });

  it('gives a tie to the earlier stop', () => {
    expect(nearestStop(100, stops)).toBe(0);
  });

  it('leaves the offset alone when there is nothing to snap to', () => {
    expect(nearestStop(137, [])).toBe(137);
  });
});

describe('stepStop', () => {
  const stops = [0, 200, 400, 600];

  it('moves one panel at a time', () => {
    expect(stepStop(0, 1, stops)).toBe(200);
    expect(stepStop(200, -1, stops)).toBe(0);
  });

  it('moves off a stop it is already sitting exactly on', () => {
    expect(stepStop(400, 1, stops)).toBe(600);
    expect(stepStop(400, -1, stops)).toBe(200);
  });

  it('stops at the ends rather than running past them', () => {
    expect(stepStop(600, 1, stops)).toBe(600);
    expect(stepStop(0, -1, stops)).toBe(0);
  });

  it('handles a rail resting between two stops', () => {
    expect(stepStop(250, 1, stops)).toBe(400);
    expect(stepStop(250, -1, stops)).toBe(200);
  });
});

describe('railEdges', () => {
  it('reports both ends of a rail that overflows', () => {
    expect(railEdges(0, 1200, 600)).toEqual({ atStart: true, atEnd: false, overflows: true });
    expect(railEdges(600, 1200, 600)).toEqual({ atStart: false, atEnd: true, overflows: true });
    expect(railEdges(300, 1200, 600)).toEqual({ atStart: false, atEnd: false, overflows: true });
  });

  it('reports a rail that fits as being at both ends and overflowing nowhere', () => {
    const edges = railEdges(0, 600, 600);
    expect(edges.overflows).toBe(false);
    expect(edges.atStart).toBe(true);
    expect(edges.atEnd).toBe(true);
  });

  it('tolerates the sub-pixel offsets a browser actually reports', () => {
    expect(railEdges(0.4, 1200, 600).atStart).toBe(true);
    expect(railEdges(599.6, 1200, 600).atEnd).toBe(true);
  });
});
