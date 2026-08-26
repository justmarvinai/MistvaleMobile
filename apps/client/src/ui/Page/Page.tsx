import type { ReactNode } from 'react';
import styles from './Page.module.scss';

/**
 * One column, centred, with a ceiling — and the reason it exists (C12).
 *
 * Mistvale is played on a desktop and dressed like a phone game. Until this component it
 * was *laid out* like one too: every screen was a block that grew to the window and then
 * stopped filling, so a 2000px display drew three 270px cards against the left edge with
 * thirteen hundred pixels of nothing beside them. The owner's word for it was
 * "overwhelming and overcrowded", and both halves are the same fault — content squeezed
 * into a narrow ribbon *looks* crowded no matter how much room is going spare around it.
 *
 * Three ceilings rather than one, because screens are not the same shape:
 *
 *  - `default` — the everyday page. Three comfortable cards across, scannable in one look.
 *  - `narrow` — a screen that is mostly words. A reading column has a natural width and a
 *    2000px line of prose is not it.
 *  - `wide` — a screen that wants the pixels: the relic vault's grid, a long ladder.
 *  - `full` — a *scene* rather than a column. The campaign map and the battlefield are
 *    pictures, and a picture that centres inside a rule is a picture with letterboxing.
 *
 * `fills` is the other axis and it is about scrolling: a page whose own children scroll —
 * a tower, a virtualised grid — must be told to fill the frame, or it grows to its content
 * and hands the scroll to the window instead.
 */
export function Page({
  width = 'default',
  fills = false,
  className,
  children,
  ...rest
}: {
  width?: 'default' | 'narrow' | 'wide' | 'full';
  fills?: boolean;
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'>): JSX.Element {
  return (
    <div
      className={[styles.page, styles[width], fills ? styles.fills : '', className ?? '']
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {children}
    </div>
  );
}

/**
 * A grid of cards that shares out the room it is given rather than hoarding it.
 *
 * The floor is a *minimum*, not a width: `auto-fit` fits as many tracks as clear the floor
 * and then stretches them to fill the row, so three cards in a wide page are three wide
 * cards rather than three narrow ones with a gap where a fourth would go. That distinction
 * is the whole difference between the Expeditions screen before and after C12.
 *
 *  - `card` — a title, a few chips, a button.
 *  - `prose` — one carrying a paragraph, which needs more room before it reads well.
 *  - `hub` — a destination: art, a name and a line about what the place is for.
 */
export function CardGrid({
  min = 'card',
  className,
  children,
  ...rest
}: {
  min?: 'card' | 'prose' | 'hub';
  className?: string;
  children: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'className' | 'children'>): JSX.Element {
  const floor =
    min === 'prose' ? styles.gridProse : min === 'hub' ? styles.gridHub : styles.gridCard;
  return (
    <div className={[styles.grid, floor, className ?? ''].filter(Boolean).join(' ')} {...rest}>
      {children}
    </div>
  );
}
