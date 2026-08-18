import { useEffect, useRef, useState } from 'react';
import { useNavStore } from '@/state/navStore';
import { usePlayerStore } from '@/state/playerStore';
import styles from './ScreenWipe.module.scss';

/**
 * The mist, closing and opening again between screens.
 *
 * A 200 ms wipe on every navigation (UI_UX §1.2), and the reason it earns its place is
 * not decoration: without it a dock press swaps one dense screen for another in a single
 * frame, and the eye has to re-find everything from scratch. A beat of mist gives the
 * change somewhere to happen.
 *
 * **Not blocking.** `pointer-events: none`, and the new screen is already mounted
 * underneath — the wipe is drawn over a navigation that has already happened rather than
 * being a gate in front of one. A player who presses two dock tiles quickly gets the
 * second screen at the same speed they always did.
 *
 * DOM rather than the Pixi overlay the design doc first imagined. A full-screen gradient
 * is one composited layer the GPU handles for free, where the Pixi route would contend
 * with the battle ticker for the single core the production box has — and this way
 * `prefers-reduced-motion` switches it off without anything in JavaScript asking.
 */
export function ScreenWipe(): JSX.Element | null {
  const screen = useNavStore((state) => state.screen);
  const reducedMotion = usePlayerStore((state) => state.settings.reducedMotion);

  // Keyed remounts are what restart a CSS animation; a counter is the smallest key that
  // is guaranteed to differ even when a player navigates back to where they were.
  const [pass, setPass] = useState(0);
  const first = useRef(true);

  useEffect(() => {
    // Never on the first paint: arriving at the Haven is not a transition from anywhere,
    // and a wipe over the boot sequence reads as a stutter.
    if (first.current) {
      first.current = false;
      return;
    }
    setPass((count) => count + 1);
  }, [screen]);

  if (reducedMotion || pass === 0) return null;

  return <div key={pass} className={styles.wipe} aria-hidden="true" />;
}
