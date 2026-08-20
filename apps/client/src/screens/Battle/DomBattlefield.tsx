import { useMemo } from 'react';
import { VIRTUAL_HEIGHT, VIRTUAL_WIDTH } from '@/game/stage';
import { slotPosition } from '@/game/battleScene';
import { framePath, stillPath } from '@/game/sprites';
import { CHAMPION_PLACEHOLDER } from '@/ui/championArt';
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
 * three things that make a fight legible: who is standing where, how much of them is left,
 * and who is acting. What it does not do is animate — no idle loops, no shake, no drifting
 * fog — because those are the parts that cost a GPU, and a still battlefield you can read
 * beats a moving one you cannot see.
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

  return (
    <div className={styles.field} aria-hidden="true">
      <div className={styles.canvas}>
        <div className={styles.ground} />
        {units.map((unit) => (
          <Fighter
            key={`${unit.ref.side}:${unit.ref.slot}`}
            unit={unit}
            art={artFor(unit.defKey)}
            acting={actingKey === `${unit.ref.side}:${unit.ref.slot}`}
          />
        ))}
        {view.floaters.map((floater) => {
          const at = slotPosition(floater.ref.side, floater.ref.slot);
          return (
            <span
              key={floater.id}
              className={`${styles.floater} ${styles[floater.kind] ?? ''}`}
              style={{ left: pct(at.x, VIRTUAL_WIDTH), top: pct(at.y - 90, VIRTUAL_HEIGHT) }}
            >
              {floater.text}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Fighter({
  unit,
  art,
  acting,
}: {
  unit: VisualUnit;
  art: string;
  acting: boolean;
}): JSX.Element {
  const at = slotPosition(unit.ref.side, unit.ref.slot);
  const ratio = unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.maxHp)) : 0;

  return (
    <div
      className={styles.fighter}
      data-side={unit.ref.side}
      data-alive={unit.alive}
      data-acting={acting}
      style={{ left: pct(at.x, VIRTUAL_WIDTH), top: pct(at.y, VIRTUAL_HEIGHT) }}
    >
      <img
        className={styles.sprite}
        // The first idle frame rather than the still, so a champion looks the same here as
        // it does in the scene — the still is a separate, dimmer composite.
        src={framePath(art, 0)}
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
