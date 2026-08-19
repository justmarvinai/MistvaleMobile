import { useEffect, useState } from 'react';

/**
 * The screen-element registry the tutorial points at.
 *
 * A step names something like `dock:campaign` or `button:relic-upgrade`; the element that
 * *is* that thing carries `{...highlightable('dock:campaign')}`, and the overlay finds it
 * and reads its position. Nothing else couples them — the Dock does not import the
 * tutorial, and the tutorial does not know what a Dock is.
 *
 * **An attribute rather than a ref registry**, deliberately. Half the things worth pointing
 * at are rendered inside a `map` — a stage tile, a shop slot — where a hook cannot go, and
 * the ref version of this needed a component extracted per call site to hold it. One
 * spread attribute works anywhere, including on a node three components deep that nobody
 * wants to refactor. The cost is a `querySelector` per measurement, which is nothing next
 * to what it buys.
 *
 * Keys are `namespace:name` by convention (`dock:`, `button:`, `panel:`, `modal:`,
 * `stage:`) so an author reading the list can tell what kind of thing they are aiming at.
 * Publish validation deliberately does *not* check them: client and content deploy
 * separately, and a step pointing at something not on screen yet must degrade to a centred
 * dialogue rather than fail to publish.
 */

/**
 * The attribute a step's `highlight` key is looked up by.
 *
 * Exported because not every highlightable element is one React renders: the dock's
 * buttons belong to a vendored component and are marked imperatively, and they still have
 * to answer to the same key.
 */
export const HIGHLIGHT_ATTR = 'data-mv-highlight';
const ATTRIBUTE = HIGHLIGHT_ATTR;

/** Marks a node as the thing `key` names. Spread onto any element. */
export function highlightable(key: string): { [ATTRIBUTE]: string } {
  return { [ATTRIBUTE]: key };
}

/** A rectangle in viewport coordinates — what the overlay needs to cut a hole. */
export interface HighlightBox {
  top: number;
  left: number;
  width: number;
  height: number;
}

/**
 * Where the named element is right now, or null if nothing on screen answers to that key.
 *
 * Re-measured on scroll, resize and a short poll rather than cached: the dock moves when
 * the viewport does, screens mount their contents a frame or two after navigation, and a
 * highlight that lags behind the thing it points at is worse than no highlight at all.
 */
export function useHighlightRect(key: string): HighlightBox | null {
  const [box, setBox] = useState<HighlightBox | null>(null);

  useEffect(() => {
    const remeasure = (): void => {
      setBox((current) => {
        // An empty key is "point at nothing" — a beat, or a step whose target this build
        // does not have. It measures to null like anything else that is not on screen.
        const next = key ? measure(key) : null;
        // Compared inside the updater so the poll does not re-render four times a second
        // for the whole tutorial.
        return sameBox(current, next) ? current : next;
      });
    };

    remeasure();
    window.addEventListener('resize', remeasure);
    window.addEventListener('scroll', remeasure, true);
    const settle = window.setInterval(remeasure, 250);
    return () => {
      window.removeEventListener('resize', remeasure);
      window.removeEventListener('scroll', remeasure, true);
      window.clearInterval(settle);
    };
  }, [key]);

  return box;
}

function measure(key: string): HighlightBox | null {
  // Escaped, because a key comes from content and content is edited by an operator: a
  // quote in a highlight key must produce "nothing to point at" rather than a thrown
  // selector, which would take the whole overlay down with it.
  const node = document.querySelector(`[${ATTRIBUTE}="${CSS.escape(key)}"]`);
  const rect = node?.getBoundingClientRect();
  // A node laid out to nothing is not on screen in any useful sense; pointing at a
  // zero-size box would cut a hole in the middle of the dim.
  if (!rect || rect.width <= 0 || rect.height <= 0) return null;
  return { top: rect.top, left: rect.left, width: rect.width, height: rect.height };
}

/** Whether two measurements are the same box, to the pixel. Exported for its test. */
export function sameBox(a: HighlightBox | null, b: HighlightBox | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    Math.round(a.top) === Math.round(b.top) &&
    Math.round(a.left) === Math.round(b.left) &&
    Math.round(a.width) === Math.round(b.width) &&
    Math.round(a.height) === Math.round(b.height)
  );
}
