import type { ReactNode } from 'react';
import styles from './Heading.module.scss';

export type HeadingLevel = 1 | 2 | 3;

export interface HeadingProps {
  /** The line itself. A string in almost every case; a node when a count has to sit in it. */
  children: ReactNode;
  /** The line under it — where you are, what this costs, who said it. */
  tagline?: ReactNode;
  level?: HeadingLevel;
  align?: 'center' | 'left';
  /** Trailing controls — a filter, a "see all", a count, the screen's info button. */
  actions?: ReactNode;
  id?: string;
}

/**
 * A screen's own voice, kept quiet.
 *
 * This used to be the loudest thing on every screen: a 40px centred title, an italic
 * tagline under it and a painted vine under that, costing something like a fifth of the
 * viewport before the feature had drawn a pixel. On a campaign map or a relic vault that is
 * the wrong trade — the owner's note was that the *features* need the height, and the
 * reference he gave (Raid's own campaign map) puts its screen name in a corner and gives
 * everything else to the map.
 *
 * So: one line, left, at reading size, with the tagline beside it rather than beneath. It
 * still says which screen you are on and still sounds like the game; it just stops
 * announcing itself. Levels 2 and 3 are unchanged — they were already section labels.
 *
 * No serif, per the owner's brief: the character comes from the letterspacing and the
 * accent, with Pixelify Sans doing the work.
 */
export function Heading({
  children,
  tagline,
  level = 1,
  align = 'left',
  actions,
  id,
}: HeadingProps) {
  const Tag = `h${level}` as const satisfies keyof JSX.IntrinsicElements;

  return (
    <header className={`${styles.heading} ${styles[`level${level}`]} ${styles[align]}`}>
      <div className={styles.lines}>
        <Tag className={styles.title} id={id}>
          {children}
        </Tag>
        {tagline && <p className={styles.tagline}>{tagline}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
