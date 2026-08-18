import type { HTMLAttributes, ReactNode } from 'react';
import { Panel as FuiPanel } from '@/fui/components/Panel.ts';
import { FuiSlotted } from '@/fui/react';
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
 * Painted rather than drawn in CSS since the design rework: a 9-sliced leather field with
 * a bronze rule and corner filigree, from the FantasyUIs library. The signature is
 * unchanged on purpose — thirty-odd call sites across sixteen screens got the new look
 * without one of them being edited, which is the whole reason the swap happens in the kit
 * rather than screen by screen.
 *
 * Three things the wrapper still owns, because the library cannot know them:
 *
 *  - **`title` and `actions` are React nodes.** The library's own title bar takes a
 *    string, which is not enough for a title with a count chip in it or a header with a
 *    button at its right edge. So the panel is built chrome-less and Mistvale renders the
 *    header into the body, where React can put anything.
 *  - **`variant` maps rather than passes through.** Mistvale's three names predate the
 *    library's four and are what the screens say; `hero` takes the ornate art, `inset` the
 *    flat inner surface for nested lists.
 *  - **Layout stays in the SCSS module.** The library paints; the module positions. Mixing
 *    those is how a component library ends up owning a game's layout, and then a screen
 *    cannot be rearranged without fighting it.
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
    <FuiSlotted
      {...rest}
      of={FuiPanel}
      options={{
        variant: variant === 'hero' ? 'alt' : variant === 'inset' ? 'surface' : 'default',
        // Not the library's title bar: Mistvale's headers carry React (a chip, a button, a
        // live count), and a string slot cannot hold one.
        ...(padded ? {} : { bodyPad: '0' }),
      }}
      slot=".fui-panel__body"
      className={classes}
    >
      {(title || actions) && (
        <header className={styles.header}>
          {title && <h2 className={styles.title}>{title}</h2>}
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
      )}
      {children}
    </FuiSlotted>
  );
}
