import { useEffect, useMemo, useState } from 'react';
import type { StageDef } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { usePlayerStore } from '../../state/playerStore';
import { useRosterStore } from '../../state/rosterStore';
import { useBattleStore } from '../../state/battleStore';
import { useNavStore } from '../../state/navStore';
import styles from './TeamSelect.module.scss';

/**
 * Picking a team before a fight.
 *
 * Four slots, filled by clicking a champion. Slot one is the leader, whose aura applies —
 * which is why the order is the player's to choose rather than something we sort for them
 * (docs/UI_UX_DESIGN.md §3, screen 7).
 *
 * Every map opens this: a campaign stage and a Depths floor are the same kind of thing, and
 * the mode the battle starts in is read off the stage rather than passed in, so a new mode
 * published in Admin needs no change here.
 */

const MAX_SLOTS = 4;

export function TeamSelect({
  stage,
  title,
  onClose,
}: {
  stage: StageDef;
  /** Heading for the modal; defaults to the stage's own number. */
  title?: string;
  onClose: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const roster = useRosterStore((state) => state.champions);
  const loadRoster = useRosterStore((state) => state.load);
  const rosterLoading = useRosterStore((state) => state.loading);
  const energy = usePlayerStore((state) => state.player?.energy.value ?? 0);
  const startBattle = useBattleStore((state) => state.startBattle);
  const busy = useBattleStore((state) => state.busy);
  const goTo = useNavStore((state) => state.setScreen);

  const [team, setTeam] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  const championsByKey = useMemo(
    () => new Map((bundle?.champions ?? []).map((champion) => [champion.key, champion])),
    [bundle],
  );

  const affordable = energy >= stage.energyCost;
  const canStart = team.length > 0 && affordable && !busy;

  const toggle = (id: string): void => {
    setTeam((current) =>
      current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length >= MAX_SLOTS
          ? current
          : [...current, id],
    );
  };

  const start = async (): Promise<void> => {
    setError(null);
    try {
      await startBattle({ mode: stage.mode, stageKey: stage.key, team });
      goTo('battle');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not start that battle.');
    }
  };

  return (
    <Modal open title={title ?? `Stage ${stage.number}`} onClose={onClose}>
      <div className={styles.body}>
        <p className={styles.summary}>
          {stage.waves.length} waves · {stage.energyCost} energy · {stage.rewards.silverMin}–
          {stage.rewards.silverMax} silver
        </p>

        <div className={styles.slots}>
          {Array.from({ length: MAX_SLOTS }, (_, index) => {
            const id = team[index];
            const owned = roster.find((entry) => entry.id === id);
            const def = owned ? championsByKey.get(owned.championKey) : undefined;
            return (
              <button
                key={index}
                type="button"
                className={styles.slot}
                data-filled={Boolean(id)}
                onClick={() => id && toggle(id)}
                title={id ? 'Remove from the team' : 'Empty slot'}
              >
                <span>{index === 0 ? 'Leader' : `Slot ${index + 1}`}</span>
                <span>{def?.name ?? '—'}</span>
              </button>
            );
          })}
        </div>

        {rosterLoading && roster.length === 0 ? (
          <p className={styles.empty}>Reading the roster…</p>
        ) : roster.length === 0 ? (
          <p className={styles.empty}>
            You have no champions yet. Choose a starter from the Haven first.
          </p>
        ) : (
          <div className={styles.roster}>
            {roster.map((owned) => {
              const def = championsByKey.get(owned.championKey);
              const picked = team.includes(owned.id);
              return (
                <button
                  key={owned.id}
                  type="button"
                  className={styles.card}
                  aria-pressed={picked}
                  disabled={!picked && team.length >= MAX_SLOTS}
                  onClick={() => toggle(owned.id)}
                >
                  <span>
                    {picked ? '▣ ' : ''}
                    {def?.name ?? owned.championKey}
                  </span>
                  <span className={styles.cardMeta}>
                    Lv {owned.level} · ★{owned.rank} · {def?.element ?? '—'}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <span className={styles.cost}>
            {affordable
              ? `Costs ${stage.energyCost} energy — you have ${energy}`
              : `Needs ${stage.energyCost} energy — you have ${energy}`}
          </span>
          <Button onClick={() => void start()} disabled={!canStart}>
            {busy ? 'Starting…' : 'Into the mist'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
