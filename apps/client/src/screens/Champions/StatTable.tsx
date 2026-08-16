import type { ChampionStats, Stat } from '@mistvale/shared';
import styles from './StatTable.module.scss';

/**
 * A champion's stats, split by where they come from.
 *
 * Showing base and relic contribution side by side is the whole point: it is how a player
 * learns that a percentage main stat on a low-base champion is wasted, which is the first
 * real piece of build literacy the genre teaches. Both columns are server numbers.
 */

const LABELS: Record<Stat, string> = {
  hp: 'HP',
  atk: 'ATK',
  def: 'DEF',
  spd: 'SPD',
  critRate: 'C.RATE',
  critDmg: 'C.DMG',
  res: 'RES',
  acc: 'ACC',
};

/** Stats measured in percentage points get a % suffix; the rest are magnitudes. */
const PERCENT: ReadonlySet<Stat> = new Set<Stat>(['critRate', 'critDmg']);

const ORDER: readonly Stat[] = ['hp', 'atk', 'def', 'spd', 'critRate', 'critDmg', 'res', 'acc'];

export function StatTable({ stats }: { stats: ChampionStats }): JSX.Element {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Stat</th>
          <th scope="col">Base</th>
          <th scope="col">Relics</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {ORDER.map((stat) => {
          const bonus = Math.round(stats.gear[stat]);
          return (
            <tr key={stat}>
              <th scope="row">{LABELS[stat]}</th>
              <td>{Math.round(stats.base[stat]).toLocaleString()}</td>
              <td className={bonus > 0 ? styles.bonus : styles.zero}>
                {bonus > 0 ? `+${bonus.toLocaleString()}` : '—'}
              </td>
              <td className={styles.total}>
                {Math.round(stats.total[stat]).toLocaleString()}
                {PERCENT.has(stat) ? '%' : ''}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
