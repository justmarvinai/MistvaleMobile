import type { ReactNode } from 'react';
import { Divider } from '@/fui/components/Divider.ts';
import { Fui } from '@/fui/react';
import styles from './Heading.module.scss';

export type HeadingLevel = 1 | 2 | 3;

export interface HeadingProps {
  /** The line itself. A string in almost every case; a node when a count has to sit in it. */
  children: ReactNode;
  /** The italic line under it — where you are, what this costs, who said it. */
  tagline?: ReactNode;
  /**
   * The painted vine ornament under the tagline. On by default at level 1, because a
   * screen's own title is the one place in the game that earns 40px of nothing but art.
   */
  ornament?: boolean;
  level?: HeadingLevel;
  align?: 'center' | 'left';
  /** Trailing controls — a filter, a "see all", a count. Level 2 and 3 only. */
  actions?: ReactNode;
  id?: string;
}

/**
 * A screen's own voice.
 *
 * Mistvale's screens used to open with a plain `<h1>` in a screen-local module, which is
 * how sixteen screens ended up with sixteen slightly different title treatments and none
 * of them looked like a game. This is the one treatment, and it is lifted directly from
 * the library's own title screen: large, widely letterspaced, lit from behind by the
 * accent, with an italic tagline in soft gold and the pack's painted vine under it.
 *
 * The ornament is the library's `Divider` rather than a background-image of our own, so it
 * follows the theme — swap the art pack and the vine changes with everything else.
 *
 * No serif, per the owner's brief: the library gets its character here from Cinzel, and
 * Mistvale gets the same character from the letterspacing, the glow and the ornament while
 * keeping Pixelify Sans.
 */
export function Heading({
  children,
  tagline,
  ornament,
  level = 1,
  align = 'center',
  actions,
  id,
}: HeadingProps) {
  const Tag = `h${level}` as const satisfies keyof JSX.IntrinsicElements;
  const showOrnament = ornament ?? level === 1;

  return (
    <header className={`${styles.heading} ${styles[`level${level}`]} ${styles[align]}`}>
      <div className={styles.lines}>
        <Tag className={styles.title} id={id}>
          {children}
        </Tag>
        {tagline && <p className={styles.tagline}>{tagline}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
      {showOrnament && <Fui of={Divider} options={{ variant: 'art' }} className={styles.rule} />}
    </header>
  );
}
