import { useEffect, useId, type RefObject } from 'react';
import { CUE, playCue } from '../../audio';
import { useLayer, type LayerPlace } from './stack';

/**
 * What it takes to be a dialog, for anything that is one.
 *
 * `Modal` used to own all of this privately, which was correct while it was the only
 * full-screen overlay in the game. The design rework added a second — the results screen
 * is the library's `ResultScreen` now, painted rather than composed, and it is still a
 * thing that covers the game, holds the only action and must not let Tab wander behind
 * it. Two copies of a focus trap is how one of them silently rots, so it lives here.
 *
 * Three jobs, and they are separable on purpose:
 *
 *  - **A place in the stack.** The last overlay opened owns Escape and the backdrop, and
 *    its depth decides what is painted over what (P10b).
 *  - **Focus, in and back out.** Focus follows the *dialog*, not the stack: opening one
 *    over another captures the element inside the lower one and gives it back on close.
 *  - **Keys, for the top one alone.** Installed unconditionally, this is the listener that
 *    used to close two dialogs with one Escape and let Tab wander into the one underneath.
 *
 * The caller still owns the markup — `role`, `aria-modal` and the accessible name are the
 * caller's to write, because a hook cannot know whether the element it was handed is the
 * dialog or a wrapper around it.
 */
export interface DialogOptions {
  /** Whether the dialog is on screen. */
  open: boolean;
  /** Whether Escape closes it. */
  dismissible: boolean;
  onClose: () => void;
  /**
   * Whether to play the open and close cues. On for anything that opens *over* the game;
   * off where the moment already has its own sound, which is what a victory has.
   */
  cues?: boolean;
}

export function useDialogLayer(
  ref: RefObject<HTMLElement | null>,
  { open, dismissible, onClose, cues = true }: DialogOptions,
): LayerPlace {
  const place = useLayer(useId(), open);
  const { top } = place;

  // The open and close cues ride the same effect as the focus move, which is what keeps
  // them honest: they are tied to the dialog actually appearing rather than to whatever
  // button was pressed, so one opened by a keystroke or by the tutorial sounds the same
  // as one clicked.
  useEffect(() => {
    if (!open) return;
    if (cues) playCue(CUE.open);

    const previouslyFocused = document.activeElement as HTMLElement | null;
    // Move focus into the dialog so keyboard users are not left behind it.
    const firstFocusable = ref.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    (firstFocusable ?? ref.current)?.focus();

    return () => {
      if (cues) playCue(CUE.close);
      previouslyFocused?.focus();
    };
  }, [open, cues, ref]);

  useEffect(() => {
    if (!open || !top) return;

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && dismissible) {
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key !== 'Tab' || !ref.current) return;

      const focusable = Array.from(
        ref.current.querySelectorAll<HTMLElement>(
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
  }, [open, top, dismissible, onClose, ref]);

  return place;
}
