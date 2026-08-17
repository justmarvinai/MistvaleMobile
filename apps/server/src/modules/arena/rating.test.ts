import { describe, expect, it } from 'vitest';
import { DEFAULT_TIER_THRESHOLDS, tierForRating } from '@mistvale/shared';
import {
  applyRating,
  arenaConfigFrom,
  computeTokens,
  hallCost,
  hallValue,
  medalsForWin,
  ratingChange,
  weeklyDecay,
} from './rating';

/**
 * The ladder's arithmetic.
 *
 * All of it is pure, so all of it is pinned here rather than discovered in a season. The
 * properties that matter are not the exact numbers — those are `game_config` and will be
 * retuned — but the shapes: the ladder is zero-sum, beating somebody far below you is
 * worth almost nothing, a Bronze account cannot fall out of the bottom, and decay never
 * demotes anybody on its own.
 */

const config = arenaConfigFrom({});

describe('rating', () => {
  it('is zero-sum: what the winner gains, the loser loses', () => {
    for (const [a, b] of [
      [1_000, 1_000],
      [1_000, 1_400],
      [2_600, 900],
    ]) {
      const change = ratingChange(a!, b!, true, config);
      expect(change.attacker + change.defender).toBe(0);
    }
  });

  it('pays most for beating somebody above you, and almost nothing below', () => {
    const upset = ratingChange(1_000, 1_600, true, config).attacker;
    const even = ratingChange(1_000, 1_000, true, config).attacker;
    const farming = ratingChange(1_600, 1_000, true, config).attacker;

    expect(upset).toBeGreaterThan(even);
    expect(even).toBeGreaterThan(farming);
    // The whole point: a Platinum account cannot farm Bronze for rating all week.
    expect(farming).toBeLessThanOrEqual(4);
  });

  it('never resolves to nothing, however wide the gap', () => {
    // A fight that moved zero would be a fight the player was charged a token for and
    // got nothing from.
    expect(ratingChange(3_000, 100, true, config).attacker).toBeGreaterThanOrEqual(1);
    expect(ratingChange(100, 3_000, false, config).attacker).toBeLessThanOrEqual(-1);
  });

  it('costs an even match about half of K either way', () => {
    expect(ratingChange(1_200, 1_200, true, config).attacker).toBe(16);
    expect(ratingChange(1_200, 1_200, false, config).attacker).toBe(-16);
  });

  it('holds a Bronze account at its tier floor on a loss', () => {
    // 800 is the Bronze II floor: a loss there cannot drop into Bronze I.
    expect(applyRating(810, -30, config)).toBe(800);
    expect(tierForRating(applyRating(810, -30, config))).toBe('bronze_2');
  });

  it('lets Silver and above fall', () => {
    expect(applyRating(1_210, -30, config)).toBe(1_180);
    expect(tierForRating(applyRating(1_210, -30, config))).toBe('bronze_3');
  });

  it('drops the floor when an operator turns it off', () => {
    const harsh = arenaConfigFrom({ 'arena.bronzeFloor': false });
    expect(applyRating(810, -30, harsh)).toBe(780);
  });

  it('never goes negative', () => {
    expect(applyRating(5, -300, arenaConfigFrom({ 'arena.bronzeFloor': false }))).toBe(0);
  });
});

describe('medals', () => {
  it('pays by band, not by tier', () => {
    expect(medalsForWin('bronze_1', config)).toBe(1);
    expect(medalsForWin('bronze_3', config)).toBe(1);
    expect(medalsForWin('silver_2', config)).toBe(2);
    expect(medalsForWin('gold_3', config)).toBe(3);
    expect(medalsForWin('platinum', config)).toBe(4);
  });
});

