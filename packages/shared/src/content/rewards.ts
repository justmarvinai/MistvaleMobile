import { CURRENCIES, type Currency } from '../enums';

/**
 * Reward maps — `{silver: 5000, sigil_gleaming: 1}` — and how to read one.
 *
 * Content pays in a flat map rather than a tagged union because that is the shape an
 * operator can type into an editor without a schema lesson: a key and an amount. The cost
 * of that convenience is that "which keys are currencies and which are items" has to be
 * decided *somewhere*, and it had better be one place. This is that place, and both the
 * publish validator and the payout path read it, so an editor cannot accept a reward the
 * payout would silently drop.
 *
 * That silent drop is not hypothetical: before this existed, the stage first-clear payout
 * folded a reward map into a currency bundle and quietly discarded every key it did not
 * recognise. Content that paid a sigil would have validated, published, and paid nothing.
 */

/** Keys that mean a wallet balance or account XP rather than an item. */
export const REWARD_SCALARS = [...CURRENCIES, 'playerXp'] as const;
export type RewardScalar = (typeof REWARD_SCALARS)[number];

export function isRewardScalar(key: string): key is RewardScalar {
  return (REWARD_SCALARS as readonly string[]).includes(key);
}

export interface SplitRewards {
  /** Currencies and account XP, ready for `RewardService.grant`. */
  scalars: Partial<Record<RewardScalar, number>>;
  /** Everything else, keyed by item key, ready for `RewardService.grantItems`. */
  items: Record<string, number>;
}

/**
 * Splits a reward map into the two things that actually pay it.
 *
 * Zero and negative amounts are dropped: a reward is a gift, and a content typo that
 * turned one into a charge should pay nothing rather than take something. Anything that is
 * not a scalar is treated as an item key — publish validation is what guarantees the key
 * exists, so by the time a payout reads this the only unknown left is an item that was
 * deleted between publish and grant, which the payout reports rather than swallows.
 */
export function splitRewards(rewards: Readonly<Record<string, number>>): SplitRewards {
  const scalars: Partial<Record<RewardScalar, number>> = {};
  const items: Record<string, number> = {};

  for (const [key, amount] of Object.entries(rewards)) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) continue;
    if (isRewardScalar(key)) {
      scalars[key] = (scalars[key] ?? 0) + amount;
    } else {
      items[key] = (items[key] ?? 0) + amount;
    }
  }

  return { scalars, items };
}

/** The item keys a reward map names — what publish validation has to resolve. */
export function rewardItemKeys(rewards: Readonly<Record<string, number>>): string[] {
  return Object.keys(rewards).filter((key) => !isRewardScalar(key));
}

/** Adds one reward map into another, in place. */
export function mergeRewards(
  into: Record<string, number>,
  from: Readonly<Record<string, number>>,
): void {
  for (const [key, amount] of Object.entries(from)) {
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) continue;
    into[key] = (into[key] ?? 0) + amount;
  }
}

/** Whether a map would pay anything at all. */
export function rewardsAreEmpty(rewards: Readonly<Record<string, number>>): boolean {
  const { scalars, items } = splitRewards(rewards);
  return Object.keys(scalars).length === 0 && Object.keys(items).length === 0;
}

export type { Currency };
