import { describe, expect, it } from 'vitest';
import type { LoginDayStanding, LoginTrackStanding } from '@mistvale/shared';
import { trackTiles } from './trackTiles';

/**
 * The tile arithmetic, against the shapes the server actually produces.
 *
 * `standingOf` (apps/server/src/modules/meta/login.ts) marks `claimed: index < position`
 * and `next: !finished && index === position && !claimedToday`, where
 * `position = claimsMade % days.length`. Every case below is one of those states written
 * out, so a change on either side of the contract fails here rather than in a screenshot.
 */

const day = (over: Partial<LoginDayStanding> & { day: number }): LoginDayStanding => ({
  rewards: {},
  champions: [],
  choices: [],
  relicCount: 0,
  claimed: false,
  next: false,
  ...over,
});

/** A track of `length` days with `claimsMade` claims in this cycle. */
const track = (length: number, position: number, claimedToday: boolean): LoginTrackStanding => ({
  trackKey: 'calendar',
  track: 'calendar',
  name: 'The Long Vigil',
  description: '',
  days: Array.from({ length }, (_, index) =>
    day({
      day: index + 1,
      claimed: index < position,
      next: index === position && !claimedToday,
    }),
  ),
  cycle: 1,
  claimsMade: position,
  claimedToday,
  finished: false,
  claimable: !claimedToday,
});

describe('trackTiles', () => {
  it('lights the claimable day on a fresh account', () => {
    expect(trackTiles(track(30, 0, false))).toEqual({ currentDay: 1, spent: false });
  });

  it('lights the claimable day mid-cycle', () => {
    expect(trackTiles(track(30, 4, false))).toEqual({ currentDay: 5, spent: false });
  });

  /** The reported bug: one claim used to mark all thirty tiles collected. */
  it('marks exactly the days collected that were collected', () => {
    const claimedOne = trackTiles(track(30, 1, true));
    expect(claimedOne).toEqual({ currentDay: 1, spent: true });

    // Replaying the library's own rule over the result: day 1 collected, 2–30 upcoming.
    const states = Array.from({ length: 30 }, (_, index) => {
      const d = index + 1;
      return d < claimedOne.currentDay || (d === claimedOne.currentDay && claimedOne.spent)
        ? 'collected'
        : d === claimedOne.currentDay
          ? 'ready'
          : 'upcoming';
    });
    expect(states.filter((state) => state === 'collected')).toHaveLength(1);
    expect(states[0]).toBe('collected');
    expect(states[1]).toBe('upcoming');
    expect(states.filter((state) => state === 'ready')).toHaveLength(0);
  });

  it('keeps the count right further into a cycle that is spent for today', () => {
    expect(trackTiles(track(30, 9, true))).toEqual({ currentDay: 9, spent: true });
  });

  it('lights nothing on a cycle that has only just wrapped', () => {
    expect(trackTiles(track(30, 0, true))).toEqual({ currentDay: 0, spent: true });
  });

  /** A walked-out welcome track has no `next` either — its last tile is spent, not ready. */
  it('collects the last tile of a finished track rather than offering it', () => {
    const finished: LoginTrackStanding = {
      trackKey: 'welcome',
      track: 'welcome',
      name: 'The First Week',
      description: '',
      days: Array.from({ length: 7 }, (_, index) => day({ day: index + 1, claimed: true })),
      cycle: 1,
      claimsMade: 7,
      claimedToday: false,
      finished: true,
      claimable: false,
    };
    expect(trackTiles(finished)).toEqual({ currentDay: 7, spent: true });
  });
});
