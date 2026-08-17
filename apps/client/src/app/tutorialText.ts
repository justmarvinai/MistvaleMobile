import type { ScreenId } from './screens';

/**
 * The overlay's words, kept away from its markup.
 *
 * Split out so it can be tested without a DOM — and because "what this goal is asking for,
 * in a player's words" is a lookup table that will grow every time a goal type is added,
 * and a lookup table buried in a component is a lookup table nobody finds.
 */

/**
 * What a goal is asking for, phrased for a player.
 *
 * Deliberately a lookup rather than a sentence assembled from the goal: the Wardenmaster's
 * body text above has already said what to do in his own voice, and this is the one-line
 * reminder underneath it.
 */
export function goalLabel(type: string): string {
  return GOAL_LABELS[type] ?? 'Finish the step';
}

const GOAL_LABELS: Readonly<Record<string, string>> = Object.freeze({
  stageClear: 'Clear the stage',
  battleWin: 'Win a battle',
  bossKill: 'Put down a warlord',
  useEnergy: 'Spend energy',
  summon: 'Call at the Mistgate',
  gearEquip: 'Wear a relic',
  gearLevel: 'Upgrade a relic',
  gearUpgrade: 'Work the forge',
  championLevelUp: 'Level a champion',
  championRankUp: 'Rank a champion up',
  championAscend: 'Ascend a champion',
  championObtained: 'Take a champion',
  masteryLearn: 'Learn a mastery',
  shopPurchase: 'Buy something',
  arenaBattle: 'Fight in the Arena',
  arenaWin: 'Win in the Arena',
  dungeonClear: 'Clear a floor',
  questClaim: 'Claim a quest',
  claimAllDailies: 'Finish the day',
  accountLevel: 'Reach the level',
  chapterStars: 'Earn the stars',
  arenaTier: 'Climb the ladder',
});

/**
 * The Continue button's label while a step is still waiting on the player.
 *
 * Two different states worth different words: standing on the right screen with the thing
 * undone is "not yet", and standing somewhere else is a nudge back.
 */
export function waitingLabel(wanted: ScreenId, here: ScreenId): string {
  return wanted === here ? 'Not yet' : 'Go and do it';
}
