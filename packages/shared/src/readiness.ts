import { z } from 'zod';

/**
 * What is waiting, in one read.
 *
 * A player coming back after a day wants to know four things before they decide anything:
 * whether their arena tokens are full and wasting regeneration, whether their Titan keys
 * are unspent, which spring is open today, and how many farm runs are left. Every one of
 * those was already computed somewhere in the game and none of them was on the Haven —
 * the screen a player lands on (owner's list, 2026-08-22).
 *
 * It rides on the **snapshot the shell already re-fetches after every action** rather than
 * on three round trips from a summary card, which is the same reasoning the dock pips
 * follow: the server computes, the client displays, and nothing is polled. A card built
 * from three lazy stores would show an empty Haven to anybody who had not opened the Arena
 * yet — which is everybody, on the screen they arrive at.
 *
 * Each field is **null until the feature is open**, so the card draws what a player has
 * rather than a row of zeroes about things they have never seen.
 */

export const meterSchema = z.object({
  value: z.number().int(),
  cap: z.number().int(),
});
export type Meter = z.infer<typeof meterSchema>;

export const readinessSchema = z.object({
  /** Attack tokens. Null below the Arena's unlock level. */
  arenaTokens: meterSchema.nullable(),
  /** Titan keys left today, across every published Titan. Null below its unlock level. */
  titanKeys: meterSchema.nullable(),
  /**
   * The Essence Springs open today, by dungeon key.
   *
   * The week *is* the resource here — Sunday is Mist or it is nothing — so "which spring
   * today" is the one Depths question worth answering from the Haven. Empty while the
   * Depths are shut, and during a new account's grace period it is all of them.
   */
  openSprings: z.array(z.string()),
  /**
   * Whether the springs are all open because the account is still inside its grace period.
   *
   * The server says so rather than the client working it out from "every spring I know of
   * is in the list", because those are not the same fact: an operator who authors every
   * spring with an empty `openDays` opens them all permanently, and a card that then
   * promised a deadline would be lying every day forever. It is worth a field because the
   * grace is the one thing on this card with a clock on it that nothing else mentions.
   */
  springsInGrace: z.boolean(),
});
export type Readiness = z.infer<typeof readinessSchema>;

export const NO_READINESS: Readiness = Object.freeze({
  arenaTokens: null,
  titanKeys: null,
  openSprings: [],
  springsInGrace: false,
});

/** Whether a meter is sitting at its ceiling, and so wasting whatever refills it. */
export function isBrimming(meter: Meter | null): boolean {
  return meter !== null && meter.cap > 0 && meter.value >= meter.cap;
}
