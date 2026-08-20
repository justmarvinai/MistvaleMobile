import type { LoginTrackStanding } from '@mistvale/shared';

/**
 * What the library's calendar grid needs, derived from what the server actually says.
 *
 * `DailyRewards` draws each tile from two numbers and nothing else:
 *
 * ```
 * state = day < currentDay || (day === currentDay && claimedToday) ? 'collected'
 *       : day === currentDay                                      ? 'ready'
 *       :                                                           'upcoming'
 * ```
 *
 * where `day` is the tile's **1-based position in the grid** — not the content-authored
 * day number, which a track is free to number however it likes.
 *
 * The screen used to hand it `next?.day ?? days.length + 1`, and that fallback is what put
 * thirty gold ticks on the calendar the moment a warden claimed one day: once today is
 * spent the server marks *no* day `next`, so the fallback fired, `currentDay` became 31,
 * and every tile was "before the current one". The other end had the same shape of bug —
 * a finished welcome track has no `next` either, so its last tile sat glowing as though it
 * were still claimable.
 *
 * Both fall out once the two states are named separately:
 *
 *  - **`currentDay`** — the tile the cycle is standing on. That is the claimable one when
 *    there is a claimable one, and otherwise the last one paid.
 *  - **`spent`** — whether that tile has already been collected. True both when today's
 *    claim is behind us and when the track has been walked to its end.
 *
 * Everything comes from the server's own per-day flags rather than from arithmetic on
 * `claimsMade`, so the grid cannot disagree with the list it was drawn from.
 */
export interface TrackTiles {
  /** 1-based index of the tile the cycle stands on. 0 when a fresh cycle has nothing yet. */
  currentDay: number;
  /** Whether that tile is already collected — passed to the library as `claimedToday`. */
  spent: boolean;
}

export function trackTiles(track: LoginTrackStanding): TrackTiles {
  const readyIndex = track.days.findIndex((day) => day.next);
  if (readyIndex >= 0) return { currentDay: readyIndex + 1, spent: false };

  // Nothing is claimable: today is spent, or the track is walked out. Either way the tile
  // the cycle stands on is the last one collected — and a cycle that has just wrapped has
  // collected none of its own days yet, which is a `currentDay` of 0 and no tile lit.
  return { currentDay: track.days.filter((day) => day.claimed).length, spent: true };
}
