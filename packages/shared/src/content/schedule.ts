import type { EventSchedule } from './entities';

/**
 * When an event is running, worked out from the clock.
 *
 * There is no activation job and nothing to expire. An event's window is derived the same
 * way energy and arena tokens are, which means a server that was down all weekend comes
 * back with exactly the right events live, and a clock nobody has to trust twice
 * (docs/ARCHITECTURE.md §5.1).
 *
 * Pure, and given the game-day rather than a `Date`, so the one place that decides when a
 * day turns over stays `lib/game-day`.
 */

export interface EventWindow {
  /**
   * The occurrence this is — `YYYY-MM-DD` of the game-day it opened on.
   *
   * A weekly event has a new occurrence every week, and points reset with it. Storing the
   * anchor on the player's row is what makes that a lookup rather than a job: last week's
   * row simply stops matching.
   */
  anchor: string;
  /** First game-day of the window. */
  startsOn: string;
  /** Last game-day of the window, inclusive. */
  endsOn: string;
}

/** Adds days to a `YYYY-MM-DD`, staying on calendar dates rather than instants. */
export function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`, negative if `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * The window an event is in right now, or `null` if it is not running.
 *
 * `today` and `weekday` are the *game-day*, so a weekly event turns over at the operator's
 * reset hour along with the dailies rather than at some midnight of its own.
 */
export function eventWindowAt(
  schedule: EventSchedule,
  today: string,
  weekday: number,
  now: Date,
): EventWindow | null {
  if (schedule.kind === 'window') {
    const startsAt = Date.parse(schedule.startsAt);
    const endsAt = Date.parse(schedule.endsAt);
    if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return null;
    if (now.getTime() < startsAt || now.getTime() >= endsAt) return null;
    return {
      // A one-off has exactly one occurrence, named by when it opened — so an operator who
      // re-runs the same event later gets a fresh score rather than yesterday's total.
      anchor: schedule.startsAt.slice(0, 10),
      startsOn: schedule.startsAt.slice(0, 10),
      endsOn: schedule.endsAt.slice(0, 10),
    };
  }

  // Weekly: walk back to the most recent occurrence of the starting weekday — at most six
  // days — and see whether today is still inside its run.
  const back = (weekday - schedule.startWeekday + 7) % 7;
  if (back >= schedule.durationDays) return null;

  const startsOn = addDays(today, -back);
  return {
    anchor: startsOn,
    startsOn,
    endsOn: addDays(startsOn, schedule.durationDays - 1),
  };
}

/**
 * The game-day an event's *claim* window shuts on — the last day it ran, plus a grace.
 *
 * Points stop the moment the event ends, but milestones already earned stay claimable for
 * a few days. A player who finished a ladder on Sunday evening and opened the game on
 * Monday morning should not find the rewards gone: the work was done, and taking it away
 * over a scheduling boundary is the kind of thing that teaches people not to bother.
 */
export function claimsCloseOn(window: EventWindow, graceDays: number): string {
  return addDays(window.endsOn, Math.max(0, graceDays));
}
