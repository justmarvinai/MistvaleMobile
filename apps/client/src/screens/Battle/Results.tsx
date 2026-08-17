import { ARENA_TIERS, ARENA_TIER_LABELS, type ArenaTier } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { Rewards } from '../../ui/Rewards/Rewards';
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
  // A sandbox fight pays nothing on purpose, so a reward table of zeroes would read as a
  // bug rather than as the deal the player took.
  const practice = battle?.mode === 'practice';
  const arena = rewards?.arena ?? null;

  // The Arena pays in rating and medals and nothing else, and it pays on a loss too — so
  // it gets its own panel rather than a silver line reading zero.
  if (arena) {
    return (
      <Modal open title="The Arena" onClose={onLeave}>
        <div className={styles.body}>
          <p className={`${styles.outcome} ${arena.won ? styles.victory : styles.defeat}`}>
            {arena.won ? `You beat ${arena.opponent}` : `${arena.opponent} held`}
          </p>

          <div className={styles.rewards}>
            <div className={styles.row}>
              <span className={styles.label}>Rating</span>
              <span className={arena.ratingDelta >= 0 ? styles.bonus : undefined}>
                {arena.ratingBefore} → {arena.ratingAfter}
                {'  '}({arena.ratingDelta >= 0 ? '+' : ''}
                {arena.ratingDelta})
              </span>
            </div>
            {arena.medals > 0 && (
              <div className={styles.row}>
                <span className={styles.label}>Valor Medals</span>
                <span className={styles.bonus}>+{arena.medals}</span>
              </div>
            )}
          </div>

          {arena.tierAfter !== arena.tierBefore && (
            <p className={styles.chest}>
              {isPromotion(arena.tierBefore, arena.tierAfter)
                ? `Promoted to ${ARENA_TIER_LABELS[arena.tierAfter]}.`
                : `Slipped back to ${ARENA_TIER_LABELS[arena.tierAfter]}.`}
            </p>
          )}

          {!arena.won && outcome === 'retreat' && (
            <p className={styles.note}>
              Walking out is a loss, not an escape — the token was already spent.
            </p>
          )}

          <div className={styles.actions}>
            <Button onClick={onLeave}>Back to the Arena</Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open title={practice ? 'Practice' : 'Results'} onClose={onLeave}>
      <div className={styles.body}>
        <p className={`${styles.outcome} ${won ? styles.victory : styles.defeat}`}>
          {OUTCOME_TEXT[outcome] ?? 'The fight ended'}
        </p>

        {practice ? (
          <>
            {won && rewards && (
              <p className={styles.stars} aria-label={`${rewards.stars} of 3 stars`}>
                {'★'.repeat(rewards.stars)}
                {'☆'.repeat(Math.max(0, 3 - rewards.stars))}
              </p>
            )}
            <p className={styles.note}>
              A practice run: no energy spent, nothing earned, nothing recorded. The stars show how
              the team would have done.
            </p>
          </>
        ) : won && rewards ? (
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

            {Object.keys(rewards.firstWin).length > 0 && (
              <div className={styles.firstWin}>
                {/* Named rather than folded into the silver line: a player who does not
                    know this exists will not come back tomorrow for it. */}
                <span className={styles.label}>First win of the day</span>
                <Rewards rewards={rewards.firstWin} signed />
              </div>
            )}

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

/** Whether a tier change went up the ladder. Read off the canonical order, not the name. */
function isPromotion(before: ArenaTier, after: ArenaTier): boolean {
  return ARENA_TIERS.indexOf(after) > ARENA_TIERS.indexOf(before);
}
