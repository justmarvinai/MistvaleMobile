import { describe, expect, it } from 'vitest';
import { GEAR_SLOTS } from '@mistvale/shared';
import { relicArt, relicGlyph } from './relicArt';

describe('relicArt', () => {
  it('draws every slot the game has', () => {
    for (const slot of GEAR_SLOTS) {
      expect(relicArt(slot), slot).not.toBe('rune-bronze-disc');
      expect(relicGlyph(slot), slot).toMatch(/^glyph-/);
    }
  });

  it('gives every slot its own icon, so a paperdoll is readable', () => {
    const icons = new Set(GEAR_SLOTS.map((slot) => relicArt(slot)));
    expect(icons.size).toBe(GEAR_SLOTS.length);
  });

  it('falls back to a real icon rather than to nothing', () => {
    // A slot that does not exist should still draw *something*: an empty socket is a
    // design choice, an unset background-image is a bug that looks like one.
    expect(relicArt('not-a-slot')).toBe('rune-bronze-disc');
    expect(relicGlyph('not-a-slot')).toMatch(/^glyph-/);
  });
});
