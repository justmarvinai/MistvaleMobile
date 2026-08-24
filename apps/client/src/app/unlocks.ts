import { UNLOCK_LEVELS, type UnlockFlags } from '@mistvale/shared';
import type { ScreenId } from './screens';

/**
 * What a level opened, and what to say about it.
 *
 * Features open on account level (GAME_DESIGN §12) and until now they simply *appeared* —
 * a dock tile that was shrouded on Tuesday was lit on Wednesday, with nothing to mark it.
 * That is the moment the whole gating structure exists to create, and letting it pass in
 * silence wastes it.
 *
 * Derived from the level rather than from watching the flags flip, and deliberately: a
 * flag diff cannot tell "just unlocked" from "unlocked before this tab was open", so the
 * first load of every session would celebrate everything the account had ever earned. A
 * level is a number that only goes up, and the last one celebrated is the only thing worth
 * remembering.
 */

export interface Unlock {
  key: keyof UnlockFlags;
  level: number;
  /** The screen it opens, when it opens one. */
  screen?: ScreenId;
  title: string;
  blurb: string;
}

/**
 * The copy, one entry per flag.
 *
 * Three levels hand over two things at once — 8, 9 and 14 — so a single level-up can open
 * more than one feature. The celebration queues them rather than picking a winner.
 */
const COPY: Readonly<Record<keyof UnlockFlags, Omit<Unlock, 'key' | 'level'>>> = Object.freeze({
  deepRun: {
    screen: 'deepRun',
    title: 'The Sunken Stair',
    blurb:
      'Twelve floors under the Vale, and your relics stay at the top of them. Four champions go down with nothing but their own levels, and what carries them is whatever the Stair offers on the way — one boon at a time, and every wound they take stays taken.',
  },
  worldBoss: {
    screen: 'worldBoss',
    title: 'The Wurm Wakes',
    blurb:
      'The thing you have been going down to alone comes up at the end of the week, and the whole Vale turns out for it. One health bar, everybody’s damage on it, and whatever you take off stays off — so what you manage on Friday is still gone when somebody else arrives on Sunday.',
  },
  trials: {
    screen: 'trials',
    title: 'Trials',
    blurb:
      'Four champions you have never owned, at a strength you have not reached, against something authored to be a puzzle rather than a wall. Nothing you have farmed counts here — everybody is handed the same fight, and the only question is how few turns you can finish it in.',
  },
  expeditions: {
    screen: 'expeditions',
    title: 'Expeditions',
    blurb:
      'There is work in the Vale that is not a fight, and champions who are not fighting today can do it. They are gone for hours and cannot be fielded while they are — which is the cost, and the reason a wide roster is worth having.',
  },
  loginCalendar: {
    screen: 'calendar',
    title: 'The Calendar',
    blurb:
      'A warden who shows up is owed something for it. Come back each day and take what the Vale has put aside — miss one and you lose the day, not your place.',
  },
  relicUpgrading: {
    screen: 'relics',
    title: 'The Forge',
    blurb:
      'Silver and a hot enough fire will wake a relic further. It does not always take; no smith in the Vale has ever managed better.',
  },
  quests: {
    screen: 'quests',
    title: 'The day’s work',
    blurb:
      'A list that refreshes every morning, and the Valewarden’s Path beside it — the long road, from here to the far end of the Reclamation.',
  },
  bazaar: {
    screen: 'bazaar',
    title: 'The Bazaar',
    blurb:
      'Somebody always sets up in a Haven. Her stock rotates on a schedule she will not explain, and silver you are holding is silver doing nothing.',
  },
  multiBattle: {
    title: 'Ten at a time',
    blurb:
      'You have walked that road enough times to stop watching. Send a team down it ten runs at once and read what came back.',
  },
  events: {
    screen: 'events',
    title: 'Events',
    blurb:
      'The Vale stirs on its own schedule. When it does there is a ladder to climb and a window to climb it in.',
  },
  arena: {
    screen: 'arena',
    title: 'The Arena',
    blurb:
      'Other wardens have left teams standing on the sand. Beat them and take their rating; leave one of your own and see how it holds.',
  },
  hallOfValor: {
    title: 'The Hall of Valor',
    blurb:
      'What the Arena pays, the Hall spends. Every level bought there is on every champion of that breath, in every fight, for good.',
  },
  chronicle: {
    screen: 'chronicle',
    title: 'The Chronicle',
    blurb:
      'Everything you have met, written down — champions, and the things on the roads that were not champions.',
  },
  springs: {
    screen: 'depths',
    title: 'The Essence Springs',
    blurb:
      'Under the vale, where the breaths run close to the surface. What comes out of them is what ascension costs.',
  },
  dungeons: {
    screen: 'depths',
    title: 'The relic keeps',
    blurb:
      'Four keeps the Sskarn moved into rather than built. Each is a farm for one set, and each floor is worse than the last.',
  },
  provingGrounds: {
    screen: 'depths',
    title: 'The Proving Grounds',
    blurb: 'No relics, no essence — only tomes, and something down there that reads your team.',
  },
  masteries: {
    screen: 'champions',
    title: 'Masteries',
    blurb:
      'Emblems buy a champion the things a champion cannot be taught. Two trees of three, and no undoing it cheaply.',
  },
  titan: {
    screen: 'titan',
    title: 'The Valewurm',
    blurb:
      'Something is coiled under the whole vale, and nobody expects to kill it. Two keys a day to go down and find out how much of it you can move — and then to come back with a better answer.',
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
