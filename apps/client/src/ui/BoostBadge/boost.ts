import { xpBoostActive, type XpBoostState } from '@mistvale/shared';

/**
 * What the XP badge on the player frame says.
 *
 * Kept out of the component because it is the whole of what the badge *means* — lit or
 * dim, and how long is left — and none of it is worth a browser to check. Whether the
 * boost is running is `xpBoostActive` in shared, which is the same predicate the server
 * pays by; this file only decides how to say it.
 */

export interface BoostReading {
  active: boolean;
  /** Milliseconds left, or 0 when it is not running. */
  remainingMs: number;
  /** The countdown as a player would read it, or null when there is nothing to count. */
  countdown: string | null;
}

export function boostReading(boost: XpBoostState | undefined, nowMs: number): BoostReading {
  const now = new Date(nowMs);
  if (!boost || !xpBoostActive(boost.until, now)) {
    return { active: false, remainingMs: 0, countdown: null };
  }
  const remainingMs = new Date(boost.until as string).getTime() - nowMs;
  return { active: true, remainingMs, countdown: formatRemaining(remainingMs) };
}

/**
 * A duration in the coarsest unit that is still honest.
 *
 * Days and hours for a long boost, minutes for the last hour, seconds only in the final
 * minute — because a badge that reads `2d 4h 17m 03s` is a stopwatch, and what a player
 * wants from this one is "have I got tonight or not". Never rounds *up* past the expiry:
 * the last minute counts down in seconds rather than sitting on "1m" and then vanishing.
 */
export function formatRemaining(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const restMinutes = minutes % 60;
    return restMinutes > 0 ? `${hours}h ${restMinutes}m` : `${hours}h`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days}d ${restHours}h` : `${days}d`;
}
