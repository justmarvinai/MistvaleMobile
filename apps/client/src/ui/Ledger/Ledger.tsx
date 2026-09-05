import { useMemo } from 'react';
import { AchievementList, type AchievementRow } from '@/fui/components/AchievementList.ts';
import { useFui, useFuiAttrs } from '@/fui/react';
import { describeRewards, useRewardName } from '../Rewards/Rewards';
import { rewardArt } from '../Rewards/art';
import { goalGlyph } from '../goalArt';
import styles from './Ledger.module.scss';

/**
 * Every claimable objective in the game, drawn the same way.
 *
 * A daily quest, a step of the Valewarden's Path and a first win of the day are the same
 * shape — a name, a sentence, a counter, what it pays and whether it has been collected —
 * and before the design rework they were three hand-built lists that had already drifted:
 * one drew a bar, one drew a tick, one drew neither. This is `AchievementList`, which *is*
 * the ledger a live game shows for exactly this, wrapped once so no screen has to know the
 * mapping.
 *
 * **What the wrapper adds**, and why each is here rather than at the call sites:
 *
 *  - **Rewards become a line.** Content pays a flat `{silver: 5000, sigil_faded: 1}` and
 *    the row has one text slot, so `describeRewards` writes the sentence and `rewardArt`
 *    picks the picture — the same two helpers the toast and the Bazaar use, so a rename in
 *    Admin lands everywhere at once.
 *  - **Goals become one counter.** Nearly every objective in the game has a single goal,
 *    and the row draws a single bar. The ones that have two are summed, with each goal's
 *    own count appended to the sentence, so nothing is hidden by the aggregate.
 *  - **A locked entry says why** instead of showing a reward it cannot pay.
 *
 * The claim itself stays React's: the server settles it, the store re-reads, and the row's
 * `claimed` comes back as data. The component's own `claim()` is deliberately not called —
 * a row that marks itself collected before the request lands is a row that lies when the
 * request fails.
 */

export interface LedgerGoal {
  /** Goal type from the DSL, which chooses the row's mark. */
  type?: string;
  progress: number;
  target: number;
}

export interface LedgerEntry {
  id: string;
  name: string;
  description?: string;
  goals: readonly LedgerGoal[];
  rewards: Readonly<Record<string, number>>;
  claimed?: boolean;
  /**
   * Why this one is shut, if it is. Replaces the reward line — an objective a player
   * cannot start should not advertise what it would have paid.
   */
  lockedReason?: string | null;
  /**
   * Said in front of the reward line — the champion or the title a step grants.
   *
   * Its own field rather than folded into the rewards, because a champion at the end of
   * eighty steps is the reason anybody walked them and "1 Aureleth" among the silver would
   * bury it.
   */
  grants?: string;
  /** A short mark in the badge — an arc number, a tier. */
  tier?: string;
}

export interface LedgerProps {
  entries: readonly LedgerEntry[];
  title?: string;
  /** Cap the height and scroll inside. Omit to let the list run to its natural size. */
  maxHeight?: number | string;
  emptyText?: string;
  /** Called with the entry id when its Claim button is pressed. */
  onClaim?: (id: string) => void;
  /** Move finished-but-uncollected rows to the top. On by default. */
  claimableFirst?: boolean;
  className?: string;
  /** Attributes for the component's own element — `data-mv-highlight`, `aria-label`. */
  attrs?: Readonly<Record<string, string | number | boolean | undefined>>;
}

export function Ledger({
  entries,
  title,
  maxHeight,
  emptyText,
  onClaim,
  claimableFirst = true,
  className,
  attrs,
}: LedgerProps): JSX.Element {
  const nameOf = useRewardName();

  const rows = useMemo<AchievementRow[]>(
    () =>
      entries.map((entry) => {
        // Summed across goals. The server's own `complete` is `progress >= target` on the
        // same numbers, so the row's Claim button appears exactly when the server would
        // accept one — and if content ever makes them disagree, the request is refused
        // with the server's reason rather than silently paid.
        const progress = entry.goals.reduce((sum, goal) => sum + goal.progress, 0);
        const target = entry.goals.reduce((sum, goal) => sum + goal.target, 0);
        const rewards = Object.entries(entry.rewards).filter(([, amount]) => amount > 0);
        const parts = [entry.description];
        // Two goals summed into one bar would hide which half is done, so each one's own
        // count is said out loud.
        if (entry.goals.length > 1) {
          parts.push(entry.goals.map((goal) => `${goal.progress}/${goal.target}`).join(' · '));
        }
        return {
          id: entry.id,
          name: entry.name,
          ...(parts.filter(Boolean).length > 0
            ? { description: parts.filter(Boolean).join(' — ') }
            : {}),
          glyph: goalGlyph(entry.goals[0]?.type),
          value: progress,
          target: Math.max(target, 1),
          reward:
            entry.lockedReason ??
            [entry.grants, describeRewards(entry.rewards, nameOf)].filter(Boolean).join(' · '),
          ...(!entry.lockedReason && rewards[0] ? { rewardArt: rewardArt(rewards[0][0]) } : {}),
          ...(entry.claimed ? { claimed: true } : {}),
          ...(entry.tier ? { tier: entry.tier } : {}),
        };
      }),
    [entries, nameOf],
  );

  const { ref, instance } = useFui(
    AchievementList,
    {
      achievements: rows,
      claimableFirst,
      ...(title ? { title } : {}),
      ...(maxHeight != null ? { maxHeight } : {}),
      ...(emptyText ? { emptyText } : {}),
      // The library merges `class` onto its own root, which is where the desktop sizes
      // in Ledger.module.scss are scoped.
      class: [styles.ledger, className].filter(Boolean).join(' '),
    },
    onClaim ? { 'achievement:claim': (id: string) => onClaim(id) } : undefined,
    // The list is the one component here with a wholesale setter, so progress arriving a
    // request after the first paint updates the rows in place rather than rebuilding them.
    (list, next) => list.setAchievements(next.achievements),
  );
  useFuiAttrs(instance?.el, attrs);

  return <div ref={ref} style={{ display: 'contents' }} />;
}
