import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Panel } from '../Panel/Panel';
import { Button } from '../Button/Button';
import { CUE, playCue } from '../../audio';
import { useLayer } from './stack';
import styles from './Modal.module.scss';

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  /** Blocks backdrop and Escape dismissal for decisions that must be answered. */
  dismissible?: boolean;
  width?: number;
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
  width = 480,
}: ModalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  const { top, depth } = useLayer(useId(), open);

  // Focus follows the *dialog*, not the stack. Opening one over another captures the
  // element inside the lower one and gives it back on close, so a picker dismissed over a
  // champion sheet returns the caret to the slot it was opened from.
  //
  // The open and close cues ride the same effect, which is what keeps them honest: they
  // are tied to the dialog actually appearing rather than to whatever button was pressed,
  // so a modal opened by a keystroke or by the tutorial sounds the same as one clicked.
  useEffect(() => {
    if (!open) return;
    playCue(CUE.open);

    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // Move focus into the dialog so keyboard users are not left behind it.
    const firstFocusable = dialogRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (firstFocusable ?? dialogRef.current)?.focus();

    return () => {
      playCue(CUE.close);
      previouslyFocused.current?.focus();
    };
  }, [open]);

  // Keys belong to the top dialog alone. Installed unconditionally, this is the listener
  // that used to close two modals with one Escape and let Tab wander into the dialog
  // underneath.
  useEffect(() => {
    if (!open || !top) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !dialogRef.current) return;

      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not(:disabled), [href], input:not(:disabled), select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
    };
  }, [open, top, dismissible, onClose]);

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
        style={{ maxWidth: width }}
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
