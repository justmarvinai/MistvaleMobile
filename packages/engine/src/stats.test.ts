import { describe, expect, it } from 'vitest';
import type { BaseStats } from '@mistvale/shared';
import { DEFAULT_CHAMPION_SCALING } from './config';
import { deriveStats } from './stats';

/**
 * The tier ladder, at the one place all four rungs meet.
 *
 * `base_stats` are authored at ★6 / level 60 / ascension 6 / awakening 0, and every other
 * tier is that anchor scaled down — or, for an awakened champion, up. The properties worth
 * pinning are the ones a rebalance could quietly break: that the anchor tier reproduces the
 * authored numbers exactly, that each ladder only ever helps, and that the flat stats stay
 * flat however far a champion climbs.
 */

const ANCHOR: BaseStats = {
  hp: 20_000,
  atk: 1_000,
  def: 800,
  spd: 100,
  critRate: 15,
  critDmg: 50,
  res: 30,
  acc: 0,
};

const TOP = { level: 60, rank: 6, ascension: 6, awakening: 0 };

describe('deriveStats', () => {
  it('reproduces the authored anchor exactly at ★6/60/Asc6', () => {
    const stats = deriveStats(
      ANCHOR,
      { level: 60, rank: 6, ascension: 0 },
      DEFAULT_CHAMPION_SCALING,
    );
    expect(stats.hp).toBe(ANCHOR.hp);
    expect(stats.atk).toBe(ANCHOR.atk);
    expect(stats.def).toBe(ANCHOR.def);
  });

  it('leaves the flat stats flat, at every tier', () => {
    for (const tier of [{ level: 1, rank: 1, ascension: 0 }, TOP]) {
      const stats = deriveStats(ANCHOR, tier, DEFAULT_CHAMPION_SCALING);
      expect(stats.spd).toBe(ANCHOR.spd);
      expect(stats.critRate).toBe(ANCHOR.critRate);
      expect(stats.critDmg).toBe(ANCHOR.critDmg);
      expect(stats.res).toBe(ANCHOR.res);
    }
  });

  it('grows with every rung of every ladder', () => {
    const floor = deriveStats(
      ANCHOR,
      { level: 1, rank: 1, ascension: 0 },
      DEFAULT_CHAMPION_SCALING,
    );
    const levelled = deriveStats(
      ANCHOR,
      { level: 20, rank: 1, ascension: 0 },
      DEFAULT_CHAMPION_SCALING,
    );
    const ranked = deriveStats(
      ANCHOR,
      { level: 20, rank: 3, ascension: 0 },
      DEFAULT_CHAMPION_SCALING,
    );
    const ascended = deriveStats(
      ANCHOR,
      { level: 20, rank: 3, ascension: 4 },
      DEFAULT_CHAMPION_SCALING,
    );

    expect(levelled.hp).toBeGreaterThan(floor.hp);
    expect(ranked.hp).toBeGreaterThan(levelled.hp);
    expect(ascended.hp).toBeGreaterThan(ranked.hp);
  });

  it('is unchanged by an absent awakening — the tier every champion is granted at', () => {
    const without = deriveStats(
      ANCHOR,
      { level: 30, rank: 4, ascension: 2 },
      DEFAULT_CHAMPION_SCALING,
    );
    const zero = deriveStats(
      ANCHOR,
      { level: 30, rank: 4, ascension: 2, awakening: 0 },
      DEFAULT_CHAMPION_SCALING,
    );
    expect(zero).toEqual(without);
  });

  it('carries an awakened champion past its authored anchor', () => {
    const anchor = deriveStats(
      ANCHOR,
      { level: 60, rank: 6, ascension: 0 },
      DEFAULT_CHAMPION_SCALING,
    );
    const awakened = deriveStats(
      ANCHOR,
      { level: 60, rank: 6, ascension: 0, awakening: 6 },
      DEFAULT_CHAMPION_SCALING,
    );
    expect(awakened.hp).toBeGreaterThan(anchor.hp);
    // Six rungs at the default 3% each, compounded into one multiplier on the anchor.
    expect(awakened.atk).toBe(Math.round(ANCHOR.atk * 1.18));
  });

  it('treats a nonsense tier as the nearest real one rather than throwing', () => {
    const under = deriveStats(
      ANCHOR,
      { level: -5, rank: 0, ascension: -3, awakening: -2 },
      DEFAULT_CHAMPION_SCALING,
    );
    const floor = deriveStats(
      ANCHOR,
      { level: 1, rank: 1, ascension: 0 },
      DEFAULT_CHAMPION_SCALING,
    );
    expect(under).toEqual(floor);
  });
});
