import type { ActiveSetBonus } from '@mistvale/shared';

/**
 * What a swap does to a champion's set bonuses.
 *
 * The picker has always shown the *numbers* a swap produces, and those numbers have always
 * been right — the server assembles the champion twice and the client subtracts. What it
 * never said is **why** they moved, and the why is usually a set: taking off the fourth
 * Truestrike piece costs the whole bonus, and a stat line that quietly drops by a hundred
 * and forty looks like a worse relic rather than a broken set.
 *
 * So this names the change rather than measuring it. A set is identified by its key and
 * counted in *complete copies*, because a bonus stacks per copy and the honest sentence
 * about a 6-piece set is "two copies became one" rather than "you still have it".
 *
 * Pure and exhaustive: every set on either side appears exactly once, gained, lost or
 * changed, and a set whose copies did not move is left out entirely.
 */
export interface SetChange {
  setKey: string;
  name: string;
  /** Complete copies before the swap. */
  before: number;
  /** Complete copies after it. */
  after: number;
  /** What the bonus does, for the ones a player is about to gain or lose. */
  description: string;
}

export function setChanges(
  before: readonly ActiveSetBonus[],
  after: readonly ActiveSetBonus[],
): SetChange[] {
  const byKey = new Map<string, { before?: ActiveSetBonus; after?: ActiveSetBonus }>();
  for (const bonus of before) {
    byKey.set(bonus.setKey, { ...(byKey.get(bonus.setKey) ?? {}), before: bonus });
  }
  for (const bonus of after) {
    byKey.set(bonus.setKey, { ...(byKey.get(bonus.setKey) ?? {}), after: bonus });
  }

  const changes: SetChange[] = [];
  for (const [setKey, pair] of byKey) {
    const copiesBefore = pair.before?.copies ?? 0;
    const copiesAfter = pair.after?.copies ?? 0;
    if (copiesBefore === copiesAfter) continue;
    changes.push({
      setKey,
      // The side that still exists is the one with a name to give. A set being lost is
      // named by the `before` entry, which is the only place it appears.
      name: pair.after?.name ?? pair.before?.name ?? setKey,
      before: copiesBefore,
      after: copiesAfter,
      description: pair.after?.description ?? pair.before?.description ?? '',
    });
  }
  // Losses first: a player skimming this needs to see what breaks before what improves.
  return changes.sort((a, b) => a.after - a.before - (b.after - b.before));
}

/** The sentence a change is worth, in a player's words rather than a diff's. */
export function describeSetChange(change: SetChange): string {
  if (change.before === 0) {
    return change.after === 1
      ? `Completes ${change.name}`
      : `Completes ${change.name} ×${change.after}`;
  }
  if (change.after === 0) return `Breaks ${change.name}`;
  return change.after > change.before
    ? `${change.name} ${change.before} → ${change.after} copies`
    : `${change.name} drops to ${change.after} ${change.after === 1 ? 'copy' : 'copies'}`;
}
