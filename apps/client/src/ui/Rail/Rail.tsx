import { useCallback, useEffect, useRef, useState } from 'react';
import { clampOffset, flickDistance, isDrag, nearestStop, railEdges, stepStop } from './rail';
import styles from './Rail.module.scss';

/**
 * A row you shove sideways.
 *
 * The Haven is why it exists — thirteen places drawn as painted panels are wider than any
 * window, and the owner's call is that you drag between them rather than read a grid of
 * icons — but nothing here knows about the Haven, so the next row that outgrows its screen
 * gets the same behaviour for free.
 *
 * **Touch is the browser's job and the mouse is ours.** The track is an ordinary
 * `overflow-x: auto` scroller, so a finger already drags it with the platform's own inertia,
 * rubber-banding and snap — none of which a hand-rolled gesture would match, and all of
 * which a hand-rolled gesture would have to fight. `touch-action: pan-x` says exactly that.
 * What the platform does *not* give is a mouse that drags, which is the gesture the owner
 * asked for, so pointer events drive the rail for mouse and pen only.
 *
 * Everything else is the same rail reachable four other ways: the two arrows for a player
 * who never thinks to drag, the wheel (turned sideways, since a vertical wheel over a
 * horizontal scroller does nothing at all), the arrow keys, and plain tabbing — a focused
 * panel is scrolled into view by the browser without any help from here.
 */

export interface RailProps {
  /** Names the group for screen readers, e.g. "Locations". */
  label: string;
  children: React.ReactNode;
  className?: string;
}

/** How far the arrow buttons and the arrow keys move, when there is nothing to snap to. */
const FALLBACK_STEP = 240;

