import styles from './LevelDisc.module.scss';

/**
 * An account's level, as a disc on the corner of its portrait.
 *
 * The owner's reference (2026-08-27) puts it there rather than under the frame, and the
 * genre agrees: it reads as a seal on the portrait instead of a caption beside it. Round
 * because a level is one figure and a disc stays balanced whether it holds 1 or 60 — the
 * boxed tag this replaced grew sideways with the number and pulled the corner out of true.
 *
 * Its own component because it belongs to *two* portraits — the top bar's chip and the
 * profile card behind it — and those live in different folders. Two copies of a mark this
 * small is how the two stop agreeing.
 *
 * Positioned by the holder, not by itself: the caller is a `position: relative` box and
 * decides how far the disc hangs off it, because a 56px portrait and a 108px one want
 * different overhangs and the disc has no way to know which it is on.
 *
 * **Whether it is announced is the caller's business too**, and it matters. On the top bar
 * the disc sits inside a button whose accessible name already ends "…, level 54", so a disc
 * that also spoke would say the level twice in one breath. On the profile card nothing else
 * states it, and the first cut of this hid it there as well — which took the level off that
 * card for a screen reader entirely. A browser spec caught it, asking the dialog for its
 * level and finding none.
 */
export function LevelDisc({
  level,
  size = 'sm',
  label,
}: {
  level: number;
  size?: 'sm' | 'lg';
  /** Given when nothing else on the holder says the level; omitted when something does. */
  label?: string;
}): JSX.Element {
  return (
    <span
      className={`${styles.disc} ${styles[size]}`}
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      {level}
    </span>
  );
}
