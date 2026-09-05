/**
 * What an expedition is drawn with (C45).
 *
 * Expeditions are content and carry no art of their own — an operator authors a name, a
 * description and a favour list — so the painting is chrome, chosen here the way
 * `regionArt` chooses a chapter's: from the pack's own paintings, by key where the seed's
 * three are known, and from a short rotation for any errand added in Admin later, so a
 * fourth expedition lands with a picture rather than a blank band.
 */
const EXPEDITION_ART: Readonly<Record<string, string>> = Object.freeze({
  exp_mist_patrol: 'orb-frostwind',
  exp_reliquary_dig: 'earth-gem-boulder',
  exp_long_survey: 'earth-rune-arch',
});

const ROTATION: readonly string[] = Object.freeze([
  'earth-mossy-stone',
  'earth-monolith',
  'earth-crystal-bloom',
  'earth-golden-seed',
]);

export function expeditionArt(key: string, ordinal: number): string {
  return EXPEDITION_ART[key] ?? ROTATION[Math.abs(ordinal) % ROTATION.length]!;
}
