import { useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Panel } from '../Panel/Panel';
import { Button } from '../Button/Button';
import { useDialogLayer } from './dialog';
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
