import { describe, expect, it } from 'vitest';
import { clockRarities, poolRange, poolTier, sigilArt } from './sigilArt';

describe('sigilArt', () => {
  it('draws each of the four gates its own sigil', () => {
    const drawn = ['faded', 'gleaming', 'mistwoven', 'radiant'].map(sigilArt);
    expect(new Set(drawn).size, 'four gates, four sigils').toBe(4);
  });

  it('gives a pool nobody has drawn one to the plain sigil', () => {
    // Content can add a fifth pool in Admin, and it has to land on something.
    expect(sigilArt('somebodys_new_banner')).toBe('rune-bronze-disc');
  });
});

describe('poolTier', () => {
  it('is the best rarity the pool actually pays out', () => {
    expect(poolTier({ common: 0.74, uncommon: 0.2, rare: 0.06 })).toBe('rare');
    expect(poolTier({ rare: 0.7, epic: 0.25, legendary: 0.05 })).toBe('legendary');
  });

  it('ignores a rarity listed at zero, which is not in the pool', () => {
    // The seed writes a full rate table per pool, so "epic: 0" is how a pool says it has
    // none — and colouring the Faded gate legendary because the row exists would be a lie
    // told in the loudest possible place.
    expect(poolTier({ common: 0.8, uncommon: 0.2, rare: 0, epic: 0, legendary: 0 })).toBe(
      'uncommon',
    );
  });

  it('answers something for a pool with no rates at all', () => {
    expect(poolTier({})).toBe('common');
  });
});

describe('poolRange', () => {
  it('is the worst and the best the pool can pay out', () => {
    expect(poolRange({ common: 0.74, uncommon: 0.2, rare: 0.06 })).toEqual(['common', 'rare']);
    expect(poolRange({ epic: 0.94, legendary: 0.06 })).toEqual(['epic', 'legendary']);
  });

  it('separates the three pools a ceiling alone cannot', () => {
    // Mistvale's real rates: three of the four gates can produce a Legendary, so a line
    // reading "up to Legendary" is true on all three and decides nothing. The floor is the
    // half that answers "which of these is worth saving for".
    const gleaming = { rare: 0.915, epic: 0.08, legendary: 0.005 };
    const radiant = { epic: 0.94, legendary: 0.06 };
    expect(poolTier(gleaming)).toBe(poolTier(radiant));
    expect(poolRange(gleaming)[0]).not.toBe(poolRange(radiant)[0]);
  });

  it('answers something for a pool an operator has not filled in yet', () => {
    expect(poolRange({})).toEqual(['common', 'common']);
  });
});

describe('clockRarities', () => {
  it('watches the best two the pool can give, best first', () => {
    expect(clockRarities({ rare: 0.7, epic: 0.25, legendary: 0.05 })).toEqual([
      'legendary',
      'epic',
    ]);
  });

  it('watches rare on a pool that tops out there', () => {
    // The whole reason this is derived. A fixed epic-and-legendary pair left three of the
    // four gates with no clock at all — and on the Faded pool, rare mercy is precisely
    // what somebody pulling is waiting for.
    expect(clockRarities({ common: 0.74, uncommon: 0.2, rare: 0.06 })).toEqual([
      'rare',
      'uncommon',
    ]);
  });

  it('is short when the pool is', () => {
    expect(clockRarities({ common: 1 })).toEqual(['common']);
    expect(clockRarities({})).toEqual([]);
  });
});
