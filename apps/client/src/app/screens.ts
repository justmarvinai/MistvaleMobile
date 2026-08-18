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
  /** Which unlock flag gates this screen; omitted means always available. */
  unlock?: keyof UnlockFlags;
  /** Shown on the locked-state tooltip. */
  lockedHint?: string;
  /** Screens present in the bottom dock, in order. */
  inDock: boolean;
}

export const SCREENS: readonly ScreenDefinition[] = [
  { id: 'haven', label: 'Haven', icon: 'nav-haven', inDock: true },
  { id: 'campaign', label: 'Campaign', icon: 'nav-campaign', inDock: true },
  {
    id: 'depths',
    label: 'The Depths',
    icon: 'nav-depths',
    unlock: 'springs',
    lockedHint: 'Opens at level 10',
    inDock: true,
  },
  {
    id: 'arena',
    label: 'Arena',
    icon: 'nav-arena',
    unlock: 'arena',
    lockedHint: 'Opens at level 8',
    inDock: true,
  },
  { id: 'champions', label: 'Champions', icon: 'nav-champions', inDock: true },
  // Deliberately ungated: relics start dropping from the first campaign clear, and a
  // player who cannot see what they just earned has no idea the system exists. The
  // `relicUpgrading` unlock gates the *forge* inside this screen, which is what the flag
  // actually names (docs/GAME_DESIGN.md §12).
  { id: 'relics', label: 'Relics', icon: 'nav-relics', inDock: true },
  { id: 'mistgate', label: 'Mistgate', icon: 'nav-mistgate', inDock: true },
  {
    id: 'chronicle',
    label: 'Chronicle',
    icon: 'nav-chronicle',
    unlock: 'chronicle',
    lockedHint: 'Opens at level 9',
    inDock: true,
  },
  {
    id: 'bazaar',
    label: 'Bazaar',
    icon: 'nav-bazaar',
    unlock: 'bazaar',
    lockedHint: 'Opens at level 5',
    inDock: true,
  },
  {
    id: 'quests',
    label: 'Quests',
    icon: 'nav-quests',
    unlock: 'quests',
    lockedHint: 'Opens at level 4',
    inDock: true,
  },
  {
    id: 'missions',
    label: 'Missions',
    icon: 'nav-missions',
    unlock: 'quests',
    lockedHint: 'Opens at level 4',
    inDock: true,
  },
  {
    id: 'events',
    label: 'Events',
    icon: 'nav-events',
    unlock: 'events',
    lockedHint: 'Opens at level 7',
    inDock: true,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: 'nav-calendar',
    unlock: 'loginCalendar',
    lockedHint: 'Opens at level 2',
    inDock: true,
  },
  // Reached from the top bar rather than the dock — mail is an errand, not a destination.
  // Settings is not here at all: it is a modal, so it can be opened over a fight as well
  // as over the Haven. It carried a registry row for nine phases that nothing navigated
  // to and `App` had no branch for, so reaching it would have shown the placeholder.
  { id: 'mail', label: 'Mail', icon: 'nav-mail', inDock: false },
  // A full-screen takeover reached from team select, never from the dock.
  { id: 'battle', label: 'Battle', icon: 'nav-battle', inDock: false },
];

export const DOCK_SCREENS = SCREENS.filter((screen) => screen.inDock);

export function isScreenUnlocked(screen: ScreenDefinition, unlocks: UnlockFlags | null): boolean {
  if (!screen.unlock) return true;
  return unlocks?.[screen.unlock] ?? false;
}
