import { useEffect } from 'react';
import { ARENA_TIER_LABELS, type ArenaLeaderboardEntry } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { useArenaStore } from '../../state/arenaStore';
import styles from './Leaderboard.module.scss';

/**
 * The ladder.
 *
 * Top twenty-five, plus the reader's own neighbourhood when they are outside it — because
 * "you are 41st" means nothing without the four people you could overtake.
 *
 * Bots are in here, unmarked, exactly as they are in the offer list. They yield the top ten
 * at the weekly reset, so the visible summit belongs to people (GAME_DESIGN §13).
 */
export function Leaderboard({ onClose }: { onClose: () => void }): JSX.Element {
  const board = useArenaStore((state) => state.leaderboard);
  const load = useArenaStore((state) => state.loadLeaderboard);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <Modal open title="The ladder" onClose={onClose} width={560}>
      <div className={styles.body}>
        {!board ? (
          <p className={styles.empty}>Reading the standings…</p>
        ) : board.top.length === 0 ? (
          <p className={styles.empty}>Nobody has fought yet. Be the first name on it.</p>
        ) : (
          <>
            <ol className={styles.list}>
              {board.top.map((entry) => (
                <Row key={`${entry.position}-${entry.profileName}`} entry={entry} />
              ))}
            </ol>

            {board.around.length > 0 && (
              <>
                <p className={styles.divider}>Around you</p>
                <ol className={styles.list}>
                  {board.around.map((entry) => (
                    <Row key={`near-${entry.position}`} entry={entry} />
                  ))}
                </ol>
              </>
            )}

            {board.ownPosition === null && (
              <p className={styles.note}>
                You are not on the board yet — win a fight and you will be.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function Row({ entry }: { entry: ArenaLeaderboardEntry }): JSX.Element {
  return (
    <li className={styles.row} data-self={entry.isSelf || undefined}>
      <span className={styles.position}>{entry.position}</span>
      <span className={styles.name}>{entry.profileName}</span>
      <span className={styles.tier}>{ARENA_TIER_LABELS[entry.tier]}</span>
      <span className={styles.rating}>{entry.rating}</span>
    </li>
  );
}
