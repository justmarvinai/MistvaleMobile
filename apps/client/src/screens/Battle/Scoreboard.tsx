import type { UnitContribution } from '@mistvale/engine';
import { Portrait } from '../../ui/Portrait/Portrait';
import { championArt } from '../../ui/championArt';
import { useContentStore } from '../../state/contentStore';
import styles from './Scoreboard.module.scss';

/**
 * What your four actually did.
 *
 * A fight in this genre is four champions and a wall of numbers that scroll past in three
 * seconds, and until now the only thing the game ever said about them afterwards was
 * whether the wall fell over. A player retunes a team by knowing which of the four is
 * carrying it — which is exactly the question the event log has been able to answer since
 * P3 and no screen had ever asked.
 *
 * **The owner's rule: your side only.** The same fold can read the enemy's side (it takes a
 * `side`, and the Admin battle inspector will want that) but this is a report on the team
 * you brought, not a breakdown of the enemy's health bar.
 *
 * Three columns and never a total, because damage, healing and shielding are three
 * different kinds of work and adding them produces a number that means nothing. A column
 * is drawn only when somebody filled it: a campaign team with no healer would otherwise
 * carry a column of dashes on every result screen it ever sees, and the shielding column
 * exists at all because nine champions in Mistvale shield and never heal.
 *
 * The bar is the row's share of the **biggest figure in its own column**, so the three
 * scales never get compared to each other — 40,000 damage and 4,000 healing are both
 * full bars, which is right: they are answering different questions.
 *
 * Every number here is the server's. The browser holds the same event log and could add it
 * up, which is precisely why it does not (CLAUDE.md — the client renders server numbers).
 */

const COLUMNS = [
  { key: 'damage', label: 'Damage' },
  { key: 'healing', label: 'Healing' },
  { key: 'shielding', label: 'Shielded' },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];

export function Scoreboard({ rows }: { rows: readonly UnitContribution[] }): JSX.Element | null {
  const bundle = useContentStore((state) => state.bundle);
  if (rows.length === 0) return null;

  // A column nobody filled is a column of zeroes. Damage always stays: a fight where the
  // party dealt none is itself worth seeing, and dropping it would leave a table with no
  // columns at all.
  const shown = COLUMNS.filter(
    (column) => column.key === 'damage' || rows.some((row) => row[column.key] > 0),
  );
  const peak = (key: ColumnKey): number => Math.max(1, ...rows.map((row) => row[key]));

  return (
    <section className={styles.board} aria-label="What your champions did">
      <h2 className={styles.head}>What your champions did</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col" className={styles.who}>
              Champion
            </th>
            {shown.map((column) => (
              <th key={column.key} scope="col" className={styles.figure}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const def = bundle?.champions.find((entry) => entry.key === row.defKey);
            return (
              <tr key={`${row.ref.side}:${row.ref.slot}`} data-fell={row.fell}>
                <th scope="row" className={styles.who}>
                  <Portrait
                    src={championArt(def, bundle?.assets).portrait ?? null}
                    name={row.name}
                    size={34}
                    className={styles.face}
                  />
                  <span className={styles.name}>{row.name}</span>
                  {/* Said quietly and said at all: a champion who contributed nothing
                      after wave one is a different fact from one who contributed nothing
                      while standing there the whole fight. */}
                  {row.fell && <span className={styles.fell}>fell</span>}
                </th>
                {shown.map((column) => (
                  <td key={column.key} className={styles.figure}>
                    <span className={styles.bar} aria-hidden="true">
                      <span
                        className={styles.fill}
                        data-kind={column.key}
                        style={{ width: `${(row[column.key] / peak(column.key)) * 100}%` }}
                      />
                    </span>
                    <span className={styles.value} data-zero={row[column.key] === 0}>
                      {row[column.key].toLocaleString()}
                    </span>
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
