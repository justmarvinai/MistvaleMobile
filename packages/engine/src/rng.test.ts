import { describe, expect, it } from 'vitest';
import { createRng, createRngFromState, deriveSeed } from './rng';

describe('createRng determinism', () => {
  it('produces an identical sequence for the same seed', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    const seqA = Array.from({ length: 200 }, () => a.next());
    const seqB = Array.from({ length: 200 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from(
      { length: 50 },
      (
        (r) => () =>
          r.next()
      )(createRng(1)),
    );
    const b = Array.from(
      { length: 50 },
      (
        (r) => () =>
          r.next()
      )(createRng(2)),
    );
    expect(a).not.toEqual(b);
  });

  it('survives a zero seed without collapsing to a fixed point', () => {
    const rng = createRng(0);
    const values = Array.from({ length: 20 }, () => rng.next());
    expect(new Set(values).size).toBeGreaterThan(15);
  });

  it('handles negative and fractional seeds deterministically', () => {
    expect(createRng(-7).next()).toBe(createRng(-7).next());
    expect(createRng(3.9).next()).toBe(createRng(3).next());
  });
});

describe('next()', () => {
  it('stays within [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 10_000; i += 1) {
      const value = rng.next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });

  it('has a mean near 0.5 over many draws', () => {
    const rng = createRng(2024);
    let total = 0;
    const draws = 50_000;
    for (let i = 0; i < draws; i += 1) total += rng.next();
    expect(total / draws).toBeGreaterThan(0.49);
    expect(total / draws).toBeLessThan(0.51);
  });

  it('spreads draws roughly evenly across ten buckets', () => {
    const rng = createRng(7);
    const buckets = new Array<number>(10).fill(0);
    const draws = 50_000;
    for (let i = 0; i < draws; i += 1) {
      buckets[Math.floor(rng.next() * 10)]! += 1;
    }
    for (const count of buckets) {
      // Expect 5000 per bucket; allow a generous ±15% band.
      expect(count).toBeGreaterThan(draws / 10 - draws / 10 / 6);
      expect(count).toBeLessThan(draws / 10 + draws / 10 / 6);
    }
  });
});

describe('int()', () => {
  it('includes both bounds and never leaves the range', () => {
    const rng = createRng(555);
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 5_000; i += 1) {
      const value = rng.int(1, 6);
      expect(Number.isInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(6);
      if (value === 1) sawMin = true;
      if (value === 6) sawMax = true;
    }
    expect(sawMin && sawMax).toBe(true);
  });

  it('returns the only value in a single-value range', () => {
    const rng = createRng(1);
    expect(rng.int(4, 4)).toBe(4);
  });

  it('throws on an inverted range', () => {
    const rng = createRng(1);
    expect(() => rng.int(5, 2)).toThrow(RangeError);
  });

  it('handles negative ranges', () => {
    const rng = createRng(42);
    for (let i = 0; i < 500; i += 1) {
      const value = rng.int(-5, -1);
      expect(value).toBeGreaterThanOrEqual(-5);
      expect(value).toBeLessThanOrEqual(-1);
    }
  });
});

describe('chance()', () => {
  it('treats zero and one as certainties without consuming randomness', () => {
    const rng = createRng(3);
    const before = rng.getState();
    expect(rng.chance(0)).toBe(false);
    expect(rng.chance(1)).toBe(true);
    expect(rng.chance(-0.5)).toBe(false);
    expect(rng.chance(2)).toBe(true);
    expect(rng.getState()).toEqual(before);
  });

  it('lands near the requested probability', () => {
    const rng = createRng(808);
    let hits = 0;
    const trials = 40_000;
    for (let i = 0; i < trials; i += 1) {
      if (rng.chance(0.75)) hits += 1;
    }
    expect(hits / trials).toBeGreaterThan(0.73);
    expect(hits / trials).toBeLessThan(0.77);
  });
});

describe('pick() and shuffle()', () => {
  it('picks only from the given items and reaches all of them', () => {
    const rng = createRng(11);
    const items = ['ember', 'tide', 'verdant', 'mist'] as const;
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) {
      const value = rng.pick(items);
      expect(items).toContain(value);
      seen.add(value);
    }
    expect(seen.size).toBe(items.length);
  });

  it('throws when picking from an empty array', () => {
    expect(() => createRng(1).pick([])).toThrow(RangeError);
  });

  it('returns a new array with the same members', () => {
    const rng = createRng(4);
    const source = [1, 2, 3, 4, 5, 6, 7, 8];
    const shuffled = rng.shuffle(source);
    expect(shuffled).not.toBe(source);
    expect(source).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(source);
  });

  it('actually reorders and does so deterministically', () => {
    const source = Array.from({ length: 20 }, (_, i) => i);
    const first = createRng(31).shuffle(source);
    const second = createRng(31).shuffle(source);
    expect(first).toEqual(second);
    expect(first).not.toEqual(source);
  });

  it('handles empty and single-item shuffles', () => {
    const rng = createRng(1);
    expect(rng.shuffle([])).toEqual([]);
    expect(rng.shuffle(['only'])).toEqual(['only']);
  });
});

describe('state snapshots', () => {
  it('resumes the exact sequence from a snapshot', () => {
    const rng = createRng(2718);
    for (let i = 0; i < 37; i += 1) rng.next();

    const snapshot = rng.getState();
    const expected = Array.from({ length: 25 }, () => rng.next());

    const resumed = createRngFromState(snapshot);
    const actual = Array.from({ length: 25 }, () => resumed.next());
    expect(actual).toEqual(expected);
  });

  it('returns an immutable-by-copy state that advances with use', () => {
    const rng = createRng(5);
    const before = rng.getState();
    rng.next();
    expect(rng.getState()).not.toEqual(before);
    expect(before.every((word) => Number.isInteger(word) && word >= 0)).toBe(true);
  });
});

describe('deriveSeed', () => {
  it('is deterministic per (seed, label) pair', () => {
    expect(deriveSeed(100, 'wave-1')).toBe(deriveSeed(100, 'wave-1'));
  });

  it('separates streams by label and by parent seed', () => {
    expect(deriveSeed(100, 'wave-1')).not.toBe(deriveSeed(100, 'wave-2'));
    expect(deriveSeed(100, 'wave-1')).not.toBe(deriveSeed(101, 'wave-1'));
  });

  it('produces usable 32-bit unsigned seeds', () => {
    const seed = deriveSeed(-99, 'drops');
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThanOrEqual(0xffffffff);
  });

  it('yields independent-looking streams for sibling labels', () => {
    const a = createRng(deriveSeed(7, 'a'));
    const b = createRng(deriveSeed(7, 'b'));
    const seqA = Array.from({ length: 30 }, () => a.next());
    const seqB = Array.from({ length: 30 }, () => b.next());
    expect(seqA).not.toEqual(seqB);
  });
});
