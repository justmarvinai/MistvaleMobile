import { useEffect, useSyncExternalStore } from 'react';

/**
 * Which overlay is on top, and who therefore owns the keyboard.
 *
 * Every modal in the game portals to `document.body` at the same `$z-modal`, so before
 * this the answer to "which of these two is on top" was *whichever mounted first* — a
 * detail of component order that nobody chose and nothing tested. Two consequences, both
 * real and both reachable today (the relic picker opens over the champion sheet):
 *
 * - **Escape closed both.** Each open modal added its own capture-phase listener to
 *   `document`, and `stopPropagation` does nothing about a second listener on the *same*
 *   node — that needs `stopImmediatePropagation`. One key, two dismissals.
 * - **Tab escaped the top dialog** into the one behind it, because that one's focus trap
 *   was still installed and still cycling its own children.
 *
 * So overlays register here on open. The last one in is the top one: it alone handles
 * keys and backdrop clicks, and its depth is added to `$z-modal` so the stacking order is
 * the order things were opened rather than the order they were written.
 *
 * The stack is deliberately module state rather than a store. It is not application
 * state, nothing outside this folder should be able to reorder it, and a modal that
 * unmounts without cleanup would corrupt any richer representation just as badly.
 */

const stack: string[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

/**
 * `useSyncExternalStore`'s half of the contract: call `listener` whenever the answer to
 * "who is on top" might have changed. Exported so a test can prove the notification
 * happens — a stack that reorders silently leaves the wrong dialog holding the keyboard.
 */
export function subscribeLayers(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Registers an overlay as the new top. Re-registering an id already present is a no-op. */
export function pushLayer(id: string): void {
  if (stack.includes(id)) return;
  stack.push(id);
  notify();
}

/** Removes an overlay, wherever in the stack it is — a lower one can close first. */
export function popLayer(id: string): void {
  const at = stack.indexOf(id);
  if (at === -1) return;
  stack.splice(at, 1);
  notify();
}

/** The id currently on top, or `null` when nothing is open. Exported for tests. */
export function topLayer(): string | null {
  return stack[stack.length - 1] ?? null;
}

/** Empties the stack. Tests only — module state outlives a single test otherwise. */
export function resetLayers(): void {
  stack.length = 0;
  notify();
}

export interface LayerPlace {
  /** True when this overlay owns Escape, Tab and the backdrop. */
  top: boolean;
  /** How many overlays are underneath — added to `$z-modal` to keep them in order. */
  depth: number;
}

/**
 * Joins the stack while `open`, and reports where in it this overlay sits.
 *
 * `id` must be stable for the life of the component — `useId()` at the call site.
 */
export function useLayer(id: string, open: boolean): LayerPlace {
  useEffect(() => {
    if (!open) return;
    pushLayer(id);
    return () => popLayer(id);
  }, [id, open]);

  // Both snapshots are primitives derived from the array rather than the array itself, so
  // React sees a change only when the answer actually changed.
  const top = useSyncExternalStore(
    subscribeLayers,
    () => topLayer() === id,
    () => false,
  );
  const depth = useSyncExternalStore(
    subscribeLayers,
    // Before the effect has run this is -1; treating that as the bottom is right, because
    // it lasts one frame and the alternative is a modal that flashes above its own parent.
    () => Math.max(0, stack.indexOf(id)),
    () => 0,
  );

  return { top, depth };
}
