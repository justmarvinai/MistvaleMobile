/**
 * What a region of the vale is drawn with.
 *
 * Regions are content — a chapter names its own — but the glyph a region wears on the map
 * is chrome, so it lives here rather than in the seed. Same shape and same reasoning as
 * `championArt`'s faction stand-ins: a map with one marker repeated twelve times says
 * nothing, and six marked places say where the road goes.
 *
 * A region the map has never heard of falls back rather than drawing nothing, because
 * content can add a seventh without a code change.
 */
const REGION_GLYPH: Readonly<Record<string, string>> = Object.freeze({
  'The Fringe': 'glyph-thorny-branch',
  'Sunken Marches': 'glyph-spirit-vortex',
  'The Thornmere': 'glyph-nature-shield',
  'The Windward Rise': 'glyph-eagle-staff',
  'The Sunless Fen': 'glyph-cursed-eye',
  'The Coilstone': 'glyph-skull-wreath',
});

/** The generic one, for a region nobody has drawn. */
const FALLBACK = 'glyph-crossed-swords';

export function regionGlyph(region: string | undefined): string {
  return (region ? REGION_GLYPH[region] : undefined) ?? FALLBACK;
}
