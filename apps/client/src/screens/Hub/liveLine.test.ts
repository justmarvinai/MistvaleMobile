import { describe, expect, it } from 'vitest';
import { NO_READINESS, type Readiness } from '@mistvale/shared';
import { SCREENS } from '@/app/screens';
import { liveLine } from './liveLine';

const developed: Readiness = {
  arenaTokens: { value: 3, cap: 5 },
  titanKeys: { value: 1, cap: 2 },
  openSprings: ['spring_pure', 'spring_tide'],
  springsInGrace: false,
  holdings: {
    champions: 9,
    vault: { value: 40, cap: 250 },
    chronicle: { value: 12, cap: 37 },
    wardens: 2,
  },
};

describe('a hub card’s live line', () => {
  it('says where the account stands with the place', () => {
    expect(liveLine('champions', developed)).toBe('9 champions');
    expect(liveLine('relics', developed)).toBe('40 of 250 in the vault');
    expect(liveLine('chronicle', developed)).toBe('12 of 37 met');
    expect(liveLine('wardens', developed)).toBe('2 wardens kept');
    expect(liveLine('arena', developed)).toBe('3 of 5 tokens');
    expect(liveLine('titan', developed)).toBe('1 of 2 keys today');
    expect(liveLine('depths', developed)).toBe('2 springs open today');
  });

  it('says nothing below an unlock rather than a row of zeroes', () => {
    // A fresh account: the roster is empty, the vault has a ceiling and nothing in it,
    // and every gated count is null.
    const fresh: Readiness = {
      ...NO_READINESS,
      holdings: { ...NO_READINESS.holdings, vault: { value: 0, cap: 250 } },
    };
    expect(liveLine('champions', fresh)).toBe('0 champions');
    expect(liveLine('relics', fresh)).toBe('0 of 250 in the vault');
    expect(liveLine('chronicle', fresh)).toBeNull();
    expect(liveLine('wardens', fresh)).toBeNull();
    expect(liveLine('arena', fresh)).toBeNull();
    expect(liveLine('titan', fresh)).toBeNull();
    expect(liveLine('depths', fresh)).toBeNull();
  });

  it('counts one of a thing in the singular, and an empty list of wardens in words', () => {
    expect(
      liveLine('champions', { ...developed, holdings: { ...developed.holdings, champions: 1 } }),
    ).toBe('1 champion');
    expect(
      liveLine('wardens', { ...developed, holdings: { ...developed.holdings, wardens: 0 } }),
    ).toBe('Nobody kept yet');
  });

  it('never invents a line for a place with nothing to count', () => {
    // Every registered screen either has a line or answers null — never throws, and
    // never answers with the word "undefined" or "NaN" for a screen this was not written
    // for.
    for (const screen of SCREENS) {
      const line = liveLine(screen.id, developed);
      expect(line === null || /^[A-Za-z0-9]/.test(line), screen.id).toBe(true);
      expect(line ?? '', screen.id).not.toMatch(/undefined|NaN/);
    }
  });
});
