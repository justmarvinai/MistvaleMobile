import type { IconName } from '@/ui/Icon/Icon';
import type { UnlockFlags } from '@mistvale/shared';

/**
 * The screen registry.
 *
 * Adding a screen means adding an entry here plus its folder — nothing global changes.
 * `unlock` names the flag from the player snapshot that gates it; locked screens still
 * appear in the dock as mist-shrouded teasers so the player can see what is coming
 * (docs/UI_UX_DESIGN.md §2).
 */

export type ScreenId =
  | 'haven'
  | 'campaign'
  | 'depths'
  | 'arena'
  | 'champions'
  | 'relics'
  | 'mistgate'
  | 'chronicle'
  | 'bazaar'
  | 'quests'
  | 'missions'
  | 'events'
  | 'calendar'
  | 'mail'
  | 'battle';

export interface ScreenDefinition {
  id: ScreenId;
  label: string;
  /**
   * The game-icons symbol this screen is drawn with.
   *
   * Replaced a Unicode glyph per screen, which is what shipped from P0 to the QA pass —
   * including a colour-emoji padlock for a locked one, in a hand-built pixel interface.
   */
  icon: IconName;
  /**
   * The FantasyUIs line glyph the dock draws this screen with.
   *
   * A second symbol per screen rather than a reuse of `icon`, because the two are drawn
   * by different machinery for different jobs: `icon` is a game-icons sprite tinted by
   * Mistvale's own kit and used at any size, while the dock's glyph is a CSS mask the
   * library tints per state — active, locked, badged — and only the library's own
   * `line-glyphs` pack is cut for that.
   */
  glyph: string;
  /**
   * The painted icon the Haven draws this station with.
   *
   * A third symbol, and the reason is scale: the dock's glyph is a 20px monochrome mask
   * that has to stay legible tinted, while a station on the home screen is a 64px painted
   * object in a framed socket — the thing that makes the camp look like a place rather
   * than a menu. Both come from the library's packs, so both move with the theme.
   */
  art: string;
  /** Which unlock flag gates this screen; omitted means always available. */
  unlock?: keyof UnlockFlags;
  /** Shown on the locked-state tooltip. */
  lockedHint?: string;
  /** Screens present in the bottom dock, in order. */
  inDock: boolean;
}

export const SCREENS: readonly ScreenDefinition[] = [
  {
    id: 'haven',
    label: 'Haven',
    icon: 'nav-haven',
    glyph: 'glyph-holy-totem',
    art: 'crest-stone-guard',
    inDock: true,
  },
  {
    id: 'campaign',
    label: 'Campaign',
    icon: 'nav-campaign',
    glyph: 'glyph-crossed-swords',
    art: 'crest-warmark',
    inDock: true,
  },
  {
    id: 'depths',
    label: 'The Depths',
    icon: 'nav-depths',
    glyph: 'glyph-skull-wreath',
    art: 'blood-crimson-gate',
    unlock: 'springs',
    lockedHint: 'Opens at level 10',
    inDock: true,
  },
  {
    id: 'arena',
    label: 'Arena',
    icon: 'nav-arena',
    glyph: 'glyph-trophy-cup',
    art: 'crest-gilded-crown',
    unlock: 'arena',
    lockedHint: 'Opens at level 8',
    inDock: true,
  },
  {
    id: 'champions',
    label: 'Champions',
    icon: 'nav-champions',
    glyph: 'glyph-cloaked-figure',
    art: 'hero-vanguard',
    inDock: true,
  },
  // Deliberately ungated: relics start dropping from the first campaign clear, and a
  // player who cannot see what they just earned has no idea the system exists. The
  // `relicUpgrading` unlock gates the *forge* inside this screen, which is what the flag
  // actually names (docs/GAME_DESIGN.md §12).
  {
    id: 'relics',
    label: 'Relics',
    icon: 'nav-relics',
    glyph: 'glyph-ribcage-armor',
    art: 'crest-warded-shield',
    inDock: true,
  },
  {
    id: 'mistgate',
    label: 'Mistgate',
    icon: 'nav-mistgate',
    glyph: 'glyph-spirit-vortex',
    art: 'orb-voidspiral',
    inDock: true,
  },
  {
    id: 'chronicle',
    label: 'Chronicle',
    icon: 'nav-chronicle',
    glyph: 'glyph-spell-book',
    art: 'icon-astrolabe',
    unlock: 'chronicle',
    lockedHint: 'Opens at level 9',
    inDock: true,
  },
  {
    id: 'bazaar',
    label: 'Bazaar',
    icon: 'nav-bazaar',
    glyph: 'glyph-health-potion',
    art: 'rune-jade-coin',
    unlock: 'bazaar',
    lockedHint: 'Opens at level 5',
    inDock: true,
  },
  {
    id: 'quests',
    label: 'Quests',
    icon: 'nav-quests',
    glyph: 'glyph-burning-scroll',
    art: 'crest-sacred-anchor',
    unlock: 'quests',
    lockedHint: 'Opens at level 4',
    inDock: true,
  },
  {
    id: 'missions',
    label: 'Missions',
    icon: 'nav-missions',
    glyph: 'glyph-eagle-staff',
    art: 'crest-ember-shield',
    unlock: 'quests',
    lockedHint: 'Opens at level 4',
    inDock: true,
  },
  {
    id: 'events',
    label: 'Events',
    icon: 'nav-events',
    glyph: 'glyph-shooting-stars',
    art: 'rune-nova-star',
    unlock: 'events',
    lockedHint: 'Opens at level 7',
    inDock: true,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: 'nav-calendar',
    glyph: 'glyph-hourglass',
    art: 'rune-starfall',
    unlock: 'loginCalendar',
    lockedHint: 'Opens at level 2',
    inDock: true,
  },
  // Reached from the top bar rather than the dock — mail is an errand, not a destination.
  // Settings is not here at all: it is a modal, so it can be opened over a fight as well
  // as over the Haven. It carried a registry row for nine phases that nothing navigated
  // to and `App` had no branch for, so reaching it would have shown the placeholder.
  {
    id: 'mail',
    label: 'Mail',
    icon: 'nav-mail',
    glyph: 'glyph-magic-feather',
    art: 'rune-flame-sigil',
    inDock: false,
  },
  // A full-screen takeover reached from team select, never from the dock.
  {
    id: 'battle',
    label: 'Battle',
    icon: 'nav-battle',
    glyph: 'glyph-sword-clash',
    art: 'weapon-broadsword',
    inDock: false,
  },
];

export const DOCK_SCREENS = SCREENS.filter((screen) => screen.inDock);

export function isScreenUnlocked(screen: ScreenDefinition, unlocks: UnlockFlags | null): boolean {
  if (!screen.unlock) return true;
  return unlocks?.[screen.unlock] ?? false;
}
