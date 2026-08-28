import { useMemo, useState, type ReactNode } from 'react';
import type { ArenaTeamMember } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { Portrait } from '../../ui/Portrait/Portrait';
import { championArt } from '../../ui/championArt';
import { useContentStore } from '../../state/contentStore';
import { useRosterStore } from '../../state/rosterStore';
import { Lineup, MAX_SLOTS, leaderAura } from '../Battle/Lineup';
import { auraApplies, auraText } from '../../ui/auraText';
import styles from './TeamPicker.module.scss';

/**
 * Choosing four champions, for the Arena.
 *
 * Shared by the two places the Arena asks for a team — the defence that stands while you
 * are away, and the squad you attack with — because they are the same act with different
 * stakes, and two pickers would drift apart the first time one gained a feature.
 *
 * Since C22 it is the same **`Lineup`** the campaign and the Depths use, which is what the
 * owner's reference screen actually is: a confrontation with a roster under it. The Arena
 * is the case that shape was invented for, because it is the one fight in the game where
 * the other side is a real team rather than a wave of enemies — so the right-hand column
 * holds the defender's own four, their power beside yours, and **their leader's aura**.
 * That last one is the thing the screen was quietly hiding: an attack is decided by whose
 * aura is bigger about as often as by whose champions are, and the game had never said
 * either side's out loud.
 *
 * Slot one is the leader, whose aura applies. That is why the order is the player's to
 * choose rather than something sorted for them (docs/UI_UX_DESIGN.md §3, screen 7).
 */

export function TeamPicker({
  title,
  blurb,
  confirmLabel,
  initial,
  opponent,
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
  /**
   * Who is on the other side, when there is one.
   *
   * Absent for the defence editor, and that absence is the honest shape: a defence is set
   * against everybody rather than against anyone, so there is nobody to draw opposite.
   */
  opponent?:
    | {
        name: string;
        power: number;
        team: readonly ArenaTeamMember[];
      }
    | undefined;
  busy?: boolean;
  error?: string | null;
  onConfirm: (team: string[]) => void;
  onClose: () => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const roster = useRosterStore((state) => state.champions);

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

  const { aura, idle } = leaderAura(team, roster, championsByKey, bundle?.factions, 'arena');
  const teamPower = team
    .map((id) => roster.find((owned) => owned.id === id)?.power ?? 0)
    .reduce((sum, power) => sum + power, 0);

  /**
   * The defender's own leader aura.
   *
   * Their slot one, the same way yours is — a defence is stored in formation order, so the
   * first member is the leader and their aura is on the team you are about to fight. It is
   * as much a fact about the fight as their power is, and it was nowhere on the screen.
   */
  const theirLeader = opponent?.team[0];
  const theirDef = theirLeader ? championsByKey.get(theirLeader.championKey) : undefined;
  const theirAura = theirDef?.aura
    ? auraText(theirDef.aura, {
        element: theirDef.element,
        ...(bundle?.factions.find((entry) => entry.key === theirDef.factionKey)
          ? { faction: bundle.factions.find((entry) => entry.key === theirDef.factionKey)!.name }
          : {}),
      })
    : null;

  return (
    <Modal open title={title} onClose={onClose} size="full">
      <Lineup
        yours={{
          label: 'Your team',
          power: teamPower,
          aura,
          auraIdle: idle,
          auraHint: 'Whoever stands in slot one brings their aura to the whole team.',
        }}
        {...(opponent
          ? {
              theirs: {
                label: opponent.name,
                power: opponent.power,
                aura: theirAura,
                auraIdle: theirDef?.aura ? !auraApplies(theirDef.aura, 'arena') : false,
              },
            }
          : {})}
        opposition={opponent ? <Defenders team={opponent.team} /> : <NobodyYet />}
        team={team}
        onToggle={toggle}
        notices={
          <>
            <p className={styles.blurb}>{blurb}</p>
            {error && <p className={styles.error}>{error}</p>}
          </>
        }
        footer={
          <div className={styles.actions}>
            <span className={styles.count}>
              {team.length} of {MAX_SLOTS} chosen
            </span>
            <Button onClick={() => onConfirm(team)} disabled={team.length === 0 || busy}>
              {busy ? 'Working…' : confirmLabel}
            </Button>
          </div>
        }
      />
    </Modal>
  );
}

/**
 * The defence you are about to attack, in formation order.
 *
 * A snapshot carries a champion key, a level, a rank, an ascension and a power and nothing
 * else — no relics, no experience, no id — because that is what a defence *is*: a copy of
 * how those four stood at the moment they were set. So this is a plain framed portrait
 * rather than the roster's `ChampionCard`, which needs a `RosterChampion` and would have to
 * be handed six invented zeroes to draw one.
 */
function Defenders({ team }: { team: readonly ArenaTeamMember[] }): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const defs = useMemo(
    () => new Map((bundle?.champions ?? []).map((champion) => [champion.key, champion])),
    [bundle],
  );

  return (
    <ul className={styles.defenders}>
      {team.map((member, index) => {
        const def = defs.get(member.championKey);
        return (
          <li
            key={index}
            className={styles.defender}
            data-rarity={def?.rarity ?? 'common'}
            data-leader={index === 0}
          >
            <Portrait
              src={championArt(def, bundle?.assets).portrait ?? null}
              name={def?.name ?? member.championKey}
              size={72}
            />
            <span className={styles.defenderName}>{def?.name ?? member.championKey}</span>
            <span className={styles.defenderMeta}>
              Lv {member.level} · ★{member.rank}
            </span>
            <span className={styles.defenderPower}>{member.power.toLocaleString()}</span>
            {index === 0 && <span className={styles.defenderLeader}>Leader</span>}
          </li>
        );
      })}
    </ul>
  );
}

/** The defence editor's right-hand column: there is deliberately nobody there. */
function NobodyYet(): ReactNode {
  return (
    <p className={styles.nobody}>
      A defence stands against <strong>everybody</strong> rather than against anyone in particular,
      so there is nobody to line up opposite. What matters is that these four are strong on their
      own — the same AI that runs every enemy in the game will be driving them.
    </p>
  );
}
