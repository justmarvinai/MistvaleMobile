/**
 * Press and hold to scroll, in every menu that scrolls.
 *
 * The owner's ask, and the Haven is the precedent: its rail has been draggable with a mouse
 * since C4, because a row of painted boards is something you shove rather than something you
 * operate a scrollbar on. Every other scroller in the game — the Arena's list of opponents,
 * an event's panels, the tower's thirty floors, the vault's grid, the body of any tall dialog
 * — had a wheel and a bar and nothing else.
 *
 * **One listener on the document rather than a hook per screen**, which is the whole design.
 * There are dozens of scrollers and the next screen adds one more; a hook that each of them
 * has to remember to call is a hook half of them will not call, and the half that forgets is
 * invisible until somebody tries to drag it. Installed once by the shell, it works on every
 * scroller that exists and every one added later.
 *
 * Four rules keep it from getting in the way of the things a pointer already does:
 *
 *  - **Mouse and pen only.** Touch already drags a scroller with the platform's own inertia
 *    and rubber-banding, which no hand-rolled gesture matches — the Rail's own note.
 *  - **A press is a click until it moves.** Nothing happens until the pointer travels past
 *    `DRAG_THRESHOLD`, and only then is the click it ends with swallowed. So a card still
 *    opens when you click it, and the same card scrolls the list when you drag from it.
 *  - **Text, fields and controls that mean something else are left alone**: anything a
 *    selection is being made in, a range slider whose whole gesture is a drag, and anything
 *    marked `data-mv-nodrag` — which the Rail carries, since it drags itself and two
 *    handlers on one track scroll it twice as fast as the pointer moves.
 *  - **The nearest scrollable ancestor wins**, on each axis independently, so a grid inside
 *    a dialog scrolls the grid and a drag in the dialog's margin scrolls the dialog.
 */

/** How far a pointer travels before a press becomes a drag. */
export const DRAG_THRESHOLD = 5;

/** On `<body>` while a drag is running: the grabbing cursor, and no text selection. */
export const DRAGGING_CLASS = 'mv-dragging';

export interface ScrollMetrics {
  overflowX: string;
  overflowY: string;
  clientWidth: number;
  scrollWidth: number;
  clientHeight: number;
  scrollHeight: number;
}

/** Which axes of an element can actually be scrolled, or null when neither can. */
export function scrollableAxes(metrics: ScrollMetrics): { x: boolean; y: boolean } | null {
  const scrolls = (overflow: string, client: number, content: number): boolean =>
    (overflow === 'auto' || overflow === 'scroll' || overflow === 'overlay') &&
    content - client > 1;
  const x = scrolls(metrics.overflowX, metrics.clientWidth, metrics.scrollWidth);
  const y = scrolls(metrics.overflowY, metrics.clientHeight, metrics.scrollHeight);
  return x || y ? { x, y } : null;
}

/**
 * What a press landed on, as the three facts the rule turns on.
 *
 * Split from the DOM so the rule can be *read* — and tested, since this repo's Vitest runs
 * in `node` and there is no document to build one in. The selectors below are the adapter's
 * business; what is worth stating and pinning is the decision they feed.
 */
export interface PressTarget {
  /** Something in the ancestry drags itself and says so (`data-mv-nodrag`). */
  ownsTheGesture: boolean;
  /** A slider, a text area, a select, a contenteditable — where a drag already means something. */
  editable: boolean;
  /** The `type` of the nearest `input` ancestor, or null when the press was not in one. */
  fieldType: string | null;
}

/** Inputs a pointer *hits* rather than works inside. Everything else is for selecting in. */
const HITTABLE_FIELDS = ['checkbox', 'radio', 'button', 'submit'];

/**
 * Whether a press starting here belongs to something else.
 *
 * Deliberately short. A button, a card and a link are all draggable — that is the point of
 * the gesture, and the click is given back when the pointer did not travel. What is refused
 * is where a drag already means a different thing: typing and selecting inside a field, a
 * slider's own handle, and anything that says so.
 */
export function refusesDrag(target: PressTarget): boolean {
  if (target.ownsTheGesture || target.editable) return true;
  // A text field is for selecting inside; a checkbox or a radio is a target to hit.
  return target.fieldType !== null && !HITTABLE_FIELDS.includes(target.fieldType);
}

