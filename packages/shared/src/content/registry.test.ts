import { describe, expect, it } from 'vitest';
import { CONTENT_LOAD_ORDER, CONTENT_REGISTRY, CONTENT_TYPES } from './registry';
import { contentBundleSchema } from './bundle';

/**
 * The registry is enumerated in four places, and three of them are hand-written lists.
 *
 * That is the shape this project keeps getting caught by: `CONTENT_TYPES` is the truth,
 * `CONTENT_REGISTRY` is keyed by it and so the compiler holds it, but **`CONTENT_LOAD_ORDER`
 * is a plain array** and the **bundle** is a Zod object — neither of which the compiler can
 * check against the list. A type missing from the load order is not a type error and not a
 * runtime error either: it simply never validates, never seeds and never reaches the client,
 * which is a whole content family that publishes cleanly and does nothing.
 *
 * That is not hypothetical. It is exactly what happened when `valePass` was added (C38): the
 * schema was right, the registry entry was right, the migration was right, and the season
 * was invisible because one hand-written array had twenty-six entries instead of
 * twenty-seven. These tests are what makes the next one a red build instead of an afternoon.
 */

describe('the content registry', () => {
  it('loads every type it knows about, exactly once', () => {
    expect([...CONTENT_LOAD_ORDER].sort()).toEqual([...CONTENT_TYPES].sort());
    expect(new Set(CONTENT_LOAD_ORDER).size).toBe(CONTENT_LOAD_ORDER.length);
  });

  it('loads a type only after everything it points at', () => {
    // The order is what makes publish validation able to check a reference resolves, so a
    // type placed before what it references would report every one of them as missing.
    const seen = new Set<string>();
    for (const type of CONTENT_LOAD_ORDER) {
      for (const reference of CONTENT_REGISTRY[type].references) {
        expect(seen.has(reference), `${type} references ${reference}, which loads later`).toBe(
          true,
        );
      }
      seen.add(type);
    }
  });

  it('gives every bundled type a field on the bundle', () => {
    // The other silent half: a type marked `inBundle` with no field is one the client can
    // never see. The *names* are irregular (`status` → `statuses`), so the pairing is the
    // server's `EMPTY_BUNDLE_TYPES` and is checked there against this list; what this can
    // say without guessing is that the counts line up. `gameConfig` is folded into `config`
    // rather than listed, which is the one deliberate exception.
    const fields = Object.keys(contentBundleSchema.shape).filter(
      (name) => !['rev', 'publishedAt', 'config'].includes(name),
    );
    const bundled = CONTENT_TYPES.filter(
      (type) => CONTENT_REGISTRY[type].inBundle && type !== 'gameConfig',
    );
    expect(fields).toHaveLength(bundled.length);
  });
});
