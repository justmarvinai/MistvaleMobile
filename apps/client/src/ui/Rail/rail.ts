/**
 * The arithmetic behind a horizontal rail.
 *
 * A rail is a row wider than its window that the player shoves sideways — the Haven's
 * stations, and whatever else outgrows a screen later. All of the *feel* lives in four
 * numbers: when a press became a drag, how far a flick coasts, where the nearest panel
 * edge is, and whether there is anything left in either direction. Kept out of the
 * component and kept pure, because those four numbers are the only part worth testing and
 * the only part worth tuning.
 */

/**
 * How far a pointer must travel before the gesture stops being a click.
 *
 * Small, because the panels *are* the buttons: too generous and a tap on a station does
 * nothing, too tight and every drag opens whatever the finger came down on. Six pixels is
 * roughly the wobble of a deliberate click on a trackpad.
 */
export const DRAG_SLOP = 6;

/** Below this speed, in px/ms, a release is letting go rather than throwing. */
export const FLICK_FLOOR = 0.15;

/** The glide's time constant, in ms — how long a throw keeps travelling. */
export const FLICK_TIME = 220;

/** The furthest one flick may carry, so a hard swipe cannot fling the rail end to end. */
export const FLICK_MAX = 1400;

/** Within this many pixels of an end, the rail counts as being at it. */
const EDGE_TOLERANCE = 1;

/** Whether a gesture that moved this far horizontally was a drag and not a click. */
export function isDrag(dx: number, slop: number = DRAG_SLOP): boolean {
  return Math.abs(dx) >= slop;
}

/**
 * How far a release should coast, given the pointer's speed at the moment it lifted.
 *
 * Signed: positive velocity means the content was being pushed right, so the rail scrolls
 * left. The caller subtracts, exactly as it does during the drag itself.
 */
export function flickDistance(velocity: number): number {
  if (!Number.isFinite(velocity) || Math.abs(velocity) < FLICK_FLOOR) return 0;
  return Math.round(Math.max(-FLICK_MAX, Math.min(FLICK_MAX, velocity * FLICK_TIME)));
}

/** Keeps an offset inside the scrollable range. */
export function clampOffset(offset: number, max: number): number {
  if (!(max > 0)) return 0;
  return Math.max(0, Math.min(max, offset));
}

/**
 * The stop closest to where the rail came to rest.
 *
 * Ties go to the earlier stop, which is the one already partly on screen.
 */
export function nearestStop(offset: number, stops: readonly number[]): number {
  if (stops.length === 0) return offset;
  let best = stops[0] as number;
  for (const stop of stops) {
    if (Math.abs(stop - offset) < Math.abs(best - offset)) best = stop;
  }
  return best;
}

/**
 * Where an arrow press or an arrow key lands: the next stop past here, in that direction.
 *
 * The epsilon matters. A rail sitting exactly on a stop — which is where snapping leaves
 * it — would otherwise find that same stop "past" itself and never move.
 */
export function stepStop(offset: number, direction: 1 | -1, stops: readonly number[]): number {
  if (stops.length === 0) return offset;
  const epsilon = 1;
  if (direction > 0) {
    return stops.find((stop) => stop > offset + epsilon) ?? (stops.at(-1) as number);
  }
  return [...stops].reverse().find((stop) => stop < offset - epsilon) ?? (stops[0] as number);
}

/** Whether either arrow has anything left to reach. */
export function railEdges(
  offset: number,
  scrollWidth: number,
  clientWidth: number,
): { atStart: boolean; atEnd: boolean; overflows: boolean } {
  const max = scrollWidth - clientWidth;
  return {
    atStart: offset <= EDGE_TOLERANCE,
    atEnd: offset >= max - EDGE_TOLERANCE,
    overflows: max > EDGE_TOLERANCE,
  };
}
