import type { ScreenId } from '../app/screens';
import type { MistPalette } from '../game/stage';

/**
 * What each tab of the game looks like behind everything else.
 *
 * The owner's own paintings, one per dock slot (2026-08-28), with the drifting fog the
 * shell has always had tinted to match what it is drifting over. Same shape and reasoning
 * as `dungeonArt`, `regionArt` and `sigilArt`: what a place *is* lives in the registry and
 * in content, and what it looks like lives here — so a seventh tab gets a backdrop by
 * adding one entry, and a tab with no entry falls back to the fog the game shipped with
 * rather than to a blank wall.
 *
 * **Per dock slot rather than per screen**, which is the whole point: a player standing in
 * the Depths is inside the Battle tab, and re-painting the room every time they step from
 * the Mistspire to Trials would make the shell flicker on navigation between two things
 * that are the same place. `dockSlotFor` already answers "which tab am I in" for every
 * screen in the game, so this map is six entries rather than twenty-four.
 */

/**
 * The fog's three drifting bands and the glow beneath them, as one palette.
 *
 * The shape is the renderer's — `game/stage` is what paints it — and the *values* are this
 * module's, which is the whole division: the fog knows how to drift and this map knows
 * what colour each tab drifts in.
 */
export type SmokePalette = MistPalette;

/**
 * The fog Mistvale has always drifted: warm brown over an ember glow.
 *
 * Three of the six tabs keep it verbatim at the owner's instruction — Combat, Champions and
 * the Bazaar — and their paintings agree with him: those three average to a warm brown
 * (#5b3823, #3b2315, #544031) where the other three do not. It is also what a tab with no
 * entry falls back to, which is what the game looked like before there were paintings.
 */
export const EMBER_SMOKE: SmokePalette = Object.freeze({
  bands: [0x2b211a, 0x3d2d1f, 0x55381f] as const,
  glow: 0xc2764a,
});

/** The Haven's blue: its night market averages #2d354a, the one cold painting of the six. */
const TIDE_SMOKE: SmokePalette = Object.freeze({
  bands: [0x141d2e, 0x1d2a42, 0x2b3d5c] as const,
  glow: 0x5b8ac9,
});

/** The Mistgate's violet — its painting is the only one that leans red rather than amber. */
const MIST_SMOKE: SmokePalette = Object.freeze({
  bands: [0x241a30, 0x342244, 0x4a2f60] as const,
  glow: 0xa06bd8,
});

/** Errands: green, and a deeper one than the painting's own #68867d so the fog still reads. */
const VERDANT_SMOKE: SmokePalette = Object.freeze({
  bands: [0x16241a, 0x1f3324, 0x2c4a31] as const,
  glow: 0x57b35c,
});

export interface TabScenery {
  /** The published wallpaper, or null for a tab with no painting of its own. */
  wallpaper: string | null;
  smoke: SmokePalette;
  /**
   * How hard the dark wash sits over the painting.
   *
   * `deep` is the owner's default — enough that painted panels and white text read over a
   * lit night market. `light` is for a tab whose painting *is* the screen: the Mistgate's
   * portal is the gate a player summons at, and a wash that turns it into a texture takes
   * the room away from the one screen built around it.
   */
  wash: 'deep' | 'light';
}

/**
 * One entry per dock slot, plus the two takeovers that reach none.
 *
 * The keys are `ScreenId`s so a renamed tab is a type error rather than a backdrop that
 * quietly stops appearing — which is also how the two takeovers were found, by a test
 * asking whether *every* screen in the game resolves to a painting rather than only the
 * six the owner listed.
 */
const TABS: Readonly<Partial<Record<ScreenId, TabScenery>>> = Object.freeze({
  haven: { wallpaper: 'tab_haven_wallpaper', smoke: TIDE_SMOKE, wash: 'deep' },
  battleHub: { wallpaper: 'tab_combat_wallpaper', smoke: EMBER_SMOKE, wash: 'deep' },
  championsHub: { wallpaper: 'tab_champions_wallpaper', smoke: EMBER_SMOKE, wash: 'deep' },
  errandsHub: { wallpaper: 'tab_errands_wallpaper', smoke: VERDANT_SMOKE, wash: 'deep' },
  mistgate: { wallpaper: 'tab_mistgate_wallpaper', smoke: MIST_SMOKE, wash: 'light' },
  bazaar: { wallpaper: 'tab_bazaar_wallpaper', smoke: EMBER_SMOKE, wash: 'deep' },

  // The two screens that are *takeovers* rather than tabs, and so reach no dock slot of
  // their own. Both are painted anyway, because "no tab" is not the same as "no room":
  //
  //  - **A fight is Combat.** The battlefield covers the screen once it is drawn, but the
  //    moment before it is — and the cold open, which is a mostly empty screen by design
  //    (C17) — would otherwise be the one place in the game that went back to a bare wall.
  //  - **The mailbox is an errand.** It is a list of things to claim, which is exactly what
  //    C12 put behind the Errands tab; it is reached from the top bar only because it has a
  //    pip on it.
  battle: { wallpaper: 'tab_combat_wallpaper', smoke: EMBER_SMOKE, wash: 'deep' },
  mail: { wallpaper: 'tab_errands_wallpaper', smoke: VERDANT_SMOKE, wash: 'deep' },
});

/** What the room behind a given tab looks like. */
export function tabScenery(slot: ScreenId | null): TabScenery {
  const found = slot ? TABS[slot] : undefined;
  return found ?? { wallpaper: null, smoke: EMBER_SMOKE, wash: 'deep' };
}

/**
 * The URL a wallpaper is served from.
 *
 * `.jpg` because `pnpm assets` publishes this set as JPEG whatever the master is: a painted
 * scene with no flat regions is the case PNG is worst at, and the six come to 12.9 MB as
 * PNG against 1.45 MB as JPEG. Built here rather than stored in the map so the map holds
 * names rather than paths.
 */
export function wallpaperUrl(name: string): string {
  return `/wallpapers/${name}.jpg`;
}
