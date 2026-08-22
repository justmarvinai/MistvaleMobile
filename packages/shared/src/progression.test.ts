import { describe, expect, it } from 'vitest';
import { LEVEL_CAP_BY_RANK, MAX_CHAMPION_LEVEL, MAX_RANK, RARITIES } from './enums';
import {
  RANK_RANGE_BY_RARITY,
  atLevelCap,
  canDeepen,
  canRankUp,
  defaultBaseRank,
  isValidBaseRank,
  levelCapForRank,
  maxRankFor,
} from './progression';

describe('the star ranges', () => {
  it('covers every rarity', () => {
    expect(Object.keys(RANK_RANGE_BY_RARITY).sort()).toEqual([...RARITIES].sort());
  });

  it('is the owner’s table, rarity by rarity', () => {
    expect(RANK_RANGE_BY_RARITY.common).toEqual({
      base: { min: 1, max: 2 },
      max: 2,
      upgradable: false,
    });
    expect(RANK_RANGE_BY_RARITY.uncommon).toEqual({
      base: { min: 2, max: 3 },
      max: 5,
      upgradable: true,
    });
    expect(RANK_RANGE_BY_RARITY.rare).toEqual({
      base: { min: 3, max: 3 },
      max: 5,
      upgradable: true,
    });
    expect(RANK_RANGE_BY_RARITY.epic).toEqual({
      base: { min: 4, max: 4 },
      max: 6,
      upgradable: true,
    });
    expect(RANK_RANGE_BY_RARITY.legendary).toEqual({
      base: { min: 5, max: 5 },
      max: 6,
      upgradable: true,
    });
  });

  it('never lets a base start above the ceiling, or the ceiling above ★6', () => {
    for (const rarity of RARITIES) {
      const range = RANK_RANGE_BY_RARITY[rarity];
      expect(range.base.min).toBeLessThanOrEqual(range.base.max);
      expect(range.base.max).toBeLessThanOrEqual(range.max);
      expect(range.max).toBeLessThanOrEqual(MAX_RANK);
    }
  });
});

describe('canRankUp', () => {
  it('refuses a Common wherever it started — a Common’s ceiling is its own start', () => {
    expect(canRankUp('common', 1, 1)).toBe(false);
    expect(canRankUp('common', 2, 2)).toBe(false);
    // And a ★1 Common does not creep up to the rarity's ★2 either.
    expect(canRankUp('common', 1, 1)).toBe(false);
  });

  it('lets an Uncommon carry the food chain to ★5 and no further', () => {
    expect(canRankUp('uncommon', 2, 2)).toBe(true);
    expect(canRankUp('uncommon', 4, 2)).toBe(true);
    expect(canRankUp('uncommon', 5, 2)).toBe(false);
    // Authored at ★3 changes where it starts, not where it stops.
    expect(canRankUp('uncommon', 4, 3)).toBe(true);
    expect(canRankUp('uncommon', 5, 3)).toBe(false);
  });

  it('stops a Rare at ★5 and lets an Epic and a Legendary reach ★6', () => {
    expect(canRankUp('rare', 4, 3)).toBe(true);
    expect(canRankUp('rare', 5, 3)).toBe(false);
    expect(canRankUp('epic', 5, 4)).toBe(true);
    expect(canRankUp('epic', 6, 4)).toBe(false);
    expect(canRankUp('legendary', 5, 5)).toBe(true);
    expect(canRankUp('legendary', 6, 5)).toBe(false);
  });
});

describe('isValidBaseRank', () => {
  it('accepts the two starts a Common and an Uncommon may be authored at', () => {
    expect(isValidBaseRank('common', 1)).toBe(true);
    expect(isValidBaseRank('common', 2)).toBe(true);
    expect(isValidBaseRank('uncommon', 2)).toBe(true);
    expect(isValidBaseRank('uncommon', 3)).toBe(true);
  });

  it('pins the three that have no choice', () => {
    expect(isValidBaseRank('rare', 3)).toBe(true);
    expect(isValidBaseRank('rare', 4)).toBe(false);
    expect(isValidBaseRank('epic', 4)).toBe(true);
    expect(isValidBaseRank('epic', 5)).toBe(false);
    expect(isValidBaseRank('legendary', 5)).toBe(true);
    expect(isValidBaseRank('legendary', 6)).toBe(false);
  });

  it('refuses a start outside the rarity, and a fraction', () => {
    expect(isValidBaseRank('common', 3)).toBe(false);
    expect(isValidBaseRank('common', 0)).toBe(false);
    expect(isValidBaseRank('epic', 4.5)).toBe(false);
  });

  it('always accepts its own default', () => {
    for (const rarity of RARITIES) {
      expect(isValidBaseRank(rarity, defaultBaseRank(rarity))).toBe(true);
    }
  });
});

describe('canDeepen', () => {
  it('opens ascension and awakening to Rare and above only', () => {
    expect(canDeepen('common')).toBe(false);
    expect(canDeepen('uncommon')).toBe(false);
    expect(canDeepen('rare')).toBe(true);
    expect(canDeepen('epic')).toBe(true);
    expect(canDeepen('legendary')).toBe(true);
  });
});

describe('levelCapForRank', () => {
  it('shares a cap of 20 between ★1 and ★2, then ten a star', () => {
    expect(levelCapForRank(1)).toBe(20);
    expect(levelCapForRank(2)).toBe(20);
    expect(levelCapForRank(3)).toBe(30);
    expect(levelCapForRank(4)).toBe(40);
    expect(levelCapForRank(5)).toBe(50);
    expect(levelCapForRank(6)).toBe(MAX_CHAMPION_LEVEL);
  });

  it('agrees with the table it reads from', () => {
    for (let rank = 1; rank <= MAX_RANK; rank += 1) {
      expect(levelCapForRank(rank)).toBe(LEVEL_CAP_BY_RANK[rank]);
    }
  });

  it('clamps a rank from outside the world rather than answering undefined', () => {
    expect(levelCapForRank(0)).toBe(20);
    expect(levelCapForRank(-3)).toBe(20);
    expect(levelCapForRank(99)).toBe(MAX_CHAMPION_LEVEL);
    expect(levelCapForRank(4.9)).toBe(40);
  });

  it('never offers a level past the ceiling', () => {
    for (let rank = 1; rank <= MAX_RANK; rank += 1) {
      expect(levelCapForRank(rank)).toBeLessThanOrEqual(MAX_CHAMPION_LEVEL);
    }
  });
});

describe('atLevelCap', () => {
  it('is the one gate all three ladders share', () => {
    expect(atLevelCap(3, 29)).toBe(false);
    expect(atLevelCap(3, 30)).toBe(true);
    // Past the cap counts: a champion levelled before a rebalance lowered its cap is
    // standing where the ladder asks it to stand, and refusing that would strand it.
    expect(atLevelCap(3, 31)).toBe(true);
  });
});

describe('maxRankFor', () => {
  it('is the rarity’s ceiling for everything that climbs', () => {
    for (const rarity of RARITIES) {
      if (!RANK_RANGE_BY_RARITY[rarity].upgradable) continue;
      const base = defaultBaseRank(rarity);
      expect(maxRankFor(rarity, base)).toBe(RANK_RANGE_BY_RARITY[rarity].max);
    }
  });

  it('is a Common’s own start, so its track has no length', () => {
    expect(maxRankFor('common', 1)).toBe(1);
    expect(maxRankFor('common', 2)).toBe(2);
  });

  it('clamps a Common authored outside its range rather than trusting it', () => {
    expect(maxRankFor('common', 5)).toBe(2);
    expect(maxRankFor('common', 0)).toBe(1);
  });
});
