import { describe, expect, it } from 'vitest';
import { CONTENT_REGISTRY, CONTENT_TYPES, contentBundleSchema } from '@mistvale/shared';
import { EMPTY_BUNDLE_TYPES } from './cache';

/**
 * The pairing between a content type and its field on the bundle.
 *
 * The names are irregular — `status` → `statuses`, `mastery` → `masteries` — so nothing can
 * derive one from the other, which makes this mapping a hand-written third enumeration of
 * the registry. `registry.test.ts` in shared checks the *counts*; this is where the actual
 * pairing is held, because this is where the mapping lives.
 *
 * What it catches is a whole content family that publishes cleanly and never reaches the
 * client — which is precisely what happened to the Vale Pass while it was being built, from
 * a different missing list (C38).
 */
describe('the bundle mapping', () => {
  const bundled = CONTENT_TYPES.filter(
    (type) => CONTENT_REGISTRY[type].inBundle && type !== 'gameConfig',
  );

  it('gives every bundled type exactly one field', () => {
    expect([...Object.values(EMPTY_BUNDLE_TYPES)].sort()).toEqual([...bundled].sort());
  });

  it('names fields the bundle actually has', () => {
    const fields = new Set(Object.keys(contentBundleSchema.shape));
    for (const key of Object.keys(EMPTY_BUNDLE_TYPES)) {
      expect(fields.has(key), `the bundle has no "${key}"`).toBe(true);
    }
  });

  it('leaves nothing on the bundle unmapped', () => {
    // The other direction, which is the one that bites: a field added to the bundle schema
    // and never mapped is always an empty array, so every screen reading it draws an empty
    // state and nothing errors anywhere.
    const mapped = new Set([...Object.keys(EMPTY_BUNDLE_TYPES), 'rev', 'publishedAt', 'config']);
    for (const field of Object.keys(contentBundleSchema.shape)) {
      expect(mapped.has(field), `"${field}" is on the bundle and filled by nothing`).toBe(true);
    }
  });
});
