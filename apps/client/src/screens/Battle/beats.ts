import type { Effect } from '../../game/playback';

/**
 * Which beats are playing right now, for a renderer that cannot keep its own clock.
 *
 * The Pixi scene gives every burst a life in frames and counts it down. The DOM
 * battlefield has no tick, and CSS animations do not restart when a component re-renders,
 * so a beat has to be *added and removed* to be seen at all. This is that: effects enter
 * when they are first seen and leave when their time is up, so a class can be applied and
 * then taken away again.
 *
 * Pure and exported on its own so the expiry can be tested without a browser — the timing
 * is the part that goes wrong, not the markup.
 */

export interface LiveBeat extends Effect {
  /** When it entered, on whatever clock the caller is using. */
  since: number;
}

/**
 * What the renderer is playing, and what it has already played.
 *
 * The high-water mark is the whole of the memory: effect ids are handed out from one
 * counter that only ever climbs, so "seen before" is a comparison rather than a set. It has
 * to be remembered *separately* from the live list, because the live list forgets a beat
 * the moment it expires — and the view goes on offering that same effect for a dozen more
 * events, which without a mark would re-admit it forever.
 */
export interface BeatState {
  live: readonly LiveBeat[];
  mark: number;
}

/** Nothing playing and nothing seen. */
export const NO_BEATS: BeatState = Object.freeze({ live: [], mark: -1 });

/** How long each kind stays on screen, in milliseconds. */
export const BEAT_MS: Readonly<Record<Effect['kind'], number>> = Object.freeze({
  strike: 280,
  cast: 340,
  impact: 320,
  heal: 380,
  shield: 380,
  resist: 300,
  death: 520,
});

/**
 * Folds the view's effects into the live list and drops whatever has run its course.
 *
 * **Returns the state it was given when nothing changed**, which is what lets the caller
 * run one unconditional clock: `useState` bails out on an identical value, so a battlefield
 * with nothing playing re-renders zero times a second rather than twenty.
 */
export function advanceBeats(state: BeatState, effects: readonly Effect[], now: number): BeatState {
  const live = state.live.filter((beat) => now - beat.since < BEAT_MS[beat.kind]);
  const added = effects.filter((effect) => effect.id > state.mark);
  if (added.length === 0 && live.length === state.live.length) return state;

  return {
    live: [...live, ...added.map((effect) => ({ ...effect, since: now }))],
    mark: added.reduce((high, effect) => Math.max(high, effect.id), state.mark),
  };
}

/** The newest live beat of the given kinds on one unit, or nothing. */
export function beatFor(
  live: readonly LiveBeat[],
  key: string,
  kinds: readonly Effect['kind'][],
): LiveBeat | undefined {
  let best: LiveBeat | undefined;
  for (const beat of live) {
    if (!kinds.includes(beat.kind)) continue;
    if (`${beat.ref.side}:${beat.ref.slot}` !== key) continue;
    if (!best || beat.id > best.id) best = beat;
  }
  return best;
}
