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
  | 'battleHub'
  | 'championsHub'
  | 'errandsHub'
  | 'campaign'
  | 'depths'
  | 'arena'
  | 'titan'
  | 'worldBoss'
  | 'deepRun'
  | 'spire'
  | 'trials'
  | 'expeditions'
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

/**
 * The three rooms that hold other rooms.
 *
 * Mistvale grew to nineteen destinations and put every one of them in the dock, which is
 * how a game ends up with a navigation bar nobody reads. A hub is the source game's answer:
 * one press opens a page of big painted cards, each naming a place and what it is *for*.
 *
 * Grouping is by **what a player is there to do** rather than by when it shipped — every
 * fight is behind Battle whether it is a campaign stage or a world boss, and every
 * claimable list is behind Errands whether it renews daily or monthly.
 */
export type HubId = 'battleHub' | 'championsHub' | 'errandsHub';

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
  /**
   * One line about what a player goes here *for*.
   *
   * Chrome rather than content: a screen's name and its place in the dock are decided in
   * this file, so its one-line description belongs beside them. The Haven's tooltips are
   * what it is for — nine painted icons and nine words could say *where* the game's places
   * are and never what any of them does.
   */
  blurb?: string;
  /** Which unlock flag gates this screen; omitted means always available. */
  unlock?: keyof UnlockFlags;
  /** Shown on the locked-state tooltip. */
  lockedHint?: string;
  /** Screens present in the bottom dock, in order. */
  inDock: boolean;
  /**
   * How wide this screen's content may get before it stops growing and centres (C12).
   *
   * The ceiling lives on the *shell* rather than inside each screen, so a screen added next
   * year is composed on a desktop without remembering to be — the same reasoning that put
   * the frame's padding there in B1. What a screen chooses is only which of three it wants:
   *
   *  - omitted — the everyday page, three comfortable cards across.
   *  - `wide` — a screen that wants the pixels: the vault's grid, the roster, the shelves.
   *  - `full` — a *scene* rather than a column. The vale and the battlefield are pictures,
   *    and a picture that centres inside a rule is a picture with letterboxing.
   */
  width?: 'wide' | 'full';
  /**
   * The hub this screen is reached through, when it is not in the dock itself.
   *
   * A screen with a group is drawn as a card on that hub's page and is *not* in the dock —
   * the two are alternatives rather than a belt and braces, because a destination reachable
   * two ways is one a player has to be told about twice.
   */
  group?: HubId;
}

