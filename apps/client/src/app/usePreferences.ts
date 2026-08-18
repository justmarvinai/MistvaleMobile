import { useEffect } from 'react';
import { usePlayerStore } from '@/state/playerStore';

/**
 * Applies the preferences that are the document's business rather than a component's.
 *
 * **Reduce motion** was a toggle that wrote to the server and changed nothing anybody
 * could see: the stylesheet honoured `prefers-reduced-motion`, which is the operating
 * system's answer, so a player who wanted a calmer interface had to change it for their
 * whole machine. The attribute set here is the game's own answer, and `global.scss`
 * treats the two as the same request.
 *
 * Sprite idle loops are deliberately untouched by either. They are the game being alive
 * rather than the interface being busy, and the brief asks for them always.
 */
export function usePreferences(): void {
  const reducedMotion = usePlayerStore((state) => state.settings.reducedMotion);

  useEffect(() => {
    const root = document.documentElement;
    if (reducedMotion) root.setAttribute('data-mv-motion', 'reduced');
    else root.removeAttribute('data-mv-motion');
  }, [reducedMotion]);
}
