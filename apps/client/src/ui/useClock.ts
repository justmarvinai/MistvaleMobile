/**
 * One clock for everything on screen that counts.
 *
 * The wall clock is exactly the kind of mutable outside value `useSyncExternalStore` exists
 * for; reading `Date.now()` during render would make rendering impure. It lives here rather
 * than in the top bar because more than one thing ticks now — the energy bar and the XP
 * boost's countdown — and two components each running their own interval would drift
 * against each other by up to a second, which is visible when both sit in the same frame.
 *
 * The snapshot is a **cached** timestamp rather than `Date.now` itself. A getSnapshot that
 * returns a fresh value every call has no fixed point: React compares consecutive reads to
 * decide whether to re-render, so an ever-changing snapshot is an infinite loop with a
 * warning in front of it. The tick updates the cache, and every reader in one render pass
 * then sees the same instant.
 *
 * One interval serves every subscriber, started with the first and stopped with the last.
 */
import { useSyncExternalStore } from 'react';

let clockNow = Date.now();
const listeners = new Set<() => void>();
let timer: number | null = null;

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  timer ??= window.setInterval(() => {
    clockNow = Date.now();
    for (const listener of listeners) listener();
  }, 1000);

  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0 && timer !== null) {
      window.clearInterval(timer);
      timer = null;
    }
  };
}

/** The cached instant. Changes only when the tick fires. */
function snapshot(): number {
  return clockNow;
}

/** Server-rendered and test renders have no clock; zero is a fixed point, which is enough. */
function serverSnapshot(): number {
  return 0;
}

/** The current instant, re-rendering the caller once a second. */
export function useClockMs(): number {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
