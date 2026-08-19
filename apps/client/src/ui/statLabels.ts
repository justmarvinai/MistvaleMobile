import type { Stat } from '@mistvale/shared';

/**
 * What each stat is called on screen.
 *
 * One map, because a player reads the same eight stats on a relic card, in the stat table
 * and in a set bonus, and "C.RATE" in one place with "CRITRATE" in another reads as two
 * different stats. Stats are a closed set the server owns, so this is exhaustive by
 * construction and the compiler refuses a ninth that nobody has named.
 */
const STAT_LABEL: Readonly<Record<Stat, string>> = Object.freeze({
  hp: 'HP',
  atk: 'ATK',
  def: 'DEF',
  spd: 'SPD',
  critRate: 'C.RATE',
  critDmg: 'C.DMG',
  res: 'RES',
  acc: 'ACC',
});

/** The screen name for a stat. Falls back to shouting the key, for content we do not know. */
export function statLabel(stat: string): string {
  return STAT_LABEL[stat as Stat] ?? stat.toUpperCase();
}

/** The order the stats are always listed in — the order the source game trained players on. */
export const STAT_ORDER: readonly Stat[] = [
  'hp',
  'atk',
  'def',
  'spd',
  'critRate',
  'critDmg',
  'res',
  'acc',
];
