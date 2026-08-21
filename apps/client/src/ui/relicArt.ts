import { GEAR_SLOTS, type GearSlot } from '@mistvale/shared';

/**
 * What a relic slot looks like.
 *
 * Relic slots are content — nine of them, named and ordered in the seed — but what each
 * one is *drawn* with is chrome, and since the design rework that means two things: a
 * painted icon for the piece itself, and a monochrome glyph for the slot pip and the empty
 * socket behind it. Two symbols because they are drawn by different machinery at different
 * sizes: the icon is a 64px painted object on a card, the glyph is a CSS mask the library
 * tints per state.
 *
 * Kept in one place so a relic card, the paperdoll, the vault grid and the picker all draw
 * a boot the same way. Slots are a closed set the server owns, so this is exhaustive by
 * construction — `SLOT_ART` is typed on `GearSlot` and the compiler refuses a new slot
 * that nobody has drawn.
 */
interface SlotArt {
  /** Painted icon, from the library's spell-icon pack. */
  art: string;
  /** Line glyph, for the pip and the empty socket. */
  glyph: string;
}

const SLOT_ART: Readonly<Record<GearSlot, SlotArt>> = Object.freeze({
  weapon: { art: 'weapon-broadsword', glyph: 'glyph-crossed-swords' },
  helm: { art: 'crest-stone-guard', glyph: 'glyph-shield-block' },
  shield: { art: 'crest-warded-shield', glyph: 'glyph-nature-shield' },
  gauntlets: { art: 'tech-power-gauntlet', glyph: 'glyph-fist-punch' },
  cuirass: { art: 'crest-ember-shield', glyph: 'glyph-ribcage-armor' },
  boots: { art: 'hunt-tracking-ring', glyph: 'glyph-stomp-impact' },
  ring: { art: 'rune-sealed-ring', glyph: 'glyph-arcane-symbol' },
  amulet: { art: 'rune-radiant-gem', glyph: 'glyph-celestial-body' },
  banner: { art: 'crest-warmark', glyph: 'glyph-eagle-staff' },
});

/** The painted icon a relic in this slot is drawn with. */
export function relicArt(slot: string): string {
  return SLOT_ART[slot as GearSlot]?.art ?? 'rune-bronze-disc';
}

/** The line glyph for a slot's pip and its empty socket. */
export function relicGlyph(slot: string): string {
  return SLOT_ART[slot as GearSlot]?.glyph ?? 'glyph-arcane-symbol';
}

/** Every slot, in the order the game lays them out. Re-exported so callers need one import. */
export const RELIC_SLOTS = GEAR_SLOTS;

/**
 * What each slot is called in a sentence.
 *
 * Lived in `ChampionDetail` and was needed in a second place the moment the relic dialog
 * got a real title — it had been interpolating the raw key, so the header read "weapon
 * relic" in lower case beside a title bar that shouts. One map, beside the icons and the
 * glyphs, because a slot's name is the same kind of fact as its picture.
 */
export const RELIC_SLOT_LABEL: Readonly<Record<GearSlot, string>> = Object.freeze({
  weapon: 'Weapon',
  helm: 'Helm',
  shield: 'Shield',
  gauntlets: 'Gauntlets',
  cuirass: 'Cuirass',
  boots: 'Boots',
  ring: 'Ring',
  amulet: 'Amulet',
  banner: 'Banner',
});
