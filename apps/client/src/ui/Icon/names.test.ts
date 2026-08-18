import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ICON_NAMES } from './names';

/**
 * The client's icon list against the one the build publishes.
 *
 * `names.ts` is hand-written because a generated type does not exist until the build has
 * run, and `pnpm typecheck` runs before that. The cost of writing it by hand is drift —
 * an icon renamed in `tools/icon-fetch/src/icons.ts` becomes an empty square that no
 * typecheck and no test would otherwise notice. This is that test.
 */

const MANIFEST = resolve(__dirname, '../../../public/icons/icons.json');

function published(): string[] | null {
  try {
    const parsed = JSON.parse(readFileSync(MANIFEST, 'utf8')) as { icons: Record<string, unknown> };
    return Object.keys(parsed.icons).sort();
  } catch {
    // The manifest is a build artifact. A checkout that has never run `pnpm icons` has no
    // business failing this — the build regenerates it, and CI runs the build.
    return null;
  }
}

describe('the icon set', () => {
  it('matches what tools/icon-fetch publishes', () => {
    const set = published();
    if (!set) return;
    expect([...ICON_NAMES].sort()).toEqual(set);
  });

  it('has no duplicates', () => {
    expect(new Set(ICON_NAMES).size).toBe(ICON_NAMES.length);
  });

  it('carries a placeholder portrait, because most champions have no art', () => {
    expect(ICON_NAMES).toContain('portrait-unknown');
  });
});
