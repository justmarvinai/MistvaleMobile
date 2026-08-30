import type { UnitContribution } from '@mistvale/engine';
import type { ChampionDef, RosterChampion } from '@mistvale/shared';
import { Portrait } from '../../ui/Portrait/Portrait';
import { championArt } from '../../ui/championArt';
import { useContentStore } from '../../state/contentStore';
import { useRosterStore } from '../../state/rosterStore';
import styles from './ResultParty.module.scss';

/**
 * The four who fought, and what each of them did.
 *
 * One card per champion — their face, the star rank and level the copy finished on, how
 * far that level has left to run, and three bars for the three kinds of work a champion
 * can do in a fight. It is the shape the owner's reference uses and it answers the
 * question a table of names never quite did: *which of my four is carrying this team*.
 *
 * Every figure is the server's. The browser holds the same event log and could add it up,
 * which is exactly why it does not (CLAUDE.md — the client renders server numbers).
 *
 * **Your side only**, which is the owner's rule from C21: this reports on the team you
 * brought, not on the enemy's health bar.
 *
 * Three bars and never a total, because damage, healing and shielding are three different
 * kinds of work and adding them produces a number that means nothing. Each bar is the
 * card's share of the **biggest figure in its own column across the party**, so the three
 * scales are never compared to each other — 40,000 damage and 4,000 healing are both full
 * bars, which is right: they are answers to different questions. A bar nobody in the party
 * filled is not drawn at all, so a team with no healer does not carry an empty green track
 * on every result screen it ever sees.
 */

const BARS = [
  { key: 'damage', label: 'Damage dealt' },
  { key: 'shielding', label: 'Shield granted' },
  { key: 'healing', label: 'Healing done' },
] as const;

type BarKey = (typeof BARS)[number]['key'];

export function ResultParty({
  rows,
  team,
  borrowedFrom,
}: {
  rows: readonly UnitContribution[];
  /** Roster ids in formation order, so slot *n* is `team[n]`. Empty on a borrowed team. */
  team: readonly string[];
  /**
   * The warden who lent a champion to this fight, and the slot they stood in (C37).
   *
   * Named on the card because a borrowed champion resolves to no roster copy and would
   * otherwise be the one face on the screen with no level, no rank and no explanation —
   * and because the lender's whole reward for lending is that somebody saw their name.
   */
  borrowedFrom?: { slot: number; profileName: string } | null;
}): JSX.Element | null {
  const bundle = useContentStore((state) => state.bundle);
  const roster = useRosterStore((state) => state.champions);
  if (rows.length === 0) return null;

  // Damage always stays: a fight where the party dealt none is itself worth seeing, and
  // dropping it would leave cards with no bars at all.
  const shown = BARS.filter((bar) => bar.key === 'damage' || rows.some((row) => row[bar.key] > 0));
  const peak = (key: BarKey): number => Math.max(1, ...rows.map((row) => row[key]));

  return (
    <ul className={styles.party} aria-label="What your champions did">
      {rows.map((row) => {
        const def = bundle?.champions.find((entry) => entry.key === row.defKey);
        // The copy that fought, when the account owns one. A borrowed team (the cold open,
        // every Trial) has no roster id at all, and a champion fed away between the last
        // turn and this screen has one that no longer resolves — both draw the card
        // without a level ladder rather than not drawing the card.
        const owned = roster.find((entry) => entry.id === team[row.ref.slot]);
        const lender =
          borrowedFrom && borrowedFrom.slot === row.ref.slot ? borrowedFrom.profileName : null;
        return (
          <li key={`${row.ref.side}:${row.ref.slot}`}>
            <ResultChampion
              row={row}
              def={def}
              owned={owned}
              lender={lender}
              bars={shown.map((bar) => ({
                ...bar,
                value: row[bar.key],
                share: row[bar.key] / peak(bar.key),
              }))}
            />
          </li>
        );
      })}
    </ul>
  );
}

interface Bar {
  key: BarKey;
  label: string;
  value: number;
  share: number;
}

function ResultChampion({
  row,
  def,
  owned,
  lender,
  bars,
}: {
  row: UnitContribution;
  def: ChampionDef | undefined;
  owned: RosterChampion | undefined;
  /** The warden this champion was borrowed from, or null for one of your own. */
  lender: string | null;
  bars: readonly Bar[];
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const level = owned?.level ?? null;
  const capped = owned ? owned.xpToNextLevel === 0 : false;
  // `xp` is what has been earned *inside* the current level and `xpToNextLevel` is what is
  // still owed, so the level's own requirement is the pair added together — there is no
  // third field, and dividing by either one alone reads a wrong bar.
  const need = owned ? owned.xp + owned.xpToNextLevel : 0;

  return (
    <article className={styles.card} data-fell={row.fell}>
      {/* The level ladder above the face, as the reference has it: a champion at the
          ceiling of their rank says so in words, because a bar sitting full is the one
          state a progress readout cannot explain by itself. */}
      {owned && (
        <div className={styles.ladder}>
          <span className={styles.ladderLabel}>{capped ? 'At the cap' : 'Experience'}</span>
          <span className={styles.track} aria-hidden="true">
            <span
              className={styles.grow}
              style={{ width: capped ? '100%' : `${need > 0 ? (owned.xp / need) * 100 : 0}%` }}
            />
          </span>
        </div>
      )}

      {owned && (
        <p className={styles.stars} aria-label={`Rank ${owned.rank} stars`}>
          {'★'.repeat(owned.rank)}
        </p>
      )}

      <Portrait
        src={championArt(def, bundle?.assets).portrait ?? null}
        name={row.name}
        size={64}
        className={styles.face}
      />

      <p className={styles.name}>{row.name}</p>
      <p className={styles.level}>
        {/* A borrowed champion has no roster copy here, so the level ladder and the star
            row above are both absent — this is what stands in their place, and it is the
            more interesting fact anyway. */}
        {lender ? `Lent by ${lender}` : level === null ? '—' : `Level ${level}`}
        {/* Said quietly and said at all: a champion who contributed nothing after wave one
            is a different fact from one who contributed nothing while standing there the
            whole fight. */}
        {row.fell && <span className={styles.fell}>fell</span>}
      </p>

      <dl className={styles.bars}>
        {bars.map((bar) => (
          <div key={bar.key} className={styles.bar}>
            <dt className={styles.barLabel}>{bar.label}</dt>
            <dd className={styles.barValue} data-zero={bar.value === 0}>
              <span className={styles.track} aria-hidden="true">
                <span
                  className={styles.grow}
                  data-kind={bar.key}
                  style={{ width: `${bar.share * 100}%` }}
                />
              </span>
              <span className={styles.figure}>{bar.value.toLocaleString()}</span>
            </dd>
          </div>
        ))}
      </dl>
    </article>
  );
}
