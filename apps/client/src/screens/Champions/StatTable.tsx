import type { ChampionStats, Stat } from '@mistvale/shared';
import { STAT_ORDER, statLabel } from '../../ui/statLabels';
import styles from './StatTable.module.scss';

/**
 * A champion's stats, split by where they come from.
 *
 * Showing base, relics and masteries side by side is the whole point: it is how a player
 * learns that a percentage main stat on a low-base champion is wasted, which is the first
 * real piece of build literacy the genre teaches. Every column is a server number.
 *
 * Masteries earn their own column rather than being folded into the relic one because they
 * are a *different decision* — relics are farmed and swapped, masteries are committed to.
 */

/** Stats measured in percentage points get a % suffix; the rest are magnitudes. */
const PERCENT: ReadonlySet<Stat> = new Set<Stat>(['critRate', 'critDmg']);

export function StatTable({ stats }: { stats: ChampionStats }): JSX.Element {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Stat</th>
          <th scope="col">Base</th>
          <th scope="col">Relics</th>
          <th scope="col">Masteries</th>
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {STAT_ORDER.map((stat) => {
          const bonus = Math.round(stats.gear[stat]);
          const learned = Math.round(stats.mastery?.[stat] ?? 0);
          return (
            <tr key={stat}>
              <th scope="row">{statLabel(stat)}</th>
              <td>{Math.round(stats.base[stat]).toLocaleString()}</td>
              <td className={bonus > 0 ? styles.bonus : styles.zero}>
                {bonus > 0 ? `+${bonus.toLocaleString()}` : '—'}
              </td>
              <td className={learned > 0 ? styles.bonus : styles.zero}>
                {learned > 0 ? `+${learned.toLocaleString()}` : '—'}
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
