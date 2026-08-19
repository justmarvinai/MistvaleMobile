import { useMemo } from 'react';
import type { DungeonDef } from '@mistvale/shared';
import { WEEKDAY_NAMES } from '@mistvale/shared';
import styles from './SpringDial.module.scss';

/**
 * Which spring runs on which day.
 *
 * Five springs keep their own hours and the Depths hub said so one keep at a time — "Open
 * Tuesday & Friday" on this tile, "Open Thursday & Sunday" on that one — which answers
 * "is this open now" and never answers the question a player actually has, which is *when
 * do I come back for Verdant essence*. Reading it off five separate tiles is a job.
 *
 * So: the week, once, with the springs on it. Mistvale's own because the rotation is
 * Mistvale's — the library has a calendar for a login track and nothing for "these five
 * places take turns", and no reason to.
 *
 * Today is marked from the *server's* weekday, never from the browser's clock: a player in
 * another timezone must be told the same day the Depths route will enforce.
 */
export interface SpringDialProps {
  springs: readonly DungeonDef[];
  /** The server's day of the week, 0–6. Null before the first read. */
  today: number | null;
  className?: string;
}

export function SpringDial({ springs, today, className }: SpringDialProps): JSX.Element | null {
  /** Day → the springs open on it. A spring with no days is open every day. */
  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, day) => ({
        day,
        name: WEEKDAY_NAMES[day] ?? '',
        open: springs.filter(
          (spring) => spring.openDays.length === 0 || spring.openDays.includes(day),
        ),
      })),
    [springs],
  );

  if (springs.length === 0) return null;

  return (
    <ol className={[styles.dial, className ?? ''].filter(Boolean).join(' ')}>
      {week.map((entry) => (
        <li
          key={entry.day}
          className={styles.day}
          data-today={entry.day === today ? 'true' : undefined}
        >
          <span className={styles.name}>{entry.name.slice(0, 3)}</span>
          <span className={styles.springs}>
            {entry.open.map((spring) => (
              // The first word is the element — "The Verdant Spring" is "Verdant" here,
              // because five rows of "The … Spring" is five rows of the same three words.
              <span key={spring.key} className={styles.spring}>
                {spring.name.replace(/^The\s+/, '').replace(/\s+Spring$/, '')}
              </span>
            ))}
          </span>
        </li>
      ))}
    </ol>
  );
}
