/**
 * The key art a keep under the vale is drawn with.
 *
 * Ten places, ten faces. Same shape and reasoning as `regionArt` and `championArt`: what a
 * dungeon *is* — its name, its floors, the relics it gives up — is content, and what it
 * looks like is chrome, so the picture lives here rather than in the seed. Each entry is
 * chosen for the keep's own character, which is the only reason to have ten rather than a
 * single dungeon-shaped rectangle repeated.
 *
 * A dungeon the map has never heard of falls back by *kind*, and a kind it has never heard
 * of falls back again — content can add an eleventh keep in Admin without a code change,
 * and it has to land on something.
 */
const DUNGEON_ART: Readonly<Record<string, string>> = Object.freeze({
  // The relic keeps.
  wyrms_hollow: 'blood-plague-drake',
  frostgrave_vault: 'earth-frozen-core',
  cinderspire: 'fire-volcano',
  silkmire_depths: 'hunt-jade-carapace',
  // The pit.
  proving_grounds: 'earth-monolith',
  // The springs, one per element and one for the everyday.
  spring_pure: 'fx-lotus-spring',
  spring_verdant: 'fx-nature-surge',
  spring_ember: 'fire-molten-heart',
  spring_tide: 'fx-frost-comet',
  spring_mist: 'orb-voidspiral',
});

/** What a keep of this kind looks like when nobody has drawn it one of its own. */
const KIND_ART: Readonly<Record<string, string>> = Object.freeze({
  relic: 'earth-rune-arch',
  proving: 'earth-monolith',
  springs: 'fx-lotus-spring',
});

const FALLBACK = 'bg-scene-dark';

export function dungeonArt(key: string, kind?: string): string {
  return DUNGEON_ART[key] ?? (kind ? KIND_ART[kind] : undefined) ?? FALLBACK;
}

/**
 * The colour a keep's rim, tag and progress bar take.
 *
 * By kind rather than by keep: the three groups are farmed for three different things, and
 * a hub where the relic keeps share a colour is a hub a player can scan.
 */
const KIND_INK: Readonly<Record<string, string>> = Object.freeze({
  relic: '#c2764a',
  proving: '#c9a227',
  springs: '#57b35c',
});

export function dungeonInk(kind: string): string | undefined {
  return KIND_INK[kind];
}
