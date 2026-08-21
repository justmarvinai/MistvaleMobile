import { useEffect, useMemo, useState } from 'react';
import { ChampionCard } from '../../ui/ChampionCard/ChampionCard';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { useRosterStore } from '../../state/rosterStore';
import styles from './TeamPicker.module.scss';

/**
 * Choosing four champions.
 *
 * Shared by the two places the Arena asks for a team — the defence that stands while you
 * are away, and the squad you attack with — because they are the same act with different
 * stakes, and two pickers would drift apart the first time one gained a feature.
 *
 * Slot one is the leader, whose aura applies. That is why the order is the player's to
 * choose rather than something sorted for them (docs/UI_UX_DESIGN.md §3, screen 7).
 */

const MAX_SLOTS = 4;

export function TeamPicker({
  title,
  blurb,
  confirmLabel,
  initial,
  busy,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  blurb: string;
  confirmLabel: string;
  /** Champions already standing, so re-opening the editor shows the current team. */
  initial?: readonly string[];
  busy?: boolean;
  error?: string | null;
  onConfirm: (team: string[]) => void;
  onClose: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const roster = useRosterStore((state) => state.champions);
  const loadRoster = useRosterStore((state) => state.load);
  const rosterLoading = useRosterStore((state) => state.loading);

  useEffect(() => {
    void loadRoster();
  }, [loadRoster]);

  // The team the player has actually touched, or null while they have touched nothing.
  // Derived rather than seeded into state by an effect: the roster arrives after the first
  // paint, and copying it into state on arrival would be a render cascade for a value that
  // is a pure function of two things we already have.
  const [edits, setEdits] = useState<string[] | null>(null);

  // Filtered against the roster: a champion foddered since the defence was last set is an
  // id the server would refuse, and showing it would be a promise we cannot keep.
  const standing = useMemo(() => {
    const owned = new Set(roster.map((entry) => entry.id));
    return (initial ?? []).filter((id) => owned.has(id)).slice(0, MAX_SLOTS);
  }, [initial, roster]);

  const team = edits ?? standing;

  const championsByKey = useMemo(
    () => new Map((bundle?.champions ?? []).map((champion) => [champion.key, champion])),
    [bundle],
  );

  const toggle = (id: string): void => {
    setEdits(
      team.includes(id)
        ? team.filter((entry) => entry !== id)
        : team.length >= MAX_SLOTS
          ? team
          : [...team, id],
    );
  };

  return (
    <Modal open title={title} onClose={onClose} size="wide">
      <div className={styles.body}>
        <p className={styles.blurb}>{blurb}</p>

        <div className={styles.slots}>
          {Array.from({ length: MAX_SLOTS }, (_, index) => {
            const id = team[index];
            const owned = id ? roster.find((entry) => entry.id === id) : undefined;
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
                <span className={styles.slotLabel}>
                  {index === 0 ? 'Leader' : `Slot ${index + 1}`}
                </span>
                <span className={styles.slotName}>{def?.name ?? '—'}</span>
              </button>
            );
          })}
        </div>

        {rosterLoading && roster.length === 0 ? (
          <p className={styles.empty}>Reading the roster…</p>
        ) : roster.length === 0 ? (
          <p className={styles.empty}>You have no champions yet.</p>
        ) : (
          // The roster's own card. This picker was the worst of them — no portrait at all,
          // just a name and a line of text — and it is the one where the choice matters
          // most, since an Arena defence is what other people fight while you are away.
          <div className={styles.roster}>
            {roster.map((owned) => (
              <ChampionCard
                key={owned.id}
                champion={owned}
                def={championsByKey.get(owned.championKey)}
                selectable
                selected={team.includes(owned.id)}
                onOpen={() => toggle(owned.id)}
              />
            ))}
          </div>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <span className={styles.count}>
            {team.length} of {MAX_SLOTS} chosen
          </span>
          <Button onClick={() => onConfirm(team)} disabled={team.length === 0 || busy}>
            {busy ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
