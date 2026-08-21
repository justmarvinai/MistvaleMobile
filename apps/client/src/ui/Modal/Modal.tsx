import { useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Panel } from '../Panel/Panel';
import { Button } from '../Button/Button';
import { useDialogLayer } from './dialog';
import styles from './Modal.module.scss';

/**
 * How much room a dialog needs, said as what it is for rather than as a number.
 *
 * Every dialog in the game used to name its own width, and the numbers drifted the way
 * hand-picked numbers do: 480, 520, 560, 600, 640, 720, 1160 — seven widths for four jobs,
 * none of them related to each other, and most of them chosen when the content was smaller
 * than it is now. The owner's note was that the game leaves a screen's worth of empty space
 * around a dialog it has squeezed the content inside; naming the job is what stops that
 * happening again the next time a dialog grows.
 *
 * - `info` — words, and a way out. Nothing to do but read it. Deliberately still narrow:
 *   a paragraph stretched to 1400px is harder to read, not easier.
 * - `work` — a decision with a short list behind it: a floor, a reward, a run summary.
 * - `wide` — a *grid* of cards. Team select, the relic slot, the food picker. These are the
 *   ones that were worst: eight champion cards wrapped two-per-row inside 720px while
 *   fourteen hundred pixels of backdrop sat around them.
 * - `full` — a screen that happens to be a dialog. The champion sheet, the summon reveal.
 *   Wide enough that the sheet's two columns are both full-size rather than one of them
 *   being the leftovers.
 */
export type ModalSize = 'info' | 'work' | 'wide' | 'full';

/** The four numbers, in one place, where the relationship between them is visible. */
const SIZE: Readonly<Record<ModalSize, number>> = Object.freeze({
  info: 560,
  work: 900,
  wide: 1240,
  full: 1680,
});

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Blocks backdrop and Escape dismissal for decisions that must be answered. */
  dismissible?: boolean;
  /** What this dialog is for. Defaults to `info`, which is the safest thing to be wrong about. */
  size?: ModalSize;
}

/**
 * A focus-trapping modal dialog.
 *
 * Escape closes, focus moves in on open and returns to the trigger on close, and Tab
 * cycles within the dialog — the behaviour a native `<dialog>` gives, implemented here
 * so the pixel framing and animation stay under our control.
 *
 * When two are open — the relic picker over the champion sheet, a celebration over a
 * screen's own dialog — only the top one is live. Which one that is comes from
 * `./stack`, not from the order the components happen to be written in.
 */
export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
  dismissible = true,
  size = 'info',
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  // The stack, the focus trap and the cues — see `dialog.ts`. Shared with the results
  // screen, which is a full-screen overlay of the same kind and used to be a `Modal`.
  const { depth } = useDialogLayer(dialogRef, { open, dismissible, onClose });

  if (!open) return null;

  return createPortal(
    <div
      className={styles.backdrop}
      // The token stays the single source of truth in SCSS; only the offset comes from
      // here, so a modal opened second genuinely sits above the one it was opened from.
      style={{ '--mv-layer-depth': depth } as CSSProperties}
      onMouseDown={(event) => {
        if (top && dismissible && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className={styles.dialog}
        style={{ maxWidth: SIZE[size] }}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        tabIndex={-1}
      >
        <Panel
          variant="hero"
          title={title}
          actions={
            dismissible ? (
              <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close">
                ✕
              </Button>
            ) : undefined
          }
        >
          <div className={styles.body}>{children}</div>
          {footer && <div className={styles.footer}>{footer}</div>}
        </Panel>
      </div>
    </div>,
    document.body,
  );
}
