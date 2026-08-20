import { useEffect, useMemo, useState } from 'react';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '@/game/stage';
import { slotPosition } from '@/game/battleScene';
import { framePath, loadSpriteManifest, spriteEntry, stillPath } from '@/game/sprites';
import { CHAMPION_PLACEHOLDER } from '@/ui/championArt';
import { mirrored } from '@/game/facing';
import { Floaters } from './Floaters';
import type { PlaybackView, VisualUnit } from '@/game/playback';
import styles from './DomBattlefield.module.scss';

/**
 * The battlefield, drawn by the browser instead of by WebGL.
 *
 * Mistvale's battlefield is a Pixi scene, and Pixi needs a graphics context. A browser that
 * cannot give it one — hardware acceleration switched off, a driver the browser has
 * blocklisted, a remote desktop, a locked-down machine — got a black rectangle: a correct
 * fight with a correct HUD over nothing at all. Pixi v8 has no software renderer to fall
 * back to, so the fallback has to be the DOM.
 *
 * It is not a second battle system. It reads the same `PlaybackView` the scene does, stands
 * units in the same formation (`slotPosition`, shared deliberately), and shows the same
 * things that make a fight legible: who is standing where, which way they are facing, how
 * much of them is left, and who is acting.
 *
 * **It idles.** "Highly animated — idle loops always play" is in the brief, and a still
 * battlefield reads as a broken one whichever half of the game drew it. The loop is the same
 * nine frames at the same nine frames a second the art was drawn at, on one timer for the
 * whole field rather than one per champion; the browser has every frame in cache after the
 * first pass round. What it does *not* do is shake, flash or drift fog — those want a
 * compositor, which is the thing this exists because the machine does not have.
 *
 * Sized by aspect ratio rather than by script: the Pixi scene letterboxes a 960×540 design
 * canvas inside the viewport, and an `aspect-ratio` box centred in the same space puts every
 * percentage in exactly the place the scene would have drawn it.
 */
export function DomBattlefield({
  view,
  artFor,
}: {
  view: PlaybackView;
  /** Which sprite folder a unit's definition points at — the screen's own lookup. */
  artFor: (defKey: string) => string;
}): JSX.Element {
  const units = useMemo(() => [...view.allies, ...view.enemies], [view.allies, view.enemies]);
  const actingKey = view.acting ? `${view.acting.side}:${view.acting.slot}` : null;
  const frame = useIdleFrame();
  // The manifest says how many frames each unit has. Nothing else on this path asks for it —
  // the Pixi loader is what usually pulls it in, and it is not running — so the fallback
  // fetches it itself. Without this every unit fell back to its still and stood there, which
  // is exactly the "nothing is animated" the owner reported.
  const framesReady = useSpriteManifest();

  return (
    <div className={styles.field} data-battlefield="simple" aria-hidden="true">
      <div className={styles.canvas}>
        {/* Named so the suite can measure it: the floor has to reach the edges of the
            window, and a class name a bundler hashed is not something a test can ask for. */}
        <div className={styles.ground} data-ground="" />
        {units.map((unit) => (
          <Fighter
            key={`${unit.ref.side}:${unit.ref.slot}`}
            unit={unit}
            art={artFor(unit.defKey)}
            frame={frame}
            framesReady={framesReady}
            acting={actingKey === `${unit.ref.side}:${unit.ref.slot}`}
          />
        ))}
        <Floaters floaters={view.floaters} />
      </div>
    </div>
  );
}

/**
 * One clock for the whole field, at the nine frames a second the art was drawn at.
 *
 * A timer per champion would be eight timers doing the same arithmetic and eight loops
 * drifting out of step with one another for no reason.
 */
function useIdleFrame(): number {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setFrame((current) => current + 1), 1000 / 9);
    return () => window.clearInterval(timer);
  }, []);
  return frame;
}

/** Resolves once, and re-renders the field when the frame counts are known. */
function useSpriteManifest(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    void loadSpriteManifest()
      .then(() => {
        if (live) setReady(true);
      })
      // A missing manifest is not fatal here: every unit simply holds on its still image,
      // which is what the `onError` ladder is for anyway.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);
  return ready;
}

function Fighter({
  unit,
  art,
  frame,
  framesReady,
  acting,
}: {
  unit: VisualUnit;
  art: string;
  frame: number;
  framesReady: boolean;
  acting: boolean;
}): JSX.Element {
  const at = slotPosition(unit.ref.side, unit.ref.slot);
  const ratio = unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.maxHp)) : 0;
  // A unit with no published frames holds on its still.
  const frames = framesReady ? (spriteEntry(art)?.idleFrames ?? 0) : 0;
  const source = frames > 0 ? framePath(art, frame % frames) : stillPath(art);

  return (
    <div
      className={styles.fighter}
      data-side={unit.ref.side}
      data-mirrored={mirrored(art, unit.ref.side)}
      data-alive={unit.alive}
      data-acting={acting}
      style={{ left: pct(at.x, VIRTUAL_WIDTH), top: pct(at.y, VIRTUAL_HEIGHT) }}
    >
      <img
        className={styles.sprite}
        src={source}
        alt=""
        draggable={false}
        // The same ladder the scene uses, walked one rung per failure: the unit's own art,
        // its still, then the shared silhouette. `onError` rather than a check, because
        // whether a file is there is not something the client can know before asking.
        onError={(event) => {
          const image = event.currentTarget;
          for (const next of [stillPath(art), silhouetteUrl()]) {
            if (next && !image.src.endsWith(next)) {
              image.src = next;
              return;
            }
          }
          image.style.visibility = 'hidden';
        }}
      />
      <span className={styles.bar}>
        <span className={styles.fill} style={{ width: `${ratio * 100}%` }} />
      </span>
    </div>
  );
}

/** Percentage of the virtual canvas, so the DOM lands where the scene would have drawn. */
function pct(value: number, of: number): string {
  return `${(value / of) * 100}%`;
}

/**
 * The shared stand-in's URL, read from the theme's own custom property.
 *
 * Same asset and same indirection as `game/sprites`, so an art-pending champion is the same
 * figure whether the fight is painted by WebGL or by the browser.
 */
function silhouetteUrl(): string | null {
  if (typeof document === 'undefined') return null;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--fui-img-${CHAMPION_PLACEHOLDER}`)
    .trim();
  return /^url\(\s*["']?(.+?)["']?\s*\)$/.exec(value)?.[1] ?? null;
}
