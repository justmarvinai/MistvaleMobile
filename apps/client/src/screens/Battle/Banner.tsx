import { useEffect, useState } from 'react';
import type { PlaybackView } from '@/game/playback';
import styles from './Banner.module.scss';

/** As long as the canvas banner lived: 90 frames at 60fps, plus its fade. */
const LIFE_MS = 1600;

/**
 * "Wave 3", and the sentences a boss's ward answers with.
 *
 * **Drawn as DOM rather than into the canvas**, which is what fixes the owner's report that
 * it is blurry. It was a Pixi `Text` at 34px inside the 960×540 virtual canvas, and the
 * scene scales that box to cover the window — so on a 1920 display the glyphs were
 * rasterised at 34 and then blown up to about 68, which is exactly what a bitmap scaled by
 * two looks like. Text on the canvas cannot win that argument: the resolution it needs is
 * not known until the window is measured, and it changes again when the window is resized.
 *
 * It is also the `UnitOverlay` pattern the battle screen already runs on (B3): the field is
 * painted and everything readable over it is DOM, one thin layer over whichever renderer is
 * running. That is worth as much here as the sharpness, because it closes a second fault of
 * the same shape as C28b — the announcement is drawn over the **simple battlefield** now,
 * and it never was. `DomBattlefield` has no banner of its own, so a player on the fallback
 * renderer was told nothing at all when the wave turned over. Two renderers, one
 * announcement, one place it is decided.
 *
 * What is *shown* is derived rather than stored (C19's lesson): playback keeps the last
 * banner on the view until another replaces it — the canvas version carried its own life
 * counter for the same reason — so all this holds is which announcement has already had its
 * turn. Keyed on the id rather than the object, because a view rebuilt each frame would
 * otherwise restart the clock forever and the banner would never leave.
 */
export function Banner({ banner }: { banner: PlaybackView['banner'] }): JSX.Element | null {
  const [expired, setExpired] = useState<number | null>(null);
  const id = banner?.id ?? null;

  useEffect(() => {
    if (id === null) return undefined;
    const done = window.setTimeout(() => setExpired(id), LIFE_MS);
    return () => window.clearTimeout(done);
  }, [id]);

  if (!banner || banner.id === expired) return null;
  return (
    <div className={styles.banner} data-mv-banner={banner.tone}>
      {/* Keyed by id rather than by text, so React replaces the node — which is what
          restarts the animation when one announcement follows another, and what makes a
          "Wave 2" after a retry play again rather than sit there already faded. */}
      <span key={banner.id} className={styles.word}>
        {banner.text}
      </span>
    </div>
  );
}