/** The adapter: the same three facts, read off a real element. */
export function pressTarget(el: Element | null): PressTarget | null {
  if (!el) return null;
  const editable =
    'input[type="range"], textarea, select, [contenteditable=""], [contenteditable="true"]';
  return {
    ownsTheGesture: el.closest('[data-mv-nodrag]') !== null,
    editable: el.closest(editable) !== null,
    fieldType: el.closest('input')?.type ?? null,
  };
}

/** Past the threshold in either direction. */
export const isDrag = (dx: number, dy: number): boolean =>
  Math.abs(dx) >= DRAG_THRESHOLD || Math.abs(dy) >= DRAG_THRESHOLD;

interface Grabbed {
  el: HTMLElement;
  axes: { x: boolean; y: boolean };
  fromX: number;
  fromY: number;
  left: number;
  top: number;
  moved: boolean;
}

/**
 * Installs the gesture. Returns the function that removes it again.
 *
 * Exported rather than run on import so the shell owns its lifetime and a test can install
 * it, drive it and take it away.
 */
export function installDragScroll(root: Document = document): () => void {
  let grabbed: Grabbed | null = null;
  /**
   * Set when a press became a real drag, and read by the click that follows.
   *
   * A *flag* rather than a one-shot listener armed on pointer-up, which is the Rail's own
   * shape (C4) and the reason matters: a drag that ends over something unclickable produces
   * no click at all, so a listener armed to eat "the next click" would sit there and eat a
   * legitimate one minutes later, on a different screen.
   */
  let dragged = false;

  const scrollerFor = (from: Element | null): Grabbed | null => {
    for (let el = from; el instanceof HTMLElement; el = el.parentElement) {
      const style = root.defaultView?.getComputedStyle(el);
      if (!style) return null;
      const axes = scrollableAxes({
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        clientWidth: el.clientWidth,
        scrollWidth: el.scrollWidth,
        clientHeight: el.clientHeight,
        scrollHeight: el.scrollHeight,
      });
      if (axes) {
        return {
          el,
          axes,
          fromX: 0,
          fromY: 0,
          left: el.scrollLeft,
          top: el.scrollTop,
          moved: false,
        };
      }
    }
    return null;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (event.pointerType === 'touch' || event.button !== 0) return;
    const target = event.target instanceof Element ? event.target : null;
    const press = pressTarget(target);
    if (!press || refusesDrag(press)) return;
    const found = scrollerFor(target);
    if (!found) return;
    grabbed = { ...found, fromX: event.clientX, fromY: event.clientY };
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (!grabbed) return;
    const dx = event.clientX - grabbed.fromX;
    const dy = event.clientY - grabbed.fromY;
    if (!grabbed.moved) {
      if (!isDrag(dx, dy)) return;
      grabbed.moved = true;
      dragged = true;
      // Only once the press is a drag: a click that never moved must leave a selection
      // alone, and the cursor must not flicker on every press in the game.
      root.body.classList.add(DRAGGING_CLASS);
      root.getSelection()?.removeAllRanges();
    }
    if (grabbed.axes.x) grabbed.el.scrollLeft = grabbed.left - dx;
    if (grabbed.axes.y) grabbed.el.scrollTop = grabbed.top - dy;
    // The scroller has taken the gesture; nothing else should also react to it.
    event.preventDefault();
  };

  const onPointerUp = (): void => {
    if (!grabbed) return;
    grabbed = null;
    root.body.classList.remove(DRAGGING_CLASS);
  };

  /**
   * The click a drag ends with, eaten — capture phase, because the card's own handler must
   * not get there first, and on the document because React's listeners live on the root.
   */
  const onClick = (event: MouseEvent): void => {
    if (!dragged) return;
    dragged = false;
    event.preventDefault();
    event.stopPropagation();
  };

  /** A picture or a link inside a scroller offers the browser's own drag; not while we scroll. */
  const onDragStart = (event: Event): void => {
    if (grabbed) event.preventDefault();
  };

  root.addEventListener('pointerdown', onPointerDown, { passive: true });
  root.addEventListener('pointermove', onPointerMove, { passive: false });
  root.addEventListener('pointerup', onPointerUp, { passive: true });
  root.addEventListener('pointercancel', onPointerUp, { passive: true });
  root.addEventListener('click', onClick, { capture: true });
  root.addEventListener('dragstart', onDragStart);

  return () => {
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerUp);
    root.removeEventListener('click', onClick, { capture: true });
    root.removeEventListener('dragstart', onDragStart);
    root.body.classList.remove(DRAGGING_CLASS);
  };
}