export function Rail({ label, children, className }: RailProps): JSX.Element {
  // The node in state rather than a ref: the arrows render from what it measures, so the
  // first paint after mount has to be the one that knows whether the rail overflows.
  const [track, setTrack] = useState<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [edges, setEdges] = useState({ atStart: true, atEnd: true, overflows: false });

  /** Where the press started, and the rail's offset at that moment. */
  const origin = useRef({ x: 0, offset: 0 });
  /** The last two pointer samples, which is all a velocity needs. */
  const trail = useRef<{ x: number; at: number }[]>([]);
  /** Set the moment a press turns into a drag, so the click it ends with can be eaten. */
  const dragged = useRef(false);

  const measure = useCallback(() => {
    if (!track) return;
    setEdges(railEdges(track.scrollLeft, track.scrollWidth, track.clientWidth));
  }, [track]);

  /**
   * Where each panel starts, in scroll coordinates.
   *
   * Read from the DOM rather than computed from a panel width, because the panels are not
   * all the same width and never have to be. The track carries no horizontal padding for
   * exactly this reason: with none, a child's `offsetLeft` *is* the offset that puts it at
   * the left edge, and there is no computed style to read back.
   */
  const stops = useCallback((): number[] => {
    if (!track) return [];
    return Array.from(track.children).map((child) => (child as HTMLElement).offsetLeft);
  }, [track]);

  const glideTo = useCallback(
    (offset: number) => {
      if (!track) return;
      const max = track.scrollWidth - track.clientWidth;
      track.scrollTo({ left: clampOffset(offset, max), behavior: 'smooth' });
    },
    [track],
  );

  const step = useCallback(
    (direction: 1 | -1) => {
      if (!track) return;
      const list = stops();
      const target =
        list.length > 0
          ? stepStop(track.scrollLeft, direction, list)
          : track.scrollLeft + direction * FALLBACK_STEP;
      glideTo(target);
    },
    [glideTo, stops, track],
  );

  // Both ends move when the rail scrolls, when it is resized, and when its contents change
  // — a station unlocking adds nothing but a shrouded panel can change width.
  useEffect(() => {
    if (!track) return;
    // No opening `measure()`: a `ResizeObserver` delivers one callback per element the
    // moment it is observed, so the first measurement arrives from the observer along with
    // every later one. Calling it here as well would be a second, synchronous render for
    // the same numbers.
    track.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    for (const child of Array.from(track.children)) observer.observe(child);
    return () => {
      track.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [measure, track]);

  /**
   * A vertical wheel, turned sideways.
   *
   * Registered by hand because React's own wheel listener is passive, and a passive
   * listener cannot call `preventDefault` — without which the page behind the rail scrolls
   * as well as the rail. Only when the rail has somewhere to go, and only when the gesture
   * was not already horizontal: a trackpad's sideways swipe is the browser's to handle.
   */
  useEffect(() => {
    if (!track) return;
    const onWheel = (event: WheelEvent): void => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = track.scrollWidth - track.clientWidth;
      if (max <= 1) return;
      event.preventDefault();
      track.scrollLeft = clampOffset(track.scrollLeft + event.deltaY, max);
    };
    track.addEventListener('wheel', onWheel, { passive: false });
    return () => track.removeEventListener('wheel', onWheel);
  }, [track]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      // Touch is the browser's — see the note at the top. Left button only, so a
      // right-click still opens the context menu it was aimed at.
      if (event.pointerType === 'touch' || event.button !== 0 || !track) return;
      origin.current = { x: event.clientX, offset: track.scrollLeft };
      trail.current = [{ x: event.clientX, at: event.timeStamp }];
      dragged.current = false;
      setDragging(true);
    },
    [track],
  );

  // On the window rather than on the track: a pointer dragged off the rail must keep
  // dragging it, and one released over the dock must still end the drag.
  useEffect(() => {
    if (!dragging || !track) return;

    const move = (event: PointerEvent): void => {
      const dx = event.clientX - origin.current.x;
      if (isDrag(dx)) dragged.current = true;
      const max = track.scrollWidth - track.clientWidth;
      track.scrollLeft = clampOffset(origin.current.offset - dx, max);
      trail.current = [...trail.current.slice(-1), { x: event.clientX, at: event.timeStamp }];
    };

    const stop = (): void => {
      setDragging(false);
      if (!dragged.current) return;
      const [from, to] = trail.current;
      const elapsed = from && to ? to.at - from.at : 0;
      const velocity = from && to && elapsed > 0 ? (to.x - from.x) / elapsed : 0;
      const max = track.scrollWidth - track.clientWidth;
      const landed = clampOffset(track.scrollLeft - flickDistance(velocity), max);
      glideTo(nearestStop(landed, stops()));
    };

    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [dragging, glideTo, stops, track]);

  /**
   * The click a drag ends with, eaten.
   *
   * Every panel on the rail is a button, so without this a drag that happens to start on
   * one opens it the moment the mouse comes up. Capture phase, because the panel's own
   * handler must not get there first.
   */
  const onClickCapture = useCallback((event: React.MouseEvent) => {
    if (!dragged.current) return;
    event.preventDefault();
    event.stopPropagation();
    dragged.current = false;
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        step(1);
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        step(-1);
      } else if (event.key === 'Home') {
        event.preventDefault();
        glideTo(0);
      } else if (event.key === 'End') {
        event.preventDefault();
        glideTo(Number.MAX_SAFE_INTEGER);
      }
    },
    [glideTo, step],
  );

  return (
    <div className={`${styles.rail} ${className ?? ''}`} data-overflows={edges.overflows}>
      <button
        type="button"
        className={styles.arrow}
        data-side="start"
        onClick={() => step(-1)}
        disabled={edges.atStart}
        aria-label="Scroll left"
        tabIndex={-1}
      >
        <span aria-hidden="true" />
      </button>

      <div
        ref={setTrack}
        className={styles.track}
        data-dragging={dragging}
        role="group"
        aria-label={label}
        onPointerDown={onPointerDown}
        onClickCapture={onClickCapture}
        onKeyDown={onKeyDown}
      >
        {children}
      </div>

      <button
        type="button"
        className={styles.arrow}
        data-side="end"
        onClick={() => step(1)}
        disabled={edges.atEnd}
        aria-label="Scroll right"
        tabIndex={-1}
      >
        <span aria-hidden="true" />
      </button>
    </div>
  );
}
