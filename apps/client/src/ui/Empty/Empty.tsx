import { EmptyState } from '@/fui/components/EmptyState.ts';
import { Fui } from '@/fui/react';

/**
 * What a screen shows when it has nothing on it.
 *
 * A list that renders one grey sentence in the middle of a black rectangle reads as a bug —
 * the player cannot tell "nothing yet" from "this failed to load". The library's own notes
 * make the same point, and this is that component with Mistvale's two habits attached: a
 * glyph that says *which* empty this is, and a line that says what to do about it rather
 * than only that there is nothing.
 *
 * Every empty state in the game routes through here, so the shape of "nothing yet" is
 * decided once.
 */
export interface EmptyProps {
  /** Glyph asset id. Pick the one the screen's own icon uses, so the two agree. */
  glyph?: string;
  title: string;
  /** One or two lines saying what would fill it. */
  message?: string;
  /** Label for a way out of the empty state — the button emits `onAction`. */
  action?: string;
  onAction?: () => void;
  size?: 'sm' | 'md';
  className?: string;
}

export function Empty({
  glyph,
  title,
  message,
  action,
  onAction,
  size = 'md',
  className,
}: EmptyProps): JSX.Element {
  return (
    <Fui
      of={EmptyState}
      className={className}
      options={{
        title,
        size,
        ...(glyph ? { glyph } : {}),
        ...(message ? { message } : {}),
        ...(action ? { action } : {}),
      }}
      on={onAction ? { 'empty:action': () => onAction() } : undefined}
    />
  );
}
