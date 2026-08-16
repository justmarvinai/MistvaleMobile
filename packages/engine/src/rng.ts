/**
 * Seeded pseudo-random number generation for the battle engine.
 *
 * The engine must be perfectly reproducible: the same seed and the same inputs have to
 * produce the same battle, every time, on every machine. That gives us golden-replay
 * tests, crash recovery, and an Admin battle inspector for free (docs/COMBAT_SYSTEM.md
 * §13). `Math.random()` cannot do this, so battles use xoshiro128** — small, fast, and
 * statistically solid for game use.
 *
 * NOT for security. Session tokens and reward rolls use `crypto` on the server so that
 * a replay seed can never be used to predict drops.
 */

/** A deterministic random source. Every engine function takes one explicitly. */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** True with probability `chance` (clamped to [0, 1]). */
  chance(probability: number): boolean;
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** A new array containing the same items in shuffled order. */
  shuffle<T>(items: readonly T[]): T[];
  /** Snapshot of internal state, so a battle can be persisted mid-fight and resumed. */
  getState(): RngState;
}

/** The four 32-bit words of xoshiro128** state. */
export type RngState = readonly [number, number, number, number];

/** Mixing function used to expand a single seed into full generator state. */
function splitMix32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0;
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0;
    return (z ^ (z >>> 15)) >>> 0;
  };
}

function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * Creates a deterministic RNG.
 *
 * @param seed Any 32-bit integer. Battles persist their seed so replays are exact.
 */
export function createRng(seed: number): Rng {
  const mix = splitMix32(Math.trunc(seed) >>> 0);
  let s0 = mix();
  const s1 = mix();
  const s2 = mix();
  const s3 = mix();

  // An all-zero state is a fixed point for xoshiro; nudge it if the seed lands there.
  if ((s0 | s1 | s2 | s3) === 0) {
    s0 = 1;
  }

  return createRngFromState([s0, s1, s2, s3]);
}

/** Recreates an RNG from a persisted state snapshot, resuming the exact sequence. */
export function createRngFromState(state: RngState): Rng {
  let [s0, s1, s2, s3] = state.map((word) => word >>> 0) as [number, number, number, number];

  /** Raw xoshiro128** step: returns a uint32. */
  function nextUint32(): number {
    const result = (Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0) >>> 0;
    const t = (s1 << 9) >>> 0;

    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);

    return result;
  }

  const rng: Rng = {
    next(): number {
      // 2^-32 scaling keeps the result in [0, 1).
      return nextUint32() * 2.3283064365386963e-10;
    },

    int(min: number, max: number): number {
      const lo = Math.ceil(min);
      const hi = Math.floor(max);
      if (hi < lo) {
        throw new RangeError(`Rng.int: empty range [${min}, ${max}]`);
      }
      const span = hi - lo + 1;
      return lo + Math.floor(rng.next() * span);
    },

    chance(probability: number): boolean {
      if (probability <= 0) return false;
      if (probability >= 1) return true;
      return rng.next() < probability;
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) {
        throw new RangeError('Rng.pick: cannot pick from an empty array');
      }
      // Non-null assertion is safe: index is bounded by the emptiness check above.
      return items[rng.int(0, items.length - 1)]!;
    },

    shuffle<T>(items: readonly T[]): T[] {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = rng.int(0, i);
        const a = copy[i]!;
        const b = copy[j]!;
        copy[i] = b;
        copy[j] = a;
      }
      return copy;
    },

    getState(): RngState {
      return [s0 >>> 0, s1 >>> 0, s2 >>> 0, s3 >>> 0];
    },
  };

  return rng;
}

/**
 * Derives a stable child seed from a parent seed and a label.
 *
 * Used where one battle needs independent streams (per-wave enemy jitter, for example)
 * without letting one stream's consumption shift another's results.
 */
export function deriveSeed(parentSeed: number, label: string): number {
  let hash = Math.trunc(parentSeed) >>> 0;
  for (let i = 0; i < label.length; i += 1) {
    hash = (Math.imul(hash ^ label.charCodeAt(i), 0x01000193) >>> 0) >>> 0;
  }
  return hash >>> 0;
}
