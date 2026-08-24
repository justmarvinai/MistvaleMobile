import { createRng } from '@mistvale/engine';
import type { DeepRunBoon, DeepRunDef, DeepRunRoom } from '@mistvale/shared';

/**
 * What is behind the doors, and what is offered after them.
 *
 * Pure, and seeded from the run rather than from the process: a descent replays identically,
 * and — the part that actually matters — an offer cannot be re-rolled. Refusing a boon and
 * asking again returns the same three, because the draw is a function of `(seed, nonce)` and
 * the nonce only moves when something is *taken*. A rogue-lite whose offers can be re-rolled
 * for free is a rogue-lite with no decisions in it.
 */

/** One draw's own stream, so floor 7's doors do not depend on how floor 3 went. */
function streamFor(seed: number, nonce: number, salt: number) {
  // Mixed rather than added, so adjacent nonces do not produce adjacent streams — which
  // would make consecutive offers visibly similar.
  const mixed = (Math.imul(seed ^ (nonce + 1), 0x9e37_79b1) ^ Math.imul(salt, 0x85eb_ca6b)) >>> 1;
  return createRng(mixed || 1);
}

/** Weighted choice without replacement, which is what "three different doors" means. */
function takeWeighted<T extends { weight?: number }>(
  rng: ReturnType<typeof createRng>,
  pool: readonly T[],
  count: number,
): T[] {
  const left = [...pool];
  const taken: T[] = [];
  while (taken.length < count && left.length > 0) {
    const total = left.reduce((sum, item) => sum + (item.weight ?? 1), 0);
    let roll = rng.next() * total;
    let index = 0;
    for (; index < left.length - 1; index += 1) {
      roll -= left[index]!.weight ?? 1;
      if (roll <= 0) break;
    }
    taken.push(left[index]!);
    left.splice(index, 1);
  }
  return taken;
}

/**
 * The doors on one floor.
 *
 * Drawn from the rooms whose band covers the floor, without replacement, so a fork is a real
 * choice rather than the same room twice. Falls back to whatever is in band when content
 * offers fewer rooms than doors — publish validation refuses that, but a live content edit
 * mid-descent must not strand somebody on floor 7 with nothing to press.
 */
export function drawDoors(def: DeepRunDef, seed: number, nonce: number, floor: number): string[] {
  const inBand = def.rooms.filter((room) => floor >= room.minFloor && floor <= room.maxFloor);
  if (inBand.length === 0) return [];
  const rng = streamFor(seed, nonce, floor * 31 + 7);
  return takeWeighted(rng, inBand, Math.min(def.forks, inBand.length)).map((room) => room.key);
}

/** How likely each rarity is to be what a boon offer draws, per slot. */
const BOON_RARITY_WEIGHT: Readonly<Record<string, number>> = Object.freeze({
  common: 10,
  uncommon: 6,
  rare: 3.5,
  epic: 1.6,
  legendary: 0.5,
});

/**
 * The boons offered after a room.
 *
 * Weighted by rarity so a legendary is a moment rather than a Tuesday, and drawn without
 * replacement so three identical commons never come up. Boons already held are excluded
 * unless they stack — being offered something you cannot take is a wasted slot, and this is
 * a mode with only a dozen of them in a run.
 */
export function drawBoons(
  def: DeepRunDef,
  seed: number,
  nonce: number,
  floor: number,
  held: readonly string[],
  count: number,
): string[] {
  const heldSet = new Set(held);
  const available = def.boons
    .filter((boon) => floor >= boon.minFloor)
    .filter((boon) => boon.stacks || !heldSet.has(boon.key))
    .map((boon) => ({ boon, weight: BOON_RARITY_WEIGHT[boon.rarity] ?? 1 }));
  if (available.length === 0) return [];

  const rng = streamFor(seed, nonce, floor * 97 + 13);
  return takeWeighted(rng, available, Math.min(count, available.length)).map(
    (entry) => entry.boon.key,
  );
}

/** The rooms a set of door keys names, in the order they were drawn. */
export function roomsFor(def: DeepRunDef, keys: readonly string[]): DeepRunRoom[] {
  return keys.flatMap((key) => {
    const room = def.rooms.find((entry) => entry.key === key);
    return room ? [room] : [];
  });
}

/** The boons a set of keys names, in order, with duplicates kept — some stack. */
export function boonsFor(def: DeepRunDef, keys: readonly string[]): DeepRunBoon[] {
  return keys.flatMap((key) => {
    const boon = def.boons.find((entry) => entry.key === key);
    return boon ? [boon] : [];
  });
}
