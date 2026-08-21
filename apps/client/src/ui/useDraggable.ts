import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Moving a floating panel out of the way.
 *
 * The tutorial card is the reason this exists: it sits over the game and points at things,
 * and sooner or later it points at something underneath itself — a stage on the campaign
 * map, a relic in a grid the card happens to cover. Every other answer is worse. Moving the
 * card by rule means guessing which corner is free; making it dismissible means losing the
 * instructions; shrinking it means it stops being readable. Letting the player shove it
 * aside is the one that always works.
 *
 * Kept general and kept here rather than in the overlay, because "a panel the player can
 * move" is a shape the game will want again — a battle log, a comparison sheet.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

/** How much of the panel must stay reachable, in px. */
const MARGIN = 8;

/**
 * Keeps a panel inside the window.
 *
 * A dragged panel that can leave the viewport is a panel that can be lost: there is no
 * scrollbar out there and no way back. So the position is clamped on every move, and again
 * on resize — the window a card was placed in is not the window it will be read in.
 *
 * When the panel is *larger* than the window the clamp cannot satisfy both edges, and it
 * pins the top-left instead: the top of a card is its title and its first line, and its
 * bottom is buttons that can be reached by making the window bigger. Losing the top would
 * lose which step the player is on.
 */
export function clampToViewport(at: Point, size: Size, viewport: Size, margin = MARGIN): Point {
  const maxX = viewport.width - size.width - margin;
  const maxY = viewport.height - size.height - margin;
  return {
    x: Math.round(Math.min(Math.max(at.x, margin), Math.max(margin, maxX))),
    y: Math.round(Math.min(Math.max(at.y, margin), Math.max(margin, maxY))),
  };
}

/** How far one arrow-key press moves a panel, and how far with Shift held. */
const STEP = 16;
const BIG_STEP = 64;

/** The offset an arrow key asks for, or null if the key is not one. */
export function keyStep(key: string, shift: boolean): Point | null {
  const distance = shift ? BIG_STEP : STEP;
  switch (key) {
    case 'ArrowLeft':
      return { x: -distance, y: 0 };
    case 'ArrowRight':
      return { x: distance, y: 0 };
    case 'ArrowUp':
      return { x: 0, y: -distance };
    case 'ArrowDown':
      return { x: 0, y: distance };
    default:
      return null;
  }
}

export interface Draggable {
  /** Where the panel has been put, or null while it is still where CSS placed it. */
  at: Point | null;
  /** True while a pointer is down on the handle. */
  dragging: boolean;
  /** Put on the element being moved. */
  panelRef: (node: HTMLElement | null) => void;
  /** Spread onto the handle. */
  handleProps: {
    onPointerDown: (event: React.PointerEvent) => void;
    onKeyDown: (event: React.KeyboardEvent) => void;
    tabIndex: 0;
    role: 'button';
    'aria-label': string;
  };
  /** Puts it back where the stylesheet wanted it. */
  resetPosition: () => void;
}

const viewportSize = (): Size => ({ width: window.innerWidth, height: window.innerHeight });

export function useDraggable(label: string): Draggable {
  const [at, setAt] = useState<Point | null>(null);
  const [dragging, setDragging] = useState(false);
  // The node is held in state rather than in a ref because the *render* is what needs it —
  // the returned props are wired to it — and a ref read during render is both a lint error
  // and, in a concurrent world, a real one. It changes once, on mount.
  const [panel, setPanel] = useState<HTMLElement | null>(null);
  // Where in the panel the pointer grabbed it, so the card does not jump to put its corner
  // under the cursor on the first move. A ref is right here: only event handlers touch it,
  // and re-rendering once per pointermove to store two numbers would be waste.
  const grab = useRef<Point>({ x: 0, y: 0 });

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Left button and primary touch only: a right-click on the handle is a context menu,
      // and dragging on it would eat that.
      if (event.button !== 0) return;
      const box = panel?.getBoundingClientRect();
      if (!box) return;
      grab.current = { x: event.clientX - box.left, y: event.clientY - box.top };
      // The first press turns the stylesheet's placement into a position: read where the
      // card *is* rather than assuming, so it does not jump on the first pixel of travel.
      setAt(clampToViewport({ x: box.left, y: box.top }, box, viewportSize()));
      setDragging(true);
      event.preventDefault();
    },
    [panel],
  );

  // On the window rather than on the handle: a pointer that leaves the element mid-drag must
  // keep dragging, and one released anywhere must end it. Capture is not used, so a button
  // inside the panel still gets its own events.
  useEffect(() => {
    if (!dragging || !panel) return;
    const move = (event: PointerEvent): void => {
      setAt(
        clampToViewport(
          { x: event.clientX - grab.current.x, y: event.clientY - grab.current.y },
          panel.getBoundingClientRect(),
          viewportSize(),
        ),
      );
    };
    const stop = (): void => setDragging(false);
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, panel]);

  // A window that changed shape can leave a placed panel outside it. Re-clamped rather than
  // reset, so a player who moved the card keeps roughly where they put it.
  useEffect(() => {
    if (!at || !panel) return;
    const onResize = (): void =>
      setAt((current) =>
        current ? clampToViewport(current, panel.getBoundingClientRect(), viewportSize()) : null,
      );
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [at, panel]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      const step = keyStep(event.key, event.shiftKey);
      if (!step) return;
      event.preventDefault();
      const box = panel?.getBoundingClientRect();
      if (!box) return;
      setAt(clampToViewport({ x: box.left + step.x, y: box.top + step.y }, box, viewportSize()));
    },
    [panel],
  );

  const resetPosition = useCallback(() => setAt(null), []);

  return {
    at,
    dragging,
    panelRef: setPanel,
    handleProps: {
      onPointerDown,
      onKeyDown,
      tabIndex: 0,
      role: 'button',
      'aria-label': label,
    },
    resetPosition,
  };
}
