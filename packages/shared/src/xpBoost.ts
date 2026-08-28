/**
 * The champion-XP boost: a timer on the account, and what it is worth.
 *
 * Mistvale's version of the boost this genre has had for a decade — while it runs, every
 * champion that fights earns more experience for it. Three rules make it the thing players
 * recognise rather than a permanent buff wearing a clock:
 *
 *  - **It is a duration, not a charge.** Nothing is spent to use it and nothing counts
 *    down but the wall clock, so the decision it creates is *when to play*, which is the
 *    whole point of a boost with an expiry.
 *  - **It extends rather than replaces.** Two grants while one is already running add up
 *    (`extend`), because the alternative — the second overwriting the first — punishes a
 *    player for claiming a reward at the wrong moment.
 *  - **It is capped, and the cap is content.** An operator handing out a year of it by
 *    typo should give a long boost rather than a permanent one.
 *
 * The arithmetic is here, in shared, for the reason `auraCoversMode` moved here in C22:
 * the server decides what a fight actually pays and the client draws a countdown beside
 * the player's name, and those two must not be two opinions about the same timer.
 */

/**
 * What the account's boost is doing, as the client is told it.
 *
 * The **timer only**, because that is the half belonging to the player. What a boost is
 * worth is `progression.xpBoostMultiplier`, which the client already holds in its content
 * bundle and reads the way it reads every other tunable — so the badge's "+25%" and the
 * server's payout are one config key rather than two opinions. And what a *fight* actually
 * paid comes back on the result itself (`RewardSummary.xpBoost`) rather than being
 * re-derived from a clock that has moved on since the last turn resolved.
 */
export interface XpBoostState {
  /** When it runs out, ISO-8601 — or null if it is not running. */
  until: string | null;
}

/**
 * The longest a boost may ever run, in hours.
 *
 * A **rule rather than a tunable**, the same way the star and level ceilings in
 * `progression.ts` are: it exists so that content *cannot express* a permanent boost, and
 * a number an operator can raise is not a bound. Thirty days is far past any reward this
 * game will pay and comfortably short of forever, so a mistyped grant produces a very long
 * boost that visibly ends rather than a buff nobody can take back.
 *
 * What an operator *does* tune is the multiplier (`progression.xpBoostMultiplier`) and how
 * many hours each reward pays. Both are content.
 */
export const XP_BOOST_MAX_HOURS = 720;

/** A boost that is not running, which is what a fresh account has. */
export const NO_XP_BOOST: XpBoostState = Object.freeze({ until: null });

/** Whether a boost is running at a given instant. */
export function xpBoostActive(until: Date | string | null, now: Date): boolean {
  if (!until) return false;
  const expiry = typeof until === 'string' ? new Date(until) : until;
  return Number.isFinite(expiry.getTime()) && expiry.getTime() > now.getTime();
}

/**
 * What champion XP is multiplied by right now.
 *
 * The multiplier is only applied while the timer runs; an expired boost is worth exactly
 * what no boost is worth, which is why this takes the clock rather than a boolean.
 */
export function xpBoostMultiplier(
  until: Date | string | null,
  multiplier: number,
  now: Date,
): number {
  return xpBoostActive(until, now) ? Math.max(1, multiplier) : 1;
}

/**
 * Champion XP after the boost, rounded down.
 *
 * Down rather than to nearest, because it is the *engine's* number that a player is told
 * they earned, and a payout that rounds up pays a fraction of a point nobody was promised.
 */
export function boostedChampionXp(base: number, multiplier: number): number {
  if (base <= 0) return 0;
  return Math.floor(base * Math.max(1, multiplier));
}

/**
 * A new expiry after granting `hours` more.
 *
 * From the current expiry when one is running, from *now* when none is — which is the
 * whole of "it extends rather than replaces". Fractional hours are honoured, because an
 * operator writing `0.5` means half an hour rather than nothing.
 */
export function extendXpBoost(
  current: Date | string | null,
  hours: number,
  now: Date,
  maxHours: number = XP_BOOST_MAX_HOURS,
): Date {
  const from = xpBoostActive(current, now)
    ? new Date(typeof current === 'string' ? current : (current as Date))
    : now;
  const added = Math.max(0, hours) * 3_600_000;
  const ceiling = now.getTime() + Math.max(0, maxHours) * 3_600_000;
  return new Date(Math.min(from.getTime() + added, ceiling));
}
