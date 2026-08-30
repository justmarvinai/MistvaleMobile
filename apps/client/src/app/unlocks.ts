import { UNLOCK_LEVELS, type UnlockFlags } from '@mistvale/shared';
import type { ScreenId } from './screens';

/**
 * What a level opened, and what to call it.
 *
 * Features open on account level (GAME_DESIGN §12), and a dock tile that was shrouded on
 * Tuesday is simply lit on Wednesday — so something has to name the moment or the whole
 * gating structure passes unremarked. Since C25 that something is a banner rather than a
 * card with buttons on it (`UnlockBanner`), which is why there is a title here and no
 * paragraph: the game says what opened, and the place itself says what it is for.
 *
 * Derived from the level rather than from watching the flags flip, and deliberately: a
 * flag diff cannot tell "just unlocked" from "unlocked before this tab was open", so the
 * first load of every session would announce everything the account had ever earned. A
 * level is a number that only goes up, and the last one announced is the only thing worth
 * remembering.
 */

export interface Unlock {
  key: keyof UnlockFlags;
  level: number;
  /** The screen it opens, when it opens one — and whose glyph the banner wears. */
  screen?: ScreenId;
  /**
   * The banner's badge, when there is no destination to take one from.
   *
   * Two unlocks need it, and they are the reason the field exists: multi-battle opens no
   * screen at all — it is a *capability* on the campaign's team chooser — and the Hall of
   * Valor lives behind the Arena's own title bar rather than in the dock. Everything else
   * takes its badge from the place it opens, which is what keeps the banner and the hub
   * card wearing the same picture without anybody authoring it twice.
   */
  art?: string;
  title: string;
}

/**
 * The copy, one entry per flag.
 *
 * Three levels hand over two things at once — 8, 9 and 14 — so a single level-up can open
 * more than one feature. They queue and play one after another rather than one winning.
 */
const COPY: Readonly<Record<keyof UnlockFlags, Omit<Unlock, 'key' | 'level'>>> = Object.freeze({
  spire: {
    screen: 'spire',
    title: 'The Mistspire',
  },
  deepRun: {
    screen: 'deepRun',
    title: 'The Sunken Stair',
  },
  wardens: {
    screen: 'wardens',
    title: 'Wardens',
  },
  valePass: {
    screen: 'valePass',
    title: 'The Vale Pass',
  },
  worldBoss: {
    screen: 'worldBoss',
    title: 'The Wurm Wakes',
  },
  trials: {
    screen: 'trials',
    title: 'Trials',
  },
  expeditions: {
    screen: 'expeditions',
    title: 'Expeditions',
  },
  loginCalendar: {
    screen: 'calendar',
    title: 'The Calendar',
  },
  relicUpgrading: {
    screen: 'relics',
    title: 'The Forge',
  },
  quests: {
    screen: 'quests',
    title: 'The day’s work',
  },
  bazaar: {
    screen: 'bazaar',
    title: 'The Bazaar',
  },
  multiBattle: {
    // No screen: the stepper appears on the campaign's own team chooser.
    art: 'crest-warmark',
    title: 'Ten at a time',
  },
  events: {
    screen: 'events',
    title: 'Events',
  },
  arena: {
    screen: 'arena',
    title: 'The Arena',
  },
  hallOfValor: {
    // No screen: the Hall is behind the Arena's own title bar rather than the dock.
    art: 'crest-gilded-crown',
    title: 'The Hall of Valor',
  },
  chronicle: {
    screen: 'chronicle',
    title: 'The Chronicle',
  },
  springs: {
    screen: 'depths',
    title: 'The Essence Springs',
  },
  dungeons: {
    screen: 'depths',
    title: 'The relic keeps',
  },
  provingGrounds: {
    screen: 'depths',
    title: 'The Proving Grounds',
  },
  masteries: {
    screen: 'champions',
    title: 'Masteries',
  },
  titan: {
    screen: 'titan',
    title: 'The Valewurm',
  },
});

/** Every unlock, in the order the game hands them over. */
export const UNLOCKS: readonly Unlock[] = Object.freeze(
  (Object.keys(COPY) as (keyof UnlockFlags)[])
    .map((key) => ({ key, level: UNLOCK_LEVELS[key], ...COPY[key] }))
    .sort((a, b) => a.level - b.level || a.title.localeCompare(b.title)),
);

/**
 * What opened between two levels.
 *
 * A range rather than a single step, because a level-up can arrive several at a time — a
 * mission chain paying a hundred thousand XP moves an account four levels, and every gate
 * it crossed on the way is one the player has earned and would otherwise never be told
 * about. Empty when the level did not move, and empty when it went *down*, which only an
 * operator's reset can do and is not a moment for fanfare.
 */
export function unlockedBetween(previousLevel: number, level: number): Unlock[] {
  if (level <= previousLevel) return [];
  return UNLOCKS.filter((unlock) => unlock.level > previousLevel && unlock.level <= level);
}