export const SCREENS: readonly ScreenDefinition[] = [
  {
    id: 'haven',
    label: 'Haven',
    icon: 'nav-haven',
    glyph: 'glyph-holy-totem',
    art: 'crest-stone-guard',
    blurb: 'The camp, and the way to everywhere else.',
    inDock: true,
  },
  {
    id: 'battleHub',
    label: 'Battle',
    icon: 'nav-battle',
    glyph: 'glyph-sword-clash',
    art: 'weapon-broadsword',
    blurb:
      'Everywhere there is something to fight — the road, the deep places, the tower and the ladder.',
    inDock: true,
  },
  {
    id: 'championsHub',
    label: 'Champions',
    icon: 'nav-champions',
    glyph: 'glyph-cloaked-figure',
    art: 'hero-vanguard',
    blurb: 'Who you have, what they are wearing, and who is still out there.',
    inDock: true,
  },
  {
    id: 'errandsHub',
    label: 'Errands',
    icon: 'nav-quests',
    glyph: 'glyph-burning-scroll',
    art: 'crest-sacred-anchor',
    blurb: 'Everything with something waiting to be collected.',
    inDock: true,
  },
  {
    id: 'campaign',
    width: 'full',
    label: 'Campaign',
    icon: 'nav-campaign',
    glyph: 'glyph-crossed-swords',
    art: 'crest-warmark',
    blurb: 'Twelve chapters and the warlords holding them. Where relics and silver come from.',
    inDock: false,
    group: 'battleHub',
  },
  {
    id: 'depths',
    width: 'wide',
    label: 'The Depths',
    icon: 'nav-depths',
    glyph: 'glyph-skull-wreath',
    art: 'blood-crimson-gate',
    blurb:
      'Four relic keeps, the Proving Grounds and five rotating springs — the deep sources of gear and ascension stones.',
    unlock: 'springs',
    lockedHint: 'Opens at level 10',
    inDock: false,
    group: 'battleHub',
  },
  {
    id: 'arena',
    label: 'Arena',
    icon: 'nav-arena',
    glyph: 'glyph-trophy-cup',
    art: 'crest-gilded-crown',
    blurb:
      'Four against four, against other wardens’ standing defences. Pays valor medals and a chest each week.',
    unlock: 'arena',
    lockedHint: 'Opens at level 8',
    inDock: false,
    group: 'battleHub',
  },
  {
    id: 'titan',
    label: 'The Valewurm',
    icon: 'nav-titan',
    glyph: 'glyph-thorny-branch',
    art: 'blood-serpent-coil',
    blurb:
      'One enormous thing, two keys a day, and a ladder of chests for how much of it you moved. The fight worth optimising rather than clearing.',
    unlock: 'titan',
    lockedHint: 'Opens at level 16',
    inDock: false,
    group: 'battleHub',
  },
  {
    id: 'worldBoss',
    label: 'The Wurm Wakes',
    icon: 'nav-worldboss',
    glyph: 'glyph-cursed-eye',
    art: 'blood-cursed-beast',
    blurb:
      'It comes up at the end of the week and the whole Vale turns out. One health bar, everybody’s damage on it, and a chest for everyone who helped if the Vale actually gets through it.',
    unlock: 'worldBoss',
    lockedHint: 'Opens at level 18',
    inDock: false,
    group: 'battleHub',
  },
  {
    id: 'deepRun',
    label: 'The Sunken Stair',
    icon: 'nav-deeprun',
    glyph: 'glyph-broken-shackle',
    art: 'hero-voidguard',
    blurb:
      'Twelve floors down, and your relics stay at the top of them. Four champions, one boon at a time, and every wound they take stays taken.',
    unlock: 'deepRun',
    lockedHint: 'Opens at level 20',
    inDock: false,
    group: 'battleHub',
  },
  {
    id: 'spire',
    label: 'The Mistspire',
    icon: 'nav-spire',
    glyph: 'glyph-rockets',
    art: 'icon-rune-stone',
    blurb:
      'Thirty floors, and no two of them want the same team. Some are warded — only champions of one element, one faction or one role may climb — so the tower is the one place a broad roster beats a deep one.',
    unlock: 'spire',
    lockedHint: 'Opens at level 16',
    inDock: false,
    group: 'battleHub',
  },
  {
    id: 'trials',
    label: 'Trials',
    icon: 'nav-trials',
    glyph: 'glyph-arcane-symbol',
    art: 'icon-rune-stone',
    blurb:
      'Four champions you do not own, against an enemy nobody else gets a different version of. The only thing being measured here is how you play it.',
    unlock: 'trials',
    lockedHint: 'Opens at level 9',
    inDock: false,
    group: 'battleHub',
  },
  {
    id: 'expeditions',
    label: 'Expeditions',
    icon: 'nav-missions',
    glyph: 'glyph-eagle-staff',
    art: 'crest-gilded-crown',
    blurb:
      'Send champions somewhere that is not a fight. They are gone for hours and cannot be fielded while they are — which is what makes a wide roster worth having.',
    unlock: 'expeditions',
    lockedHint: 'Opens at level 11',
    inDock: false,
    group: 'errandsHub',
  },
  {
    id: 'champions',
    width: 'wide',
    label: 'Roster',
    icon: 'nav-champions',
    glyph: 'glyph-cloaked-figure',
    art: 'hero-vanguard',
    blurb: 'Everyone you have. Level them, rank them, ascend them, and fit their relics.',
    inDock: false,
    group: 'championsHub',
  },
  // Deliberately ungated: relics start dropping from the first campaign clear, and a
  // player who cannot see what they just earned has no idea the system exists. The
  // `relicUpgrading` unlock gates the *forge* inside this screen, which is what the flag
  // actually names (docs/GAME_DESIGN.md §12).
  {
    id: 'relics',
    width: 'wide',
    label: 'Relics',
    icon: 'nav-relics',
    glyph: 'glyph-ribcage-armor',
    art: 'crest-warded-shield',
    blurb: 'The vault. Compare, forge, lock and sell what dropped.',
    inDock: false,
    group: 'championsHub',
  },
  {
    id: 'mistgate',
    label: 'Mistgate',
    icon: 'nav-mistgate',
    glyph: 'glyph-spirit-vortex',
    art: 'orb-voidspiral',
    blurb: 'Spend sigils, call champions out of the mist.',
    inDock: true,
  },
  {
    id: 'chronicle',
    width: 'wide',
    label: 'Chronicle',
    icon: 'nav-chronicle',
    glyph: 'glyph-spell-book',
    art: 'icon-astrolabe',
    blurb: 'Every champion in the game, and which of them you have met.',
    unlock: 'chronicle',
    lockedHint: 'Opens at level 9',
    inDock: false,
    group: 'championsHub',
  },
  {
    id: 'bazaar',
    label: 'Bazaar',
    icon: 'nav-bazaar',
    glyph: 'glyph-health-potion',
    art: 'rune-jade-coin',
    blurb: 'Rotating stock, refreshed on the clock and refreshable for crystals.',
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
    blurb: 'The day’s and the week’s errands, and the chest for finishing them.',
    unlock: 'quests',
    lockedHint: 'Opens at level 4',
    inDock: false,
    group: 'errandsHub',
  },
  {
    id: 'missions',
    label: 'Missions',
    icon: 'nav-missions',
    glyph: 'glyph-eagle-staff',
    art: 'crest-ember-shield',
    blurb: 'The Valewarden’s Path — eighty steps, ending in a champion nothing else gives.',
    unlock: 'quests',
    lockedHint: 'Opens at level 4',
    inDock: false,
    group: 'errandsHub',
  },
  {
    id: 'events',
    label: 'Events',
    icon: 'nav-events',
    glyph: 'glyph-shooting-stars',
    art: 'rune-nova-star',
    blurb: 'Timed ladders. Score points at what the event asks for, collect at each rung.',
    unlock: 'events',
    lockedHint: 'Opens at level 7',
    inDock: false,
    group: 'errandsHub',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    icon: 'nav-calendar',
    glyph: 'glyph-hourglass',
    art: 'rune-starfall',
    blurb: 'A reward for every day you keep the lantern lit.',
    unlock: 'loginCalendar',
    lockedHint: 'Opens at level 2',
    inDock: false,
    group: 'errandsHub',
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
    blurb: 'What was sent to you, and anything attached to it.',
    inDock: false,
  },
  // A full-screen takeover reached from team select, never from the dock.
  {
    id: 'battle',
    width: 'full',
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

/** Whether a screen is one of the three hubs. */
export function isHub(id: ScreenId): id is HubId {
  return id === 'battleHub' || id === 'championsHub' || id === 'errandsHub';
}

/**
 * What a hub holds, in the order it is drawn.
 *
 * Derived from the registry rather than listed a second time: a screen names the hub it
 * belongs to and that is the only place the grouping is written, so adding a mode is still
 * one registry entry and cannot land in the dock and a hub at once.
 *
 * Order is the registry's own, which is roughly the order things unlock — so a hub reads
 * top-left to bottom-right as "what you have, then what is coming".
 */
export function screensInHub(hub: HubId): ScreenDefinition[] {
  return SCREENS.filter((screen) => screen.group === hub);
}

/** The hub a screen is reached through, or null for a dock entry or a takeover. */
export function hubFor(id: ScreenId): HubId | null {
  return SCREENS.find((screen) => screen.id === id)?.group ?? null;
}

/**
 * Which dock slot should read as *current* for a given screen.
 *
 * A player standing in the Depths is inside the Battle hub, and a dock that lit nothing
 * while they were there would look broken. So the hub owns the highlight for everything
 * underneath it, and a screen with no hub speaks for itself.
 */
export function dockSlotFor(id: ScreenId): ScreenId {
  return hubFor(id) ?? id;
}
