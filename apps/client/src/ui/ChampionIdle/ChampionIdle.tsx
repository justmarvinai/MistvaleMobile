import { useEffect, useState } from 'react';
import { framePath, loadSpriteManifest, spriteEntry, stillPath } from '../../game/sprites';
import styles from './ChampionIdle.module.scss';

/**
 * A champion, breathing, as DOM.
 *
 * The battlefield already draws idle loops two ways — Pixi normally, and `DomBattlefield`
 * where there is no graphics context. This is the third place that wants one and the first
 * outside a fight: the champion sheet, where the reference this genre is built on shows the
 * champion at full height beside their numbers rather than as a thumbnail in a corner.
 *
 * DOM rather than a third Pixi surface, deliberately. A sheet is a modal over the shell;
 * standing up a WebGL context inside one costs a context the battlefield may want back, and
 * an `<img>` whose `src` changes nine times a second is a decoded-image swap the browser
 * does on the compositor. What it cannot do is blend or filter — which is exactly nothing
 * that a portrait needs.
 *
 * Three states, in order of preference: the published idle frames, the still, and — when
 * neither is there — nothing at all, drawn as an empty box the caller has already sized.
 * A champion whose art has not been made yet must not leave the browser's torn page in the
 * middle of their own sheet.
 */

/** The frame rate the art was drawn at. Same clock the battlefield uses. */
const FPS = 9;

export function ChampionIdle({
  /** The sprite folder for this champion — `champions/<key>`, from the content asset. */
  art,
  /** Accessible name. The sheet already says who this is, so it is usually decorative. */
  alt = '',
  className,
}: {
  art: string;
  alt?: string;
  className?: string;
}): JSX.Element {
  const frames = useFrameCount(art);
  const frame = useIdleClock(frames > 1);
  const [broken, setBroken] = useState(false);

  // Reset when the champion changes: the sheet is re-used for whoever was opened next, and
  // a failure belongs to the art that failed rather than to the slot it was in. Adjusted
  // during render rather than in an effect — React's own answer for state derived from a
  // prop, and the one that does not paint the previous champion's failure for a frame.
  const [drawn, setDrawn] = useState(art);
  if (drawn !== art) {
    setDrawn(art);
    setBroken(false);
  }

  const source = frames > 0 ? framePath(art, frame % frames) : stillPath(art);

  return (
    <div className={[styles.stage, className ?? ''].filter(Boolean).join(' ')}>
      {broken ? (
        <div className={styles.missing} role="img" aria-label={alt || 'No art yet'} />
      ) : (
        <img
          className={styles.sprite}
          src={source}
          alt={alt}
          draggable={false}
          onError={() => setBroken(true)}
        />
      )}
    </div>
  );
}

/**
 * How many idle frames this champion has published.
 *
 * Zero means "hold on the still", which is the honest answer for a champion whose loop has
 * not been drawn — and the manifest is what knows, rather than the content, so a frame that
 * was never exported is a still rather than a gap in the animation.
 */
function useFrameCount(art: string): number {
  const [count, setCount] = useState(() => spriteEntry(art)?.idleFrames ?? 0);
  // Same derive-during-render rule as above: the count for a *new* champion is whatever the
  // manifest already knows, immediately, rather than the previous champion's for one frame.
  const [counted, setCounted] = useState(art);
  if (counted !== art) {
    setCounted(art);
    setCount(spriteEntry(art)?.idleFrames ?? 0);
  }

  useEffect(() => {
    let live = true;
    void loadSpriteManifest()
      .then(() => {
        if (live) setCount(spriteEntry(art)?.idleFrames ?? 0);
      })
      // Not fatal: without the manifest every champion holds on their still, which is what
      // the `onError` fallback is for anyway.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [art]);
  return count;
}

/** Ticks only while there is something to animate — a still needs no timer. */
function useIdleClock(running: boolean): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => setFrame((current) => current + 1), 1000 / FPS);
    return () => window.clearInterval(timer);
  }, [running]);
  return frame;
}
