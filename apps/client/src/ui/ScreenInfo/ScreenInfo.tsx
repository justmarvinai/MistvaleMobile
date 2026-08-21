import { useState, type ReactNode } from 'react';
import { Modal } from '../Modal/Modal';
import { Button } from '../Button/Button';
import styles from './ScreenInfo.module.scss';

/**
 * What a screen would like to tell you, when you ask.
 *
 * Every screen in the game used to keep a column of prose down its right-hand side — how
 * the campaign works, how champions grow, what medals buy — and every screen paid about a
 * fifth of its width for it, permanently, to a reader who needed it once. The feature is
 * what the screen is for; the explanation is a footnote that happened to be pinned open.
 *
 * So it is a footnote now: one button by the title, and the same words in a dialog when
 * somebody wants them. Nothing is lost and the screen gets its width back.
 *
 * The button is deliberately part of the heading rather than floating: a player looking for
 * "what is this screen" looks at its name first, and the answer is next to the question.
 */
export interface ScreenInfoProps {
  /** The screen's name, so the dialog says which thing it is explaining. */
  title: string;
  children: ReactNode;
  /** Overrides the button's accessible name — "About the Arena" reads better than the title. */
  label?: string;
}

export function ScreenInfo({ title, children, label }: ScreenInfoProps): JSX.Element {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* Wrapped rather than classed: `Button` deliberately omits `className` so a call
          site cannot reach past the painted variants into its art. */}
      <span className={styles.button}>
        <Button
          size="sm"
          variant="ghost"
          aria-label={label ?? `About ${title}`}
          onClick={() => setOpen(true)}
        >
          <span aria-hidden="true">i</span>
        </Button>
      </span>

      <Modal open={open} title={title} onClose={() => setOpen(false)} size="info">
        <div className={styles.body}>{children}</div>
      </Modal>
    </>
  );
}
