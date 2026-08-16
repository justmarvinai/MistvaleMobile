import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { useBattleStore } from '../../state/battleStore';
import styles from './Results.module.scss';

/**
 * What the fight paid.
 *
 * Every number here comes off the server's reward summary — the client does not add up
 * loot any more than it adds up damage.
 */

const OUTCOME_TEXT: Record<string, string> = {
  victory: 'Victory',
  defeat: 'Defeat',
  retreat: 'Withdrawn',
  turnLimit: 'The mist closed in',
};

export function Results({ onLeave }: { onLeave: () => void }): JSX.Element {
  const battle = useBattleStore((state) => state.battle);
  const outcome = battle?.outcome ?? 'defeat';
  const rewards = battle?.rewards ?? null;
  const won = outcome === 'victory';

  return (
    <Modal open title="Results" onClose={onLeave}>
      <div className={styles.body}>
        <p className={`${styles.outcome} ${won ? styles.victory : styles.defeat}`}>
          {OUTCOME_TEXT[outcome] ?? 'The fight ended'}
        </p>

        {won && rewards ? (
          <>
            <p className={styles.stars} aria-label={`${rewards.stars} of 3 stars`}>
              {'★'.repeat(rewards.stars)}
              {'☆'.repeat(Math.max(0, 3 - rewards.stars))}
            </p>

            <div className={styles.rewards}>
              <div className={styles.row}>
                <span className={styles.label}>Silver</span>
                <span>{rewards.silver}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Experience</span>
                <span>{rewards.playerXp}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>Champion experience</span>
                <span>{rewards.championXp}</span>
              </div>
              {rewards.levelsGained > 0 && (
                <div className={styles.row}>
                  <span className={styles.label}>Levels gained</span>
                  <span>{rewards.levelsGained}</span>
                </div>
              )}
              {rewards.firstClear && (rewards.bonus.silver ?? 0) > 0 && (
                <div className={styles.row}>
                  <span className={styles.label}>First clear</span>
                  <span className={styles.bonus}>+{rewards.bonus.silver}</span>
                </div>
              )}
              {rewards.gear.length > 0 && (
                <div className={styles.row}>
                  <span className={styles.label}>Relics found</span>
                  <span className={styles.bonus}>{rewards.gear.length}</span>
                </div>
              )}
            </div>

            {rewards.chestTiers.length > 0 && (
              <p className={styles.chest}>
                Star chest claimed — {rewards.chestTiers.join(' and ')} stars in this chapter.
              </p>
            )}
          </>
        ) : (
          <p className={styles.note}>
            {outcome === 'retreat'
              ? 'You pulled back. The energy stays spent — that is what makes retreating a decision.'
              : 'No loot this time. Level a champion, or bring a wider team.'}
          </p>
        )}

        <div className={styles.actions}>
          <Button onClick={onLeave}>Back to the campaign</Button>
        </div>
      </div>
    </Modal>
  );
}
