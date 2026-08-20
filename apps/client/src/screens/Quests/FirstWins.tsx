import type { FirstWinBonus } from '@mistvale/shared';
import { Panel } from '../../ui/Panel/Panel';
import { Rewards } from '../../ui/Rewards/Rewards';
import styles from './QuestsScreen.module.scss';
import { Icon } from '@/ui/Icon/Icon';

/**
 * The day's first victory in each mode.
 *
 * Deliberately a panel and not a quest list: there is no Claim button, because the bonus
 * lands with the win. What this panel is for is *before* the fights — an at-a-glance answer
 * to "what have I not done today", which is the question that gets somebody to open the
 * Depths on a Tuesday (GAME_DESIGN §15.6).
 *
 * It reads as a rail across the top of the errands screen rather than a column down its
 * side: four short lines compare faster in a row, and the checklist under it wants the
 * width more than this does.
 */
export function FirstWins({ bonuses }: { bonuses: readonly FirstWinBonus[] }): JSX.Element | null {
  if (bonuses.length === 0) return null;

  return (
    // `inset` rather than the painted default: a full-width panel with corner filigree
    // reads as the screen's main event, and the checklist under it is. This is a note.
    <Panel variant="inset" title="First win today" className={styles.firstWins}>
      <p className={styles.sideNote}>Paid automatically on the day’s first victory.</p>
      <ul className={styles.wins}>
        {bonuses.map((bonus) => (
          <li
            key={bonus.mode}
            className={[
              styles.win,
              bonus.claimed ? styles.winDone : '',
              bonus.lockedReason ? styles.winLocked : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className={styles.winHead}>
              <span className={styles.winName}>{bonus.label}</span>
              <span className={styles.winMark} aria-hidden>
                {bonus.lockedReason ? (
                  <Icon name="nav-locked" size={12} />
                ) : bonus.claimed ? (
                  '✔'
                ) : (
                  '○'
                )}
              </span>
            </div>
            {bonus.lockedReason ? (
              <p className={styles.winNote}>{bonus.lockedReason}</p>
            ) : (
              <Rewards rewards={bonus.rewards} signed />
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
