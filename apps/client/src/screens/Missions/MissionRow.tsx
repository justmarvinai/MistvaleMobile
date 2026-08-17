import type { MissionDef, MissionStanding } from '@mistvale/shared';
import { Button } from '../../ui/Button/Button';
import { Rewards } from '../../ui/Rewards/Rewards';
import styles from './MissionsScreen.module.scss';

/**
 * One step of the chain.
 *
 * A mission that grants a champion says so *above* its currencies, because on the last
 * step of eighty that champion is the entire reason anybody walked it — and a player who
 * cannot see what is at the end of the road has no reason to take it.
 */
export interface MissionRowProps {
  standing: MissionStanding;
  def: MissionDef | undefined;
  championName: (key: string) => string;
  busy: boolean;
  disabled: boolean;
  onClaim: () => void;
}

export function MissionRow({
  standing,
  def,
  championName,
  busy,
  disabled,
  onClaim,
}: MissionRowProps): JSX.Element {
  const ready = standing.claimable;
  // Finished but not claimable means the arc is still shut — a real state, and one worth
  // showing rather than hiding, because it is evidence the Path noticed.
  const waiting = standing.complete && !standing.claimed && !standing.claimable;

  return (
    <li
      className={[
        styles.mission,
        standing.claimed ? styles.missionDone : '',
        ready ? styles.missionReady : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className={styles.missionBody}>
        <h3 className={styles.missionName}>{def?.name ?? standing.missionKey}</h3>
        {def?.description && <p className={styles.missionNote}>{def.description}</p>}

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

      <div className={styles.missionSide}>
        {standing.grantsChampions.length > 0 && (
          <p className={styles.grant}>{standing.grantsChampions.map(championName).join(', ')}</p>
        )}
        {standing.grantsTitle && <p className={styles.grantTitle}>“{standing.grantsTitle}”</p>}
        <Rewards rewards={standing.rewards} signed />
        <Button
          variant={ready ? 'primary' : 'ghost'}
          disabled={!ready || disabled}
          onClick={onClaim}
        >
          {standing.claimed
            ? 'Claimed'
            : busy
              ? 'Claiming…'
              : ready
                ? 'Claim'
                : waiting
                  ? 'Arc still shut'
                  : 'In progress'}
        </Button>
      </div>
    </li>
  );
}
