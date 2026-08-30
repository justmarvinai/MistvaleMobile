import { describe, expect, it } from 'vitest';
import { pointsAllowedToday } from '@mistvale/shared';
import { VALE_PASSES } from './vale-pass';

/**
 * The season's pacing, measured rather than asserted.
 *
 * The whole design rests on one number — the daily ceiling — and it has to hold at *both*
 * ends, because either alone is satisfied by a mistake. A ceiling of a million makes the
 * "finishable" half pass and turns the season into a weekend; a ceiling of ten makes the
 * "not rushable" half pass and turns it into something nobody can finish. So both are
 * gated, against the season's real tiers rather than against the constants that produced
 * them: what ships is what these read.
 */

const season = VALE_PASSES[0]!;
const top = season.tiers[season.tiers.length - 1]!.points;

describe('the launch season', () => {
  it('is finishable by somebody who turns up, inside the month', () => {
    // 28 is the shortest month, so a season that needs 29 days at the ceiling would be
    // unfinishable every February — which is exactly the class of fault a monthly schedule
    // invites and a test written against 30 would never see.
    const daysNeeded = Math.ceil(top / season.dailyPointCap);
    expect(daysNeeded).toBeLessThanOrEqual(28);
  });

  it('cannot be rushed — no single day gets near the top', () => {
    // A quarter is the bar: three heavy days should not be most of a month's track, or the
    // ceiling is doing nothing and the season is a sprint wearing a calendar.
    expect(season.dailyPointCap).toBeLessThan(top / 4);
  });

  it('leaves room to miss days rather than demanding every one', () => {
    // Finishable in 25 of 28 means three evenings off and still finished, which is the
    // difference between a season and an attendance register.
    const daysNeeded = Math.ceil(top / season.dailyPointCap);
    expect(28 - daysNeeded).toBeGreaterThanOrEqual(3);
  });

  it('pays something on the free track at every tier', () => {
    // The publish rule only requires *one* free payout across the season. The seed holds
    // itself to a stricter line, because a track that pays on a quarter of its rungs is one
    // most players stop looking at — and a test is where that intent survives an edit.
    for (const [index, tier] of season.tiers.entries()) {
      expect(Object.keys(tier.free), `tier ${index + 1}`).not.toHaveLength(0);
    }
  });

  it('climbs, and in even steps a player can count', () => {
    const steps = season.tiers.map((tier, index) =>
      index === 0 ? tier.points : tier.points - season.tiers[index - 1]!.points,
    );
    expect(new Set(steps).size).toBe(1);
  });
});

describe('pointsAllowedToday', () => {
  it('gives the whole award when there is no ceiling', () => {
    expect(pointsAllowedToday(500, 0, 0)).toBe(500);
    expect(pointsAllowedToday(500, 9_000, 0)).toBe(500);
  });

  it('trims an award to what the day still allows', () => {
    expect(pointsAllowedToday(500, 400, 600)).toBe(200);
    expect(pointsAllowedToday(500, 600, 600)).toBe(0);
  });

  it('never goes negative, however far past the ceiling the day already is', () => {
    // An operator lowering the cap mid-season leaves accounts above it, and a negative
    // award would run the season's total *backwards*.
    expect(pointsAllowedToday(500, 5_000, 600)).toBe(0);
  });

  it('says nothing is owed for nothing earned', () => {
    expect(pointsAllowedToday(0, 0, 600)).toBe(0);
    expect(pointsAllowedToday(-10, 0, 600)).toBe(0);
  });
});
