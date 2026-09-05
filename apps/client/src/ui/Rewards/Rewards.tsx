import { useMemo } from 'react';
import type { ItemDef } from '@mistvale/shared';
import { useContentStore } from '../../state/contentStore';
import { useTip } from '../Tooltip/useTooltip';
import { rewardTip } from '../Tooltip/tips';
import styles from './Rewards.module.scss';

/**
 * A reward map, rendered.
 *
 * Content pays in a flat `{silver: 5000, sigil_gleaming: 1}`, so every screen that shows
 * what something is worth needs the same two things: the player-facing name of a key, and
 * a consistent way to lay the pairs out. Doing that per screen is how a quest ends up
 * saying "sigil_gleaming" while the Bazaar next door says "Gleaming Sigil".
 *
 * Item names come from the content bundle the client already holds, so an item renamed in
 * Admin is renamed here on the next publish with no client change.
 */

/** Wallet keys, which are not items and so are not in the bundle's item list. */
const SCALAR_LABELS: Readonly<Record<string, string>> = Object.freeze({
  silver: 'Silver',
  crystals: 'Crystals',
  valorMedals: 'Valor Medals',
  playerXp: 'Experience',
  championXp: 'Champion XP',
  energy: 'Energy',
  // A duration rather than an amount, so the unit is part of the name: "24 XP Boost" reads
  // as a quantity of nothing, where "24 Hours of XP Boost" says what arrived.
  xpBoostHours: 'Hours of XP Boost',
});

/**
 * The player-facing name of a reward key.
 *
 * Exported because a toast has to say the same words the chips do — two lookup tables
 * would drift the first time an item is renamed in Admin.
 */
export function useRewardName(): (key: string) => string {
  const bundle = useContentStore((state) => state.bundle);
  return useMemo(() => {
    const items = new Map((bundle?.items ?? []).map((item) => [item.key, item.name]));
    // An unknown key falls back to itself rather than being hidden: a reward the player is
    // actually receiving must never render as nothing.
    return (key: string): string => SCALAR_LABELS[key] ?? items.get(key) ?? key;
  }, [bundle]);
}

/** `{silver: 5000, sigil_faded: 1}` → "5,000 Silver and 1 Faded Sigil". */
export function describeRewards(
  rewards: Readonly<Record<string, number>>,
  nameOf: (key: string) => string,
): string {
  const parts = Object.entries(rewards)
    .filter(([, amount]) => amount > 0)
    .map(([key, amount]) => `${amount.toLocaleString()} ${nameOf(key)}`);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

export interface RewardsProps {
  rewards: Readonly<Record<string, number>>;
  /** `+` in front of each amount, for a payout rather than a price. */
  signed?: boolean;
  /** `lg` for a strip that is the point of its screen — the spoils of a fight (C42). */
  size?: 'md' | 'lg';
  className?: string;
}

export function Rewards({
  rewards,
  signed = false,
  size = 'md',
  className,
}: RewardsProps): JSX.Element | null {
  const nameOf = useRewardName();
  const bundle = useContentStore((state) => state.bundle);
  const entries = Object.entries(rewards).filter(([, amount]) => amount > 0);
  if (entries.length === 0) return null;

  return (
    <ul
      className={[styles.rewards, size === 'lg' ? styles.lg : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
    >
      {entries.map(([key, amount]) => (
        <Reward
          key={key}
          rewardKey={key}
          amount={amount}
          signed={signed}
          name={nameOf(key)}
          item={bundle?.items.find((entry) => entry.key === key)}
        />
      ))}
    </ul>
  );
}

/**
 * One chip.
 *
 * A component rather than a line inside the map, because a tooltip is a hook. Worth the
 * indirection: this chip is the most repeated element in the game — quests, missions,
 * events, the calendar, mail, the shop — and every one of them was a word and a number.
 * "1 Gleaming Sigil" is complete information to somebody who has played for a week and
 * says nothing at all to somebody on their first evening, which is precisely who is
 * reading it.
 */
function Reward({
  rewardKey,
  amount,
  signed,
  name,
  item,
}: {
  rewardKey: string;
  amount: number;
  signed: boolean;
  name: string;
  item: ItemDef | undefined;
}): JSX.Element {
  const ref = useTip(rewardTip(rewardKey, amount, { name, item, signed }));

  return (
    <li ref={ref} className={styles.reward} data-rarity={item?.rarity ?? undefined}>
      <span className={styles.amount}>
        {signed ? '+' : ''}
        {amount.toLocaleString()}
      </span>
      <span className={styles.name}>{name}</span>
    </li>
  );
}
