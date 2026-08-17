import type { QuestDef, QuestStanding } from '@mistvale/shared';
import { Button } from '../../ui/Button/Button';
import { Rewards } from '../../ui/Rewards/Rewards';
import styles from './QuestsScreen.module.scss';

/**
 * One line of the checklist.
 *
 * The bar is the point: a quest a player can see themselves finishing is a quest they will
 * finish, and "3 / 7" answers "should I fight one more?" in a way a tick box cannot. Every
 * goal gets its own bar, because a two-goal quest that showed one number would be lying
 * about which half is done.
 */
export interface QuestRowProps {
  standing: QuestStanding;
  /** The definition, from the content bundle. Absent only mid-publish. */
  def: QuestDef | undefined;
  busy: boolean;
  disabled: boolean;
  onClaim: () => void;
}

export function QuestRow({ standing, def, busy, disabled, onClaim }: QuestRowProps): JSX.Element {
  const ready = standing.complete && !standing.claimed;

  return (
    <li
      className={[
        styles.quest,
        standing.claimed ? styles.questDone : '',
        ready ? styles.questReady : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.questBody}>
        <h3 className={styles.questName}>{def?.name ?? standing.questKey}</h3>
        {def?.description && <p className={styles.questNote}>{def.description}</p>}

        {standing.goals.map((entry, index) => (
          <div key={index} className={styles.goal}>
            <div className={styles.bar}>
              <span
                className={styles.fill}
                style={{ width: `${Math.min(100, (entry.progress / entry.goal.target) * 100)}%` }}
              />
            </div>
            <span className={styles.count}>
              {entry.progress} / {entry.goal.target}
            </span>
          </div>
        ))}
      </div>

      <div className={styles.questSide}>
        <Rewards rewards={standing.rewards} signed />
        <Button
          variant={ready ? 'primary' : 'ghost'}
          disabled={!ready || disabled}
          onClick={onClaim}
        >
          {standing.claimed ? 'Claimed' : busy ? 'Claiming…' : ready ? 'Claim' : 'In progress'}
        </Button>
      </div>
    </li>
  );
}
