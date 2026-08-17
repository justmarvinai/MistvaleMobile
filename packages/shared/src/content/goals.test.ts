import { describe, expect, it } from 'vitest';
import {
  GOAL_ACCUMULATION,
  GOAL_FILTERS,
  GOAL_TYPES,
  advanceGoal,
  goalMatches,
  goalSchema,
  type Goal,
} from './goals';

/**
 * The goal DSL.
 *
 * Every quest, mission and event milestone in the game is one of these, so a bug here is a
 * bug in all of them at once. Two properties carry the weight:
 *
 *  - **A filter a type does not declare is a publish error, not a goal that never
 *    completes.** `{type:'summon', mode:'campaign'}` reads perfectly in an editor and
 *    would silently never fire; the operator has to find out at publish time.
 *  - **"Reach +12" is not "upgrade twelve relics to +1."** Threshold goals keep a
 *    high-water mark rather than a sum, and which goals are thresholds is a property of
 *    the type rather than something each author gets right individually.
 */

const goal = (input: unknown): Goal => goalSchema.parse(input);

describe('the goal registry', () => {
  it('declares accumulation and filters for every type', () => {
    // A type added without both is a type that behaves arbitrarily at runtime.
    for (const type of GOAL_TYPES) {
      expect(GOAL_ACCUMULATION[type], type).toBeDefined();
      expect(GOAL_FILTERS[type], type).toBeDefined();
    }
  });

  it('counts activity and high-water-marks achievements', () => {
    expect(GOAL_ACCUMULATION.battleWin).toBe('count');
    expect(GOAL_ACCUMULATION.gearUpgrade).toBe('count');
    expect(GOAL_ACCUMULATION.gearLevel).toBe('highest');
    expect(GOAL_ACCUMULATION.arenaTier).toBe('highest');
    expect(GOAL_ACCUMULATION.chapterStars).toBe('highest');
  });
});

describe('validation', () => {
  it('accepts a goal with a filter its type declares', () => {
    expect(() =>
      goal({ type: 'battleWin', target: 7, filters: { mode: 'campaign' } }),
    ).not.toThrow();
  });

  it('refuses a filter the type does not declare', () => {
    // The whole point: this would read fine in the editor and never complete.
    const result = goalSchema.safeParse({
      type: 'summon',
      target: 3,
      filters: { mode: 'campaign' },
    });
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.error?.issues)).toMatch(/not a filter for summon/);
  });

  it('says so plainly when a type takes no filters at all', () => {
    const result = goalSchema.safeParse({ type: 'useEnergy', target: 60, filters: { mode: 'x' } });
    expect(JSON.stringify(result.error?.issues)).toMatch(/Allowed: none/);
  });

  it('defaults the filters to none', () => {
    expect(goal({ type: 'useEnergy', target: 60 }).filters).toEqual({});
  });

  it('refuses a target of nothing', () => {
    expect(goalSchema.safeParse({ type: 'battleWin', target: 0 }).success).toBe(false);
  });
});

describe('matching', () => {
  it('matches an unfiltered goal on type alone', () => {
    const win = goal({ type: 'battleWin', target: 3 });
    expect(goalMatches(win, { type: 'battleWin', facts: { mode: 'dungeon' } })).toBe(true);
    expect(goalMatches(win, { type: 'arenaWin' })).toBe(false);
  });

  it('narrows on every filter it carries', () => {
    const campaign = goal({ type: 'battleWin', target: 7, filters: { mode: 'campaign' } });
    expect(goalMatches(campaign, { type: 'battleWin', facts: { mode: 'campaign' } })).toBe(true);
    expect(goalMatches(campaign, { type: 'battleWin', facts: { mode: 'dungeon' } })).toBe(false);
  });

  it('does not match when the event says nothing about the filter', () => {
    // A report that omits a fact cannot satisfy a goal that narrows on it — the safe way
    // round, since the alternative is a filtered goal completing on unrelated activity.
    const campaign = goal({ type: 'battleWin', target: 7, filters: { mode: 'campaign' } });
    expect(goalMatches(campaign, { type: 'battleWin' })).toBe(false);
  });

  it('matches numeric filters by value', () => {
    const ranked = goal({ type: 'championRankUp', target: 1, filters: { rank: 5 } });
    expect(goalMatches(ranked, { type: 'championRankUp', facts: { rank: 5 } })).toBe(true);
    expect(goalMatches(ranked, { type: 'championRankUp', facts: { rank: 4 } })).toBe(false);
  });
});

describe('advancing', () => {
  it('sums a counting goal, one report at a time', () => {
    const wins = goal({ type: 'battleWin', target: 3 });
    let progress = 0;
    for (let index = 0; index < 3; index += 1) {
      progress = advanceGoal(wins, progress, { type: 'battleWin' });
    }
    expect(progress).toBe(3);
  });

  it('advances by what an event was worth, not by one', () => {
    // Sixty energy is one report worth sixty, and three levels from one feed is one
    // report worth three.
    const energy = goal({ type: 'useEnergy', target: 60 });
    expect(advanceGoal(energy, 0, { type: 'useEnergy', amount: 24 })).toBe(24);
    expect(advanceGoal(energy, 24, { type: 'useEnergy', amount: 40 })).toBe(60);
  });

  it('keeps a high-water mark for a threshold goal', () => {
    // Upgrading twelve relics to +1 must not satisfy "reach +12 on a relic".
    const plusTwelve = goal({ type: 'gearLevel', target: 12 });
    let progress = 0;
    for (let index = 0; index < 12; index += 1) {
      progress = advanceGoal(plusTwelve, progress, { type: 'gearLevel', amount: 1 });
    }
    expect(progress).toBe(1);
    expect(advanceGoal(plusTwelve, progress, { type: 'gearLevel', amount: 12 })).toBe(12);
  });

  it('never regresses a threshold goal', () => {
    const tier = goal({ type: 'arenaTier', target: 4 });
    expect(advanceGoal(tier, 4, { type: 'arenaTier', amount: 2 })).toBe(4);
  });

  it('caps at the target rather than overshooting', () => {
    // A goal that reads 340/3 is a goal somebody has to explain.
    const wins = goal({ type: 'battleWin', target: 3 });
    expect(advanceGoal(wins, 2, { type: 'battleWin', amount: 50 })).toBe(3);
  });

  it('ignores a non-positive amount rather than undoing progress', () => {
    // A quest that un-completes itself is worse than one that stalls.
    const wins = goal({ type: 'battleWin', target: 5 });
    expect(advanceGoal(wins, 3, { type: 'battleWin', amount: -10 })).toBe(3);
    expect(advanceGoal(wins, 3, { type: 'battleWin', amount: 0 })).toBe(3);
  });
});
