import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCREENS } from './screens';
import { UNLOCKS } from './unlocks';

/**
 * Every painting the shell names is one the vendored library actually has (C45).
 *
 * A place's art is a `background-image` resolved through a custom property, and a
 * property that resolves to nothing draws nothing — no torn page, no console line, just an
 * empty card. The Wardens hub card carried `icon-banner` from C12 to C45 and nobody could
 * tell it apart from a card whose picture had not loaded yet. The registry already refuses
 * two places sharing a picture; this refuses a picture that does not exist, against the
 * same file the browser reads.
 */
const ASSET_CSS = new URL('../fui/styles/assets.css', import.meta.url);

function vendoredArt(): Set<string> {
  const ids = new Set<string>();
  for (const match of readFileSync(ASSET_CSS, 'utf8').matchAll(/--fui-img-([a-z0-9-]+):/g)) {
    ids.add(match[1]!);
  }
  return ids;
}

describe('the shell’s paintings', () => {
  const art = vendoredArt();

  it('reads the vendored list rather than an empty file', () => {
    expect(art.size).toBeGreaterThan(100);
  });

  it('names a painting the library has, for every place', () => {
    for (const screen of SCREENS) {
      if (!screen.art) continue;
      expect(art.has(screen.art), `${screen.id} draws ${screen.art}`).toBe(true);
    }
  });

  it('names a painting the library has, for every unlock badge', () => {
    for (const unlock of UNLOCKS) {
      if (!unlock.art) continue;
      expect(art.has(unlock.art), `${unlock.key} wears ${unlock.art}`).toBe(true);
    }
  });
});
