import { AFFINITIES, type AffinityDef } from '@/fui/components/AffinityBadge.ts';
import { ELEMENTS, type Element } from '@mistvale/shared';

/**
 * Mistvale's four elements, in the library's vocabulary.
 *
 * The library ships nine affinities of its own — magic, spirit, force, void and five
 * classical elements — and its components take an affinity by *key*: `ChampionCard` looks
 * one up and draws nothing if it is not there. Mistvale's four are ember, tide, verdant
 * and mist, and none of them is in that table.
 *
 * `AFFINITIES` is an exported mutable record and the library's own documentation offers a
 * `def` for "a custom system", so registering into it is the intended extension rather
 * than a workaround — and it is the only shape that reaches the components that take a key
 * instead of a def. Done once, at startup, so every component in the game agrees about
 * what an ember champion looks like.
 *
 * The colours are the game's own affinity tokens: an element means the same thing on a
 * card, in a battle log and on a stage's threat line, so it is content rather than chrome
 * and did not move with the palette in D1.
 */
const MISTVALE_AFFINITIES: Readonly<Record<Element, AffinityDef>> = Object.freeze({
  ember: { id: 'ember', label: 'Ember', glyph: 'glyph-magic-flame', color: '#e5533d' },
  tide: { id: 'tide', label: 'Tide', glyph: 'glyph-spirit-vortex', color: '#3f8fd4' },
  verdant: { id: 'verdant', label: 'Verdant', glyph: 'glyph-nature-shield', color: '#57b35c' },
  mist: { id: 'mist', label: 'Mist', glyph: 'glyph-celestial-body', color: '#a06bd8' },
});

/** Registers Mistvale's elements with the library. Called once from `main.tsx`. */
export function registerAffinities(): void {
  for (const element of ELEMENTS) AFFINITIES[element] = MISTVALE_AFFINITIES[element];
}

/** The definition for one element, for a component that takes a `def` rather than a key. */
export function affinityOf(element: string): AffinityDef | undefined {
  return MISTVALE_AFFINITIES[element as Element];
}

/**
 * Each element's glyph, on its own.
 *
 * The affinity table is the library's and takes a whole `AffinityDef`; a segmented strip or
 * a filter chip wants only the mark. Derived from the same record rather than written twice,
 * so the Hall's element tabs and a champion card's badge can never disagree.
 */
export const AFFINITY_GLYPH: Readonly<Record<Element, string>> = Object.freeze(
  Object.fromEntries(
    ELEMENTS.map((element) => [element, MISTVALE_AFFINITIES[element].glyph]),
  ) as Record<Element, string>,
);
