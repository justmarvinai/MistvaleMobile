import { useCallback, useEffect, useState } from 'react';
import { Tooltip, type TooltipOptions } from '@/fui/components/Tooltip.ts';

/**
 * A painted tooltip, on anything.
 *
 * The game was full of bare numbers. `19/63` with a flame beside it is an energy bar to
 * somebody who already knows the game and a riddle to everybody else — it does not say what
 * energy is spent on, that it comes back on its own, or when the bar will be full. The
 * browser's own `title` attribute says a little, three seconds late, in the operating
 * system's font, which on a screen dressed entirely in painted 9-slices reads as a bug.
 *
 * So: the library's `Tooltip`, which is the same leather-and-bronze card the rest of the
 * game is made of, with a title, stat lines, flavour and a hint. One instance serves the
 * whole page — it follows the cursor and only one can be under it at a time — created on
 * first use and never torn down, because a tooltip that is rebuilt per hover flickers.
 *
 * **Two things this adds over `tooltip.attach`.**
 *
 * The library binds `mouseenter`/`mousemove`/`mouseleave`, which is right for a cursor and
 * leaves a keyboard with nothing. Focus and blur are bound here too, and the card is placed
 * against the element's own box rather than a pointer that was never there.
 *
 * And the native `title` is cleared while a painted one is attached. Left alone the two
 * both fire, so a player gets the game's tooltip and, a beat later, the browser's grey one
 * on top of it.
 */

let shared: Tooltip | null = null;

function sharedTooltip(): Tooltip {
  if (!shared) {
    shared = new Tooltip({});
    // Off-flow, above everything, and outside the React tree on purpose: it belongs to the
    // page rather than to whichever component happens to be hovered.
    //
    // **Above the modals**, which is not where it started. At 900 it sat under `$z-modal`
    // (1000), so every tooltip inside a dialog rendered behind the dialog — which is most
    // of them: the champion sheet, the relic slot, the food picker, the team choosers. The
    // three that worked were the three on the shell. Above `$z-toast` (2000) as well, on
    // the same reasoning: a tooltip belongs to the pointer, and nothing the pointer is on
    // should be able to cover it.
    shared.el.style.zIndex = '3000';
    // Parked off-screen, fixed, from the first frame (C42). The library's card is
    // `position: relative` until `showAt` writes a `left` — and a relative element appended
    // to the body sits *in flow after the shell*, thirty pixels of empty tooltip that made
    // the document taller than the window before anything had ever been hovered. Nothing
    // showed it, since `body` clips its overflow, but the shell guard measures exactly that
    // and was right to fail.
    shared.el.style.position = 'fixed';
    shared.el.style.left = '-9999px';
    shared.el.style.top = '0px';
    document.body.appendChild(shared.el);
  }
  return shared;
}

/**
 * Attaches a tooltip to an element for as long as `options` is non-null.
 *
 * The element is usually one the library owns — a currency cell inside `TopBar`, a socket
 * inside a `Slot` — which is why this takes a node rather than rendering a wrapper: there
 * is no React element to wrap.
 */
export function useTooltip(
  el: HTMLElement | null | undefined,
  options: TooltipOptions | null,
): void {
  // Serialised so a fresh object literal per render does not re-attach on every render.
  const digest = options ? JSON.stringify(options) : null;

  useEffect(() => {
    if (!el || !digest) return;
    const payload = JSON.parse(digest) as TooltipOptions;
    const tip = sharedTooltip();

    const nativeTitle = el.getAttribute('title');
    if (nativeTitle !== null) el.removeAttribute('title');

    const detachPointer = tip.attach(el, payload);

    // The keyboard half. Anchored to the element rather than to a cursor position, since
    // there is no cursor: just above it, and nudged inside the viewport by `showAt`.
    const show = (): void => {
      const box = el.getBoundingClientRect();
      tip.render(payload);
      tip.showAt(box.left + box.width / 2, box.bottom);
    };
    const hide = (): void => void tip.hide();
    el.addEventListener('focus', show);
    el.addEventListener('blur', hide);

    return () => {
      detachPointer();
      el.removeEventListener('focus', show);
      el.removeEventListener('blur', hide);
      tip.hide();
      if (nativeTitle !== null) el.setAttribute('title', nativeTitle);
    };
  }, [el, digest]);
}

/** Drops the shared tooltip. Exported for tests, which must not leak one page into the next. */
export function destroySharedTooltip(): void {
  shared?.destroy();
  shared = null;
}

/**
 * The same thing, for an element React renders itself.
 *
 * `useTooltip` takes a node because the elements that first needed one belonged to the
 * library — a currency cell inside the top bar, a hotbar slot — and there was no React
 * element to hang anything on. Most of the game is not like that, and `ref={useTip(…)}` is
 * the whole of it there.
 *
 * The node is held in state rather than a ref on purpose: a ref assignment does not
 * re-render, so the effect that attaches the tooltip would never see the element.
 *
 * It is a hook, so a list needs a component per row rather than a call per iteration —
 * which is the same shape `SkillTips` already uses for the hotbar.
 */
export function useTip(options: TooltipOptions | null): (node: HTMLElement | null) => void {
  const [node, setNode] = useState<HTMLElement | null>(null);
  useTooltip(node, options);
  return useCallback((next: HTMLElement | null) => setNode(next), []);
}
