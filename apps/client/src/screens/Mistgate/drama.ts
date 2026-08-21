import { RARITIES, type Rarity } from '@mistvale/shared';

/**
 * The shape of a pull, as theatre.
 *
 * Everything here is presentation over an outcome the server settled before the first
 * frame — no rolls, no timers that decide anything, nothing that could change what a
 * player received (CLAUDE.md: the client renders server numbers). What it decides is the
 * *order* the cards turn in and how long the mist takes to break, which is the difference
 * between a list of results and a moment worth having.
 *
 * Pure and separate from the component because these are the rules the drama is made of,
 * and rules deserve tests: "the best card is always last" and "the wind-up never leaks a
 * bad pull" are claims, not styling.
 */

/** Worst to best. Local rather than imported ordering, because the order *is* the drama. */
const ORDER: readonly Rarity[] = RARITIES;

/** Where a rarity sits, with anything unrecognised treated as the floor. */
export function rank(rarity: string): number {
  const index = ORDER.indexOf(rarity as Rarity);
  return index < 0 ? 0 : index;
}

/** The best rarity in a batch — what the whole wind-up is building towards. */
export function bestRarity(results: readonly { rarity: string }[]): Rarity {
  let best: Rarity = 'common';
  for (const result of results)
    if (rank(result.rarity) > rank(best)) best = result.rarity as Rarity;
  return best;
}

/**
 * The order the cards turn over, as indices into the server's own list.
 *
 * Everything but the best goes first, in the order it came back; the best goes last. A
 * reveal that opens on the legendary has nothing left to give, and ten cards that end on a
 * grey one is a pull that felt worse than it was — the same ten champions, told backwards.
 *
 * Ties all move to the end together and keep their relative order, so a two-legendary pull
 * ends on the second one rather than burying it in the middle.
 */
export function revealOrder(results: readonly { rarity: string }[]): number[] {
  const best = rank(bestRarity(results));
  const rest: number[] = [];
  const finale: number[] = [];
  results.forEach((result, index) => {
    (rank(result.rarity) === best ? finale : rest).push(index);
  });
  return [...rest, ...finale];
}

/** One rung of the wind-up: a colour the mist takes, and how long it holds it. */
export interface TeaseStep {
  rarity: Rarity;
  holdMs: number;
}

/**
 * The rungs the mist climbs before it breaks.
 *
 * **Always at least as far as rare.** A ladder that stopped where the pull stopped would
 * be a tell: two rungs and a player knows before a single card turns that there is nothing
 * in it, and the wind-up they are watching becomes a countdown to a disappointment they
 * have already had. Climbing to rare every time means every pull looks identical until the
 * point where the news is *good* — and above rare the tell is the reward, because a mist
 * that keeps climbing past blue is the moment the whole system is built around.
 *
 * The last rung holds longest. The pause before the payoff is the payoff.
 */
export function teaseLadder(best: string): TeaseStep[] {
  const top = Math.max(rank('rare'), rank(best));
  return ORDER.slice(0, top + 1).map((rarity, index) => ({
    rarity,
    holdMs: index === top ? 620 : 260,
  }));
}

/** How long each rarity holds the screen once its card has turned. */
const BEAT_MS: Readonly<Record<Rarity, number>> = Object.freeze({
  common: 300,
  uncommon: 340,
  rare: 480,
  epic: 900,
  legendary: 1_400,
});

/** The pause after a card of this rarity turns, before the next one does. */
export function beatFor(rarity: string): number {
  return BEAT_MS[rarity as Rarity] ?? BEAT_MS.rare;
}

/**
 * Whether a card gets the full-screen treatment before it lands.
 *
 * Epic and above, and only ever the last card of a pull — see `heraldIndex`. A herald on
 * every purple in a ten-pull would be four interruptions and no drama at all.
 */
export function deservesHerald(rarity: string): boolean {
  return rank(rarity) >= rank('epic');
}

/**
 * Which card in the *display* order gets the herald, or -1 for none.
 *
 * Always the last one, because `revealOrder` has already put the best there. Written as a
 * lookup rather than assumed, so the two stay honest about each other.
 */
export function heraldIndex(
  results: readonly { rarity: string }[],
  order: readonly number[],
): number {
  const last = order.length - 1;
  const result = last >= 0 ? results[order[last] as number] : undefined;
  return result && deservesHerald(result.rarity) ? last : -1;
}

/** How long the charge holds before the mist starts to climb. */
export const CHARGE_MS = 1_100;
/** How long the break itself takes, flash and all. */
export const BURST_MS = 620;
/** How long a herald holds the screen. Long enough to read the name and feel it. */
export const HERALD_MS = 2_200;
