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

/**
 * A painting for each chapter of a region, for the vale's markers (C44).
 *
 * The glyph above is a one-colour mask, which is all a 30px disc could carry; at 72px a
 * marker is a picture, and twelve identical grey discs with a different scratch in each
 * was the whole reason the map read as a diagram. These are the pack's own paintings,
 * chosen for the region's character — the same rule `dungeonArt` and `goalArt` follow —
 * and there are several per region because a region holds two or three chapters, and a
 * road of twelve places should not repeat itself.
 */
const REGION_ART: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'The Fringe': ['earth-verdant-ward', 'earth-mossy-stone'],
  'Sunken Marches': ['orb-frostwind', 'earth-fungal-stone'],
  'The Thornmere': ['fx-thorn-bloom', 'fx-vine-lash'],
  'The Windward Rise': ['earth-rock-spire', 'earth-monolith'],
  'The Sunless Fen': ['blood-cursed-beast', 'blood-toxin-flow'],
  'The Coilstone': ['blood-serpent-coil', 'blood-crimson-gate', 'blood-crimson-moon'],
});

const ART_FALLBACK = 'earth-runestone-disc';

/**
 * The painting for the `ordinal`-th chapter in a region (0 for the first). A region with
 * more chapters than paintings repeats its last one rather than drawing nothing.
 */
export function regionArt(region: string | undefined, ordinal = 0): string {
  const list = region ? REGION_ART[region] : undefined;
  if (!list || list.length === 0) return ART_FALLBACK;
  return list[Math.min(ordinal, list.length - 1)] ?? ART_FALLBACK;
}
