import { GOAL_TYPES, type GoalType } from '@mistvale/shared';

/**
 * The mark a goal wears on a checklist.
 *
 * A quest, a mission step and an event milestone are all one goal with a counter on it, and
 * they are all drawn by the same ledger since the design rework — so what the *goal* is
 * about is the only thing left to tell them apart at a glance. "Win seven battles" and
 * "spend fifty energy" are two different afternoons, and a column of nineteen identical
 * scroll icons said neither.
 *
 * Chrome, not content: the goal DSL is the server's and this is only how each verb looks.
 * Exhaustive by construction — typed on `GoalType`, so a twenty-first goal type cannot ship
 * without somebody choosing its mark.
 */
const GOAL_GLYPH: Readonly<Record<GoalType, string>> = Object.freeze({
  battleWin: 'glyph-crossed-swords',
  stageClear: 'glyph-bow-and-arrow',
  bossKill: 'glyph-flaming-skull',
  useEnergy: 'glyph-hourglass',
  summon: 'glyph-spirit-vortex',
  gearUpgrade: 'glyph-hammer-hit',
  gearReforge: 'glyph-spell-casting',
  expeditionClaim: 'glyph-eagle-staff',
  trialsBeaten: 'glyph-broken-shackle',
  gearEquip: 'glyph-ribcage-armor',
  gearLevel: 'glyph-arcane-symbol',
  championLevelUp: 'glyph-magic-feather',
  championRankUp: 'glyph-shooting-stars',
  championAwaken: 'glyph-phoenix',
  championAscend: 'glyph-celestial-body',
  masteryLearn: 'glyph-spell-book',
  shopPurchase: 'glyph-burning-scroll',
  arenaBattle: 'glyph-sword-clash',
  arenaWin: 'glyph-trophy-cup',
  arenaTier: 'glyph-eagle-staff',
  chapterStars: 'glyph-shooting-stars',
  dungeonClear: 'glyph-skull-wreath',
  accountLevel: 'glyph-magic-staff',
  questClaim: 'glyph-holy-totem',
  claimAllDailies: 'glyph-peace-dove',
  championObtained: 'glyph-owl',
  titanRun: 'glyph-thorny-branch',
  titanDamage: 'glyph-stomp-impact',
});

/** The generic one, for a goal type content invented after this was written. */
const FALLBACK = 'glyph-burning-scroll';

/** The glyph for one goal type. */
export function goalGlyph(type: string | undefined): string {
  return (
    (type && (GOAL_TYPES as readonly string[]).includes(type)
      ? GOAL_GLYPH[type as GoalType]
      : undefined) ?? FALLBACK
  );
}
