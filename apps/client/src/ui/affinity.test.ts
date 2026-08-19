import { describe, expect, it } from 'vitest';
import { ELEMENTS } from '@mistvale/shared';
import { AFFINITIES } from '@/fui/components/AffinityBadge.ts';
import { affinityOf, registerAffinities } from './affinity';

describe('affinities', () => {
  it('registers every element the game has, so no champion draws a blank badge', () => {
    registerAffinities();
    for (const element of ELEMENTS) {
      expect(AFFINITIES[element], element).toBeDefined();
      expect(AFFINITIES[element]?.label, element).toBeTruthy();
      expect(AFFINITIES[element]?.glyph, element).toMatch(/^glyph-/);
    }
  });

  it('leaves the library own affinities alone', () => {
    registerAffinities();
    // A game that adds four must not take nine away: the library's components are shared
    // and something else may still ask for one of theirs.
    expect(AFFINITIES.void).toBeDefined();
    expect(AFFINITIES.magic).toBeDefined();
  });

  it('answers for a def as well as for a key', () => {
    for (const element of ELEMENTS) expect(affinityOf(element)?.id).toBe(element);
    expect(affinityOf('not-an-element')).toBeUndefined();
  });
});
