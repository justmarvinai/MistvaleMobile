import type { ChampionStats, Stat } from '@mistvale/shared';
import { STAT_ORDER, statLabel } from '../../ui/labels';
import { useTip } from '../../ui/Tooltip/useTooltip';
import { statTip } from '../../ui/Tooltip/tips';
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
 *
 * **Collection** is the fourth, and the one that most needs saying out loud: imprint and
 * standing are the only contributions a player cannot see by looking at the champion. The
 * relics are on it and the masteries are on its board, but a bonus earned by pulling a
 * duplicate two months ago would otherwise be an unexplained number in the total — and an
 * unexplained number in a stat table is worse than no column at all. Drawn only when it is
 * non-zero, so a new account still gets the four-column table it can read.
 *
 * Every row says what its stat *does* on hover. Four of the eight are self-evident and
 * four are not: speed decides how often a champion acts and is what most fights are
 * actually settled by; accuracy and resistance are a pair, and neither means anything
 * without the other; critical damage is a multiplier that does nothing without a rate to
 * trigger it. A table that lists eight numbers and explains none of them is a table a new
 * player cannot read, and this one is the first build decision the game asks for.
 */

/** Stats measured in percentage points get a % suffix; the rest are magnitudes. */
const PERCENT: ReadonlySet<Stat> = new Set<Stat>(['critRate', 'critDmg']);

export function StatTable({ stats }: { stats: ChampionStats }): JSX.Element {
  // A column of eight dashes teaches nothing and costs a fifth of the table's width, so
  // the collection column appears with the collection.
  const showCollection = STAT_ORDER.some((stat) => Math.round(stats.account?.[stat] ?? 0) !== 0);

  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th scope="col">Stat</th>
          <th scope="col">Base</th>
          <th scope="col">Relics</th>
          <th scope="col">Masteries</th>
          {showCollection && <th scope="col">Collection</th>}
          <th scope="col">Total</th>
        </tr>
      </thead>
      <tbody>
        {STAT_ORDER.map((stat) => (
          <StatRow key={stat} stat={stat} stats={stats} showCollection={showCollection} />
        ))}
      </tbody>
    </table>
  );
}

/**
 * One row.
 *
 * A component because a tooltip is a hook, and eight of them cannot be called from inside
 * a map. The tooltip is attached to the row's *label* rather than the row: a `<tr>` in a
 * table with collapsed borders has a box a pointer can be inside without being over any
 * cell, which puts the card in a different place depending on where in the gap you are.
 */
function StatRow({
  stat,
  stats,
  showCollection,
}: {
  stat: Stat;
  stats: ChampionStats;
  showCollection: boolean;
}): JSX.Element {
  const bonus = Math.round(stats.gear[stat]);
  const learned = Math.round(stats.mastery?.[stat] ?? 0);
  const collected = Math.round(stats.account?.[stat] ?? 0);
  const ref = useTip(
    statTip(stat, {
      base: stats.base[stat],
      gear: stats.gear[stat],
      masteries: stats.mastery?.[stat] ?? 0,
      collection: stats.account?.[stat] ?? 0,
      total: stats.total[stat],
    }),
  );

  return (
    <tr>
      <th scope="row" ref={ref} className={styles.rowLabel}>
        {statLabel(stat)}
      </th>
      <td>{Math.round(stats.base[stat]).toLocaleString()}</td>
      <td className={bonus > 0 ? styles.bonus : styles.zero}>
        {bonus > 0 ? `+${bonus.toLocaleString()}` : '—'}
      </td>
      <td className={learned > 0 ? styles.bonus : styles.zero}>
        {learned > 0 ? `+${learned.toLocaleString()}` : '—'}
      </td>
      {showCollection && (
        <td className={collected > 0 ? styles.bonus : styles.zero}>
          {collected > 0 ? `+${collected.toLocaleString()}` : '—'}
        </td>
      )}
      <td className={styles.total}>
        {Math.round(stats.total[stat]).toLocaleString()}
        {PERCENT.has(stat) ? '%' : ''}
      </td>
    </tr>
  );
}
