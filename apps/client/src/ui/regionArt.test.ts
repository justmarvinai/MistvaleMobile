import { describe, expect, it } from 'vitest';
import { regionGlyph } from './regionArt';

describe('regionGlyph', () => {
  it('gives the vale’s six regions six different marks', () => {
    const regions = [
      'The Fringe',
      'Sunken Marches',
      'The Thornmere',
      'The Windward Rise',
      'The Sunless Fen',
      'The Coilstone',
    ];
    expect(new Set(regions.map(regionGlyph)).size).toBe(regions.length);
  });

  it('answers for a region content invented after this was written', () => {
    // Chapter 13 is an Admin edit, not a release. It must land on a marker.
    expect(regionGlyph('The Glass Reach')).toBeTruthy();
    expect(regionGlyph(undefined)).toBeTruthy();
  });
});
