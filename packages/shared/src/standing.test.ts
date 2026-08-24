import { describe, expect, it } from 'vitest';
import { RARITIES } from './enums';
import {
  DEFAULT_IMPRINT_BONUS,
  DEFAULT_IMPRINT_COPIES,
  DEFAULT_STANDING_BONUS,
  DEFAULT_STANDING_CHAMPIONS,
  NO_STAT_BONUS,
  addBonuses,
  bonusAt,
  imprintCopiesFor,
  isImprintCopies,
  ladderLevel,
  nextLadderAt,
} from './standing';

/**
 * The two collection ladders.
 *
 * Both are content, and content is edited live — so the tests that matter are the ones
 * about an operator moving the numbers, including to values that make no sense. The
 * arithmetic itself is simple enough that getting it wrong would be invisible until
 * somebody's champion quietly lost a level of imprint.
 */

describe('a cumulative ladder', () => {
  it('is level 0 until the first rung', () => {
    expect(ladderLevel(0, [2, 4, 8])).toBe(0);
    expect(ladderLevel(1, [2, 4, 8])).toBe(0);
    expect(ladderLevel(2, [2, 4, 8])).toBe(1);
  });

  it('reaches the highest rung a count has passed, not the first', () => {
    expect(ladderLevel(9, [2, 4, 8])).toBe(3);
    expect(ladderLevel(1_000, [2, 4, 8])).toBe(3);
  });

  it('survives an operator authoring the rungs out of order', () => {
    // A ladder with a typo in it should cost the retune, not the account's stats.
    expect(ladderLevel(5, [8, 2, 4])).toBe(2);
  });

  it('says what the next rung wants, and null at the top', () => {
    expect(nextLadderAt(0, [2, 4, 8])).toBe(2);
    expect(nextLadderAt(3, [2, 4, 8])).toBe(4);
    expect(nextLadderAt(8, [2, 4, 8])).toBeNull();
    // Out of order again: "next" is the nearest rung ahead, not the next in the array.
    expect(nextLadderAt(3, [8, 2, 4])).toBe(4);
  });
});

describe('what a level is worth', () => {
  it('is nothing at level 0, which is not an error', () => {
    expect(bonusAt(0, DEFAULT_IMPRINT_BONUS)).toEqual(NO_STAT_BONUS);
  });

  it('clamps to the last entry rather than falling off the end', () => {
    // An operator who shortens the bonus curve without shortening the copies ladder must
    // not blank the bonus for everybody already past the end of it.
    const top = DEFAULT_IMPRINT_BONUS.at(-1);
    expect(bonusAt(DEFAULT_IMPRINT_BONUS.length + 3, DEFAULT_IMPRINT_BONUS)).toEqual(top);
  });

  it('adds two bonuses rather than compounding them', () => {
    // Both are percentages of the same base, so addition is the whole rule — which is what
    // stops imprint and standing multiplying into something neither number describes.
    expect(
      addBonuses({ hpPct: 10, atkPct: 6, defPct: 3 }, { hpPct: 5, atkPct: 5, defPct: 5 }),
    ).toEqual({ hpPct: 15, atkPct: 11, defPct: 8 });
  });
});

describe('the shipped ladders', () => {
  it('asks a Legendary for fewer copies than a Common at every level', () => {
    // The whole reason thresholds are rarity-scaled rather than the bonus: the same mark
    // has to cost a comparable amount of *effort*, not a comparable number of pulls.
    const legendary = imprintCopiesFor(DEFAULT_IMPRINT_COPIES, 'legendary');
    const common = imprintCopiesFor(DEFAULT_IMPRINT_COPIES, 'common');
    expect(legendary).toHaveLength(common.length);
    for (const [index, at] of legendary.entries()) {
      expect(at).toBeLessThan(common[index]!);
    }
  });

  it('starts every ladder at the second copy, never the first', () => {
    // The first copy is the champion; the second is the first mark. An earlier cut opened
    // Legendary at one copy, which handed Mark I free to every Legendary anybody owned —
    // a flat buff wearing the name of a duplicate mechanic.
    for (const rarity of RARITIES) {
      const ladder = imprintCopiesFor(DEFAULT_IMPRINT_COPIES, rarity);
      expect(ladderLevel(1, ladder), rarity).toBe(0);
      expect(ladder[0]).toBeGreaterThanOrEqual(2);
    }
  });

  it('makes the first duplicate of a Legendary worth something immediately', () => {
    const ladder = imprintCopiesFor(DEFAULT_IMPRINT_COPIES, 'legendary');
    expect(ladderLevel(2, ladder)).toBe(1);
    expect(ladderLevel(3, ladder)).toBe(2);
  });

  it('keeps standing an order of magnitude under imprint', () => {
    // Standing applies to every champion at once and asks for no decision, so it must not
    // be where the power is. If this ever inverts, breadth has quietly become the build.
    const topImprint = DEFAULT_IMPRINT_BONUS.at(-1)!;
    const topStanding = DEFAULT_STANDING_BONUS.at(-1)!;
    expect(topStanding.atkPct * 2).toBeLessThan(topImprint.atkPct);
  });

  it('tops out at owning everything', () => {
    const last = DEFAULT_STANDING_CHAMPIONS.at(-1)!;
    expect(nextLadderAt(last, DEFAULT_STANDING_CHAMPIONS)).toBeNull();
    expect(ladderLevel(last, DEFAULT_STANDING_CHAMPIONS)).toBe(DEFAULT_STANDING_CHAMPIONS.length);
  });

  it('grants no speed, at any level of either ladder', () => {
    // The guardrail the three-field shape exists to enforce: speed decides turn order
    // before anything else in the engine, and an account-wide speed bonus would retune
    // every boss mechanic built around a turn count.
    for (const bonus of [...DEFAULT_IMPRINT_BONUS, ...DEFAULT_STANDING_BONUS]) {
      expect(Object.keys(bonus).sort()).toEqual(['atkPct', 'defPct', 'hpPct']);
    }
  });
});

describe('reading a published copies map', () => {
  it('accepts a complete one', () => {
    expect(isImprintCopies(DEFAULT_IMPRINT_COPIES)).toBe(true);
  });

  it('rejects one missing a rarity, rather than leaving that rarity unimprintable', () => {
    const { common: _common, ...rest } = DEFAULT_IMPRINT_COPIES;
    expect(isImprintCopies(rest)).toBe(false);
  });

  it('rejects an empty or non-numeric ladder', () => {
    expect(isImprintCopies({ ...DEFAULT_IMPRINT_COPIES, rare: [] })).toBe(false);
    expect(isImprintCopies({ ...DEFAULT_IMPRINT_COPIES, rare: ['two'] })).toBe(false);
    expect(isImprintCopies({ ...DEFAULT_IMPRINT_COPIES, rare: [0, 4] })).toBe(false);
  });

  it('rejects anything that is not a map at all', () => {
    expect(isImprintCopies(null)).toBe(false);
    expect(isImprintCopies([1, 2, 3])).toBe(false);
    expect(isImprintCopies('legendary')).toBe(false);
  });
});