describe('weekly decay', () => {
  it('sheds a share of the distance to the tier floor', () => {
    // 2,500 sits in Gold II, whose floor is 2,300; 10% of the 200 above it is 20.
    expect(weeklyDecay(2_500, config)).toBe(2_480);
    // And the further above its floor a rating is, the more it sheds.
    expect(weeklyDecay(2_299, config)).toBe(2_270); // Gold I, 299 above 2,000
  });

  it('never demotes on its own', () => {
    for (const rating of [800, 1_200, 2_000, 3_000, 3_400]) {
      const after = weeklyDecay(rating, config);
      expect(tierForRating(after), `${rating}`).toBe(tierForRating(rating));
    }
  });

  it('leaves an account already at its floor alone', () => {
    expect(weeklyDecay(DEFAULT_TIER_THRESHOLDS.gold_1, config)).toBe(
      DEFAULT_TIER_THRESHOLDS.gold_1,
    );
  });
});

describe('attack tokens', () => {
  const now = new Date('2026-08-17T12:00:00.000Z');
  const hoursAgo = (hours: number) => new Date(now.getTime() - hours * 3_600_000);

  it('accrues one an hour up to the cap', () => {
    expect(computeTokens({ value: 0, updatedAt: hoursAgo(3) }, config, now).value).toBe(3);
    expect(computeTokens({ value: 7, updatedAt: hoursAgo(2) }, config, now).value).toBe(9);
    expect(computeTokens({ value: 0, updatedAt: hoursAgo(50) }, config, now).value).toBe(10);
  });

  it('reports nothing pending once the meter is full', () => {
    const full = computeTokens({ value: 10, updatedAt: hoursAgo(1) }, config, now);
    expect(full.nextTickAt).toBeNull();
    expect(full.fullAt).toBeNull();
  });

  it('counts down to the next whole token rather than restarting each read', () => {
    // Half an hour in, the next token is half an hour away — not a full hour.
    const half = computeTokens(
      { value: 0, updatedAt: new Date(now.getTime() - 1_800_000) },
      config,
      now,
    );
    expect(half.value).toBe(0);
    expect(half.nextTickAt!.getTime() - now.getTime()).toBe(1_800_000);
  });

  it('does not clip an overfilled meter', () => {
    // A refill or an operator grant may legitimately push past the cap; clipping here
    // would quietly steal it.
    expect(computeTokens({ value: 14, updatedAt: hoursAgo(5) }, config, now).value).toBe(14);
  });

  it('predicts when the meter fills', () => {
    const state = computeTokens({ value: 8, updatedAt: now }, config, now);
    expect(state.fullAt!.getTime() - now.getTime()).toBe(2 * 3_600_000);
  });
});

describe('the Hall of Valor', () => {
  it('prices ten levels and then stops', () => {
    expect(hallCost(0, config)).toBe(40);
    expect(hallCost(9, config)).toBe(580);
    expect(hallCost(10, config)).toBeNull();
  });

  it('scales linearly with the level', () => {
    expect(hallValue('hp', 0, config)).toBe(0);
    expect(hallValue('hp', 10, config)).toBe(20);
    expect(hallValue('critDmg', 10, config)).toBe(10);
    expect(hallValue('acc', 10, config)).toBe(40);
  });

  it('costs about 2,500 medals to finish one track', () => {
    const total = config.hallCosts.reduce((sum, cost) => sum + cost, 0);
    expect(total).toBe(2_500);
  });
});

describe('configuration', () => {
  it('falls back to the documented defaults on an empty config', () => {
    expect(config.k).toBe(32);
    expect(config.tokenCap).toBe(10);
    expect(config.thresholds.platinum).toBe(3_000);
  });

  it('merges a partial edit over the defaults rather than replacing them', () => {
    // An operator who retunes Platinum alone must not blank out the other nine rungs.
    const tuned = arenaConfigFrom({ 'arena.tierThresholds': { platinum: 2_800 } });
    expect(tuned.thresholds.platinum).toBe(2_800);
    expect(tuned.thresholds.gold_1).toBe(2_000);
  });

  it('ignores nonsense rather than adopting it', () => {
    const broken = arenaConfigFrom({ 'arena.ratingK': 'lots', 'arena.tierThresholds': [1, 2] });
    expect(broken.k).toBe(32);
    expect(broken.thresholds.silver_1).toBe(1_200);
  });
});
