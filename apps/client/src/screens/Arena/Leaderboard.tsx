import { useEffect, useMemo } from 'react';
import { ARENA_TIER_LABELS, type ArenaLeaderboardEntry } from '@mistvale/shared';
import { Leaderboard as FuiLeaderboard } from '@/fui/components/Leaderboard.ts';
import { Fui } from '@/fui/react';
import { Modal } from '../../ui/Modal/Modal';
import { Empty } from '../../ui/Empty/Empty';
import { useArenaStore } from '../../state/arenaStore';
import { useProfileStore } from '../../state/profileStore';
import styles from './Leaderboard.module.scss';

/**
 * The ladder.
 *
 * Top twenty-five, plus the reader's own neighbourhood when they are outside it — because
 * "you are 41st" means nothing without the four people you could overtake.
 *
 * Painted by the library since the design rework: `Leaderboard` *is* the ranked table this
 * is, down to the gold, silver and bronze treatment on the top three and the highlight on
 * the reader's own row. Two of them rather than one, because Mistvale's board is two lists
 * — the summit and the neighbourhood — and merging them would put a rank-41 row between
 * rank 25 and rank 39 with nothing to say why.
 *
 * Bots are in here, unmarked, exactly as they are in the offer list. They yield the top ten
 * at the weekly reset, so the visible summit belongs to people (GAME_DESIGN §13).
 */
/**
 * The table's width, and the dialog's, chosen together.
 *
 * `Leaderboard` sizes itself in pixels rather than filling its parent, so a default-width
 * table inside a 600px dialog sits in the middle of it with a band of panel either side.
 * One number, used by both.
 */
const BOARD_WIDTH = 512;
const DIALOG_WIDTH = 600;

export function Leaderboard({ onClose }: { onClose: () => void }): JSX.Element {
  const board = useArenaStore((state) => state.leaderboard);
  const load = useArenaStore((state) => state.loadLeaderboard);
  const showProfile = useProfileStore((state) => state.show);

  useEffect(() => {
    void load();
  }, [load]);

  /** One list, in the table's vocabulary. Kept as a function — the board has two. */
  const rows = useMemo(
    () => (entries: readonly ArenaLeaderboardEntry[]) =>
      entries.map((entry) => ({
        rank: entry.position,
        name: entry.profileName,
        score: entry.rating,
        detail: ARENA_TIER_LABELS[entry.tier],
        ...(entry.isSelf ? { you: true } : {}),
      })),
    [],
  );

  /** A name on the ladder is a person: pressing it opens what they chose to show. */
  const open = (entries: readonly ArenaLeaderboardEntry[]) => (row: { rank: number }) => {
    const entry = entries.find((candidate) => candidate.position === row.rank);
    if (entry) void showProfile(entry.playerId);
  };

  return (
    <Modal open title="The ladder" onClose={onClose} width={DIALOG_WIDTH}>
      <div className={styles.body}>
        {!board ? (
          <p className={styles.empty}>Reading the standings…</p>
        ) : board.top.length === 0 ? (
          <Empty
            size="sm"
            glyph="glyph-trophy-cup"
            title="Nobody has fought yet"
            message="Be the first name on it."
          />
        ) : (
          <>
            <Fui
              of={FuiLeaderboard}
              className={styles.board}
              options={{
                title: 'The summit',
                entries: rows(board.top),
                scoreLabel: 'Rating',
                width: BOARD_WIDTH,
              }}
              on={{ 'board:select': open(board.top) }}
            />

            {board.around.length > 0 && (
              <Fui
                of={FuiLeaderboard}
                className={styles.board}
                options={{
                  title: 'Around you',
                  entries: rows(board.around),
                  scoreLabel: 'Rating',
                  width: BOARD_WIDTH,
                }}
                on={{ 'board:select': open(board.around) }}
              />
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
