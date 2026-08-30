import { useEffect } from 'react';
import { AchievementPopup } from '@/fui/components/AchievementPopup.ts';
import { useFui } from '@/fui/react';
import { CUE, playCue } from '@/audio';
import { useUnlockStore } from '@/state/unlockStore';
import { SCREENS } from './screens';

/**
 * "Something opened" — said in passing, not in the way.
 *
 * This replaced a modal (the owner, 2026-08-29: *"very annoying while the tutorial is
 * ongoing and new players can get confused by it"*), and the modal was wrong for a reason
 * worth writing down. Its own note argued that an unlock "is worth a beat of the player's
 * whole attention" — which is true of the *feature* and false of the **moment**, because
 * the moment is never chosen by the player. A level arrives out of a fight they were
 * paying attention to, or three levels in a row out of a mission chain, or in the middle of
 * the tutorial when a new warden is being told to press something else. A card with two
 * buttons on it stops all of that to ask a question nobody asked.
 *
 * So it is a banner: it slides in at the top, holds for four seconds, and goes. Nothing to
 * dismiss, nothing to decide, and the dock tile it is about is lit whether or not anybody
 * read it.
 *
 * **The library's own `AchievementPopup`**, which is the D9 rule working as intended: it is
 * chrome that queues and times itself and holds no state React has to drive, so the
 * component is used rather than the art. Two unlocks at once — level 8 opens the Arena and
 * the Hall together — play one after the other, which is the behaviour that made the modal
 * a *queue* in the first place.
 */
export function UnlockBanner(): JSX.Element {
  const queued = useUnlockStore((state) => state.queue);
  const take = useUnlockStore((state) => state.take);

  const { ref, instance } = useFui(
    AchievementPopup,
    { position: 'top' as const },
    {
      // Fired as each banner slides in, so the second of two sounds when the second
      // appears rather than both firing at the moment the queue was handed over.
      'achievement:show': () => playCue(CUE.unlock),
    },
  );

  useEffect(() => {
    if (!instance || queued.length === 0) return;
    // Drained in one go, and the store is emptied in the same tick: from here the
    // library owns the pacing, and leaving copies in both places is how they disagree.
    for (const unlock of take()) {
      instance.unlock({
        id: unlock.key,
        title: unlock.title,
        description: `Opened at level ${unlock.level}`,
        tier: 'gold',
        icon: badgeFor(unlock),
      });
    }
  }, [instance, queued, take]);

  return <div ref={ref} style={{ display: 'contents' }} />;
}

/**
 * The badge art: the destination's own **painted** art from the screen registry.
 *
 * Its `art` rather than its `glyph`, and the difference is not cosmetic. A glyph is a line
 * drawing authored `fill="currentColor"`, which the dock paints by using it as a *mask*
 * and colouring the box behind — load one as a `background-image`, which is what the
 * library's badge does, and `currentColor` resolves against the SVG's own document and
 * comes out black. On a dark card that is an empty slot, which is exactly what the first
 * cut drew. The registry's `art` is painted colour art and needs no tinting.
 *
 * Read from the registry rather than authored a second time, so the banner announcing the
 * Mistspire wears the same picture as the card that opens it — and C19 already made the
 * registry refuse two places sharing one, so no two banners can look alike either.
 *
 * The `art` override on the unlock is for the two that open no screen: multi-battle is a
 * stepper on the campaign's team chooser, and the Hall of Valor sits behind the Arena's
 * own title bar. The library draws a fixed-width badge slot whether or not it is handed
 * art, so "no badge" is a hole in the card rather than a narrower one — which is why every
 * unlock resolves to something, checked in `unlocks.test.ts`.
 */
function badgeFor(unlock: { screen?: string; art?: string }): string {
  if (unlock.art) return unlock.art;
  return SCREENS.find((entry) => entry.id === unlock.screen)?.art ?? 'rune-nova-star';
}
