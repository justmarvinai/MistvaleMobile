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
  | 'settings'
  | 'battle';

export interface ScreenDefinition {
  id: ScreenId;
  label: string;
  /** Short glyph used until the game-icons sprite sheet is wired in. */
  glyph: string;
  /** Which unlock flag gates this screen; omitted means always available. */
  unlock?: keyof UnlockFlags;
  /** Shown on the locked-state tooltip. */
  lockedHint?: string;
  /** Screens present in the bottom dock, in order. */
  inDock: boolean;
}

export const SCREENS: readonly ScreenDefinition[] = [
  { id: 'haven', label: 'Haven', glyph: '⌂', inDock: true },
  { id: 'campaign', label: 'Campaign', glyph: '⚑', inDock: true },
  {
    id: 'depths',
    label: 'The Depths',
    glyph: '◈',
    unlock: 'springs',
    lockedHint: 'Opens at level 10',
    inDock: true,
  },
  {
    id: 'arena',
    label: 'Arena',
    glyph: '⚔',
    unlock: 'arena',
    lockedHint: 'Opens at level 8',
    inDock: true,
  },
  { id: 'champions', label: 'Champions', glyph: '☗', inDock: true },
  // Deliberately ungated: relics start dropping from the first campaign clear, and a
  // player who cannot see what they just earned has no idea the system exists. The
  // `relicUpgrading` unlock gates the *forge* inside this screen, which is what the flag
  // actually names (docs/GAME_DESIGN.md §12).
  { id: 'relics', label: 'Relics', glyph: '◆', inDock: true },
  { id: 'mistgate', label: 'Mistgate', glyph: '◉', inDock: true },
  {
    id: 'chronicle',
    label: 'Chronicle',
    glyph: '❋',
    unlock: 'chronicle',
    lockedHint: 'Opens at level 9',
    inDock: true,
  },
  {
    id: 'bazaar',
    label: 'Bazaar',
    glyph: '⚖',
    unlock: 'bazaar',
    lockedHint: 'Opens at level 5',
    inDock: true,
  },
  {
    id: 'quests',
    label: 'Quests',
    glyph: '✦',
    unlock: 'quests',
    lockedHint: 'Opens at level 4',
    inDock: true,
  },
  {
    id: 'missions',
    label: 'Missions',
    glyph: '⇗',
    unlock: 'quests',
    lockedHint: 'Opens at level 4',
    inDock: true,
  },
  {
    id: 'events',
    label: 'Events',
    glyph: '✧',
    unlock: 'events',
    lockedHint: 'Opens at level 7',
    inDock: true,
  },
  {
    id: 'calendar',
    label: 'Calendar',
    glyph: '☾',
    unlock: 'loginCalendar',
    lockedHint: 'Opens at level 2',
    inDock: true,
  },
  // Reached from the top bar, like Settings — mail is an errand, not a destination.
  { id: 'mail', label: 'Mail', glyph: '✉', inDock: false },
  { id: 'settings', label: 'Settings', glyph: '⚙', inDock: false },
  // A full-screen takeover reached from team select, never from the dock.
  { id: 'battle', label: 'Battle', glyph: '⚔', inDock: false },
];

export const DOCK_SCREENS = SCREENS.filter((screen) => screen.inDock);

export function isScreenUnlocked(screen: ScreenDefinition, unlocks: UnlockFlags | null): boolean {
  if (!screen.unlock) return true;
  return unlocks?.[screen.unlock] ?? false;
}
