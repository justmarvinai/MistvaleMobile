import styles from './Hero.module.scss';

/**
 * A mode's key art as the room it is fought in, rather than an icon in a row (C46).
 *
 * The Valewurm, the Wurm Wakes and the Sunken Stair are each one place with one thing to
 * do in it, and each drew that as a 96px picture beside a button — or no picture at all —
 * over a panel of text that stopped two thirds of the way down the frame. This is the shape
 * a mode screen takes in this genre: the painting fills a tall block, a wash keeps the
 * words readable over it, and the block's foot carries what the player came to press.
 *
 * Presentation only: what stands in the foot — keys and a button, a health bar and a
 * strike, descents and a way down — is the caller's, because each of those is a different
 * economy and a hero that knew all three would be where they got confused.
 */
export function Hero({
  art,
  ink,
  title,
  tagline,
  label,
  className,
  children,
}: {
  /** The library painting's id, without the `--fui-img-` prefix. */
  art: string;
  /** The rim's colour — a mode's own ink, so the block reads as the mode's. */
  ink?: string | undefined;
  title?: string | undefined;
  tagline?: string | undefined;
  /** The block's accessible name; the title when there is one. */
  label: string;
  className?: string;
  children?: React.ReactNode;
}): JSX.Element {
  return (
    <section
      className={[styles.hero, className].filter(Boolean).join(' ')}
      style={
        {
          '--mv-hero-art': `var(--fui-img-${art})`,
          ...(ink ? { '--mv-hero-ink': ink } : {}),
        } as React.CSSProperties
      }
      aria-label={label}
    >
      <span className={styles.art} aria-hidden="true" />
      <span className={styles.wash} aria-hidden="true" />
      {(title || tagline) && (
        <header className={styles.head}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {tagline && <p className={styles.tagline}>{tagline}</p>}
        </header>
      )}
      <div className={styles.foot}>{children}</div>
    </section>
  );
}
