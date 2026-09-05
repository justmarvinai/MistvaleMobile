import { describe, expect, it } from 'vitest';
import {
  bestRarity,
  dealOffset,
  beatFor,
  deservesHerald,
  heraldIndex,
  rank,
  revealOrder,
  teaseLadder,
} from './drama';

/** Shorthand: a batch of results, as only their rarities. */
const batch = (...rarities: string[]): { rarity: string }[] =>
  rarities.map((rarity) => ({ rarity }));

describe('the order the cards turn in', () => {
  it('puts the best card last, whatever order the server sent them in', () => {
    const results = batch('common', 'legendary', 'rare', 'common');
    expect(revealOrder(results)).toEqual([0, 2, 3, 1]);
  });

  it('keeps everything else in the order it arrived', () => {
    const results = batch('rare', 'common', 'uncommon', 'epic', 'common');
    expect(revealOrder(results)).toEqual([0, 1, 2, 4, 3]);
  });

  it('moves ties to the end together, so a double legendary ends on the second', () => {
    const results = batch('legendary', 'common', 'legendary');
    expect(revealOrder(results)).toEqual([1, 0, 2]);
  });

  it('is a permutation — every card is shown exactly once', () => {
    const results = batch('common', 'epic', 'common', 'rare', 'uncommon', 'common');
    expect([...revealOrder(results)].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it('survives a single card and an empty pull', () => {
    expect(revealOrder(batch('epic'))).toEqual([0]);
    expect(revealOrder([])).toEqual([]);
  });
});

describe('the wind-up', () => {
  /**
   * The claim that matters most: below rare, the mist looks the same whatever is coming.
   * A ladder that stopped where the pull stopped would tell a player the news before a
   * single card turned.
   */
  it('climbs to rare on every pull, however bad', () => {
    for (const best of ['common', 'uncommon', 'rare']) {
      expect(teaseLadder(best).map((step) => step.rarity)).toEqual(['common', 'uncommon', 'rare']);
    }
  });

  it('keeps climbing when there is something to climb to', () => {
    expect(teaseLadder('epic').map((step) => step.rarity)).toEqual([
      'common',
      'uncommon',
      'rare',
      'epic',
    ]);
    expect(teaseLadder('legendary')).toHaveLength(5);
  });

  it('holds the last rung longest — the pause before the payoff', () => {
    const ladder = teaseLadder('legendary');
    const last = ladder[ladder.length - 1]!;
    expect(last.holdMs).toBeGreaterThan(ladder[0]!.holdMs);
  });
});

describe('the herald', () => {
  it('is earned by epic and above, and by nothing below it', () => {
    expect(deservesHerald('legendary')).toBe(true);
    expect(deservesHerald('epic')).toBe(true);
    expect(deservesHerald('rare')).toBe(false);
    expect(deservesHerald('common')).toBe(false);
  });

  it('lands on the last card of the display order, since that is where the best one is', () => {
    const results = batch('common', 'legendary', 'rare');
    const order = revealOrder(results);
    expect(heraldIndex(results, order)).toBe(order.length - 1);
    expect(results[order[heraldIndex(results, order)]!]!.rarity).toBe('legendary');
  });

  it('does not fire for a pull with nothing in it', () => {
    const results = batch('common', 'rare', 'uncommon');
    expect(heraldIndex(results, revealOrder(results))).toBe(-1);
    expect(heraldIndex([], [])).toBe(-1);
  });
});

describe('the small rules', () => {
  it('ranks the rarities in the order the game does, and floors an unknown one', () => {
    expect(rank('legendary')).toBeGreaterThan(rank('epic'));
    expect(rank('epic')).toBeGreaterThan(rank('rare'));
    expect(rank('nonsense')).toBe(0);
  });

  it('reads the best rarity out of a batch', () => {
    expect(bestRarity(batch('common', 'epic', 'rare'))).toBe('epic');
    expect(bestRarity([])).toBe('common');
  });

  it('gives a rarer card a longer beat', () => {
    expect(beatFor('legendary')).toBeGreaterThan(beatFor('epic'));
    expect(beatFor('epic')).toBeGreaterThan(beatFor('common'));
    expect(beatFor('nonsense')).toBe(beatFor('rare'));
  });
});

describe('dealOffset', () => {
  it('lays a ×10 out five across and two down, centred on the gate', () => {
    // The corners travel furthest and the middle of each row travels straight up or down.
    expect(dealOffset(0, 10)).toEqual({ col: -2, row: -0.5 });
    expect(dealOffset(2, 10)).toEqual({ col: 0, row: -0.5 });
    expect(dealOffset(4, 10)).toEqual({ col: 2, row: -0.5 });
    expect(dealOffset(7, 10)).toEqual({ col: 0, row: 0.5 });
    expect(dealOffset(9, 10)).toEqual({ col: 2, row: 0.5 });
  });

  it('does not move a hand of one', () => {
    expect(dealOffset(0, 1)).toEqual({ col: 0, row: 0 });
  });

  it('centres a short hand rather than left-aligning it', () => {
    expect(dealOffset(0, 3)).toEqual({ col: -1, row: 0 });
    expect(dealOffset(2, 3)).toEqual({ col: 1, row: 0 });
  });
});
