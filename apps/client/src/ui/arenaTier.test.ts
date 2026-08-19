import { describe, expect, it } from 'vitest';
import { ARENA_TIERS } from '@mistvale/shared';
import { arenaTierEmblem, arenaTierLabel } from './arenaTier';

describe('arenaTierEmblem', () => {
  it('splits every rung the ladder has into a metal and a numeral', () => {
    for (const tier of ARENA_TIERS) {
      const emblem = arenaTierEmblem(tier);
      expect(emblem.tier, tier).toBeTruthy();
      // Platinum is undivided; everything below it is I, II or III.
      if (emblem.division !== undefined) {
        expect(emblem.division, tier).toBeGreaterThanOrEqual(1);
        expect(emblem.division, tier).toBeLessThanOrEqual(5);
      }
    }
  });

  it('gives the four metals four emblems', () => {
    const metals = new Set(ARENA_TIERS.map((tier) => arenaTierEmblem(tier).tier));
    expect(metals.size).toBe(4);
  });

  it('leaves Platinum undivided, because it is', () => {
    expect(arenaTierEmblem('platinum')).toEqual({ tier: 'platinum' });
  });

  it('answers for a rung an operator adds after this was written', () => {
    // `arena.tierThresholds` is content; a fifth metal must still draw something.
    expect(arenaTierEmblem('mythril_2' as never).tier).toBe('bronze');
  });

  it('says the rung in words too', () => {
    expect(arenaTierLabel('bronze_2')).toBe('Bronze II');
  });
});
