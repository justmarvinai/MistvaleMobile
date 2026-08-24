import type { ImprintState } from '@mistvale/shared';
import styles from './Imprint.module.scss';

/**
 * What duplicates of this champion are worth.
 *
 * The card exists because imprint is the only thing on the champion sheet a player cannot
 * see by looking at the champion — the relics are on it and the masteries are on its
 * board, and a percentage earned by a pull two months ago is otherwise an unexplained
 * number in the stat table's total.
 *
 * It says three things and no more: how many copies, what they are worth, and how many the
 * next mark wants. Everything here is the server's; the ladder is content, so a retune in
 * Admin changes what this card says without a deploy.
 */
/**
 * The mark a level wears.
 *
 * Numerals rather than a count, because "Mark III" reads as a rank and "3 imprints" reads
 * as an inventory. Falls back to the number past the ladder's shipped length, so an
 * operator who adds a sixth rung gets "Mark 6" rather than a blank.
 */
const MARKS: readonly string[] = ['I', 'II', 'III', 'IV', 'V'];

export function Imprint({ state }: { state: ImprintState }): JSX.Element {
  const { level, copies, nextAt, bonus } = state;
  const toGo = nextAt === null ? null : nextAt - copies;

  return (
    <section className={styles.card} aria-label="Imprint">
      <header className={styles.head}>
        <h3 className={styles.title}>Imprint</h3>
        <span className={styles.level}>
          {level > 0 ? `Mark ${MARKS[level - 1] ?? level}` : 'Unmarked'}
        </span>
      </header>

      <p className={styles.copies}>
        <strong>{copies}</strong> {copies === 1 ? 'copy' : 'copies'} gathered
      </p>

      {bonus.atkPct > 0 && (
        <p className={styles.bonus}>
          +{bonus.hpPct}% HP · +{bonus.atkPct}% ATK · +{bonus.defPct}% DEF, to every copy
        </p>
      )}

      <p className={styles.next}>
        {toGo === null
          ? 'Fully marked. There is nothing more the mist can take from a duplicate.'
          : `${toGo} more ${toGo === 1 ? 'copy' : 'copies'} for the next mark.`}
      </p>
    </section>
  );
}
