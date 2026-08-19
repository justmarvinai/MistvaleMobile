import { describe, expect, it } from 'vitest';
import { GOAL_TYPES } from '@mistvale/shared';
import { goalGlyph } from './goalArt';

describe('goalGlyph', () => {
  it('has a mark for every goal type the server can send', () => {
    for (const type of GOAL_TYPES) expect(goalGlyph(type), type).toBeTruthy();
  });

  it('tells most of them apart — a column of one icon says nothing', () => {
    // Not all distinct on purpose: chapter stars and a rank-up are both "stars earned".
    const marks = new Set(GOAL_TYPES.map(goalGlyph));
    expect(marks.size).toBeGreaterThanOrEqual(GOAL_TYPES.length - 2);
  });

  it('answers for a goal type added after this was written', () => {
    expect(goalGlyph('warbandRaid')).toBeTruthy();
    expect(goalGlyph(undefined)).toBeTruthy();
  });
});
