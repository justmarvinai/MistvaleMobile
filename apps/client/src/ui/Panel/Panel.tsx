import type { HTMLAttributes, ReactNode } from 'react';
import styles from './Panel.module.scss';

// `title` is redefined as rich content for the panel header, so the native
// tooltip attribute is omitted rather than shadowed.
export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** `hero` is the heavier double-bordered treatment used for focal surfaces. */
  variant?: 'default' | 'hero' | 'inset';
  title?: ReactNode;
  /** Rendered at the right edge of the title bar. */
  actions?: ReactNode;
  padded?: boolean;
  children?: ReactNode;
}

/**
 * The framed surface everything in Mistvale sits on.
 *
 * The pixel-art border comes from CSS rather than an image at this stage; the Kenney
 * 9-slice frames are layered on in the P10 art pass without touching call sites.
 */
export function Panel({
  variant = 'default',
  title,
  actions,
  padded = true,
  children,
  className,
  ...rest
}: PanelProps) {
  const classes = [styles.panel, styles[variant], padded ? styles.padded : '', className ?? '']
    .filter(Boolean)
    .join(' ');

  return (
    <div {...rest} className={classes}>
      {(title || actions) && (
        <header className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children}
    </div>
  );
}
