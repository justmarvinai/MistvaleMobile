import type { ExpeditionDefInput } from '@mistvale/shared';

/**
 * Places to send champions who are not fighting today.
 *
 * Three, deliberately: a short one anybody can run, a long one that pays properly, and a
 * four-champion one that only a broad roster can staff well. Together they are the shape of
 * the decision — the eight-hour Reliquary is the *good* one, and running it costs you two
 * champions for a working day.
 *
 * **Favours are what make it a puzzle rather than a timer.** Each one met multiplies the
 * whole yield, and they are chosen to pull against each other: the party that meets the
 * most favours is rarely the party you would field, which is exactly the tension a
 * collection game wants between "who is good" and "who can I spare".
 *
 * The rewards lean on materials rather than silver, because silver has faucets everywhere
 * and the things this pays for — essences, dust, brews — are what a player actually runs
 * out of (docs/ECONOMY_BALANCE.md §4b).
 */
export const EXPEDITIONS: ExpeditionDefInput[] = [
  {
    key: 'exp_mist_patrol',
    name: 'The Mist Patrol',
    description:
      'A walk of the near boundary stones. Nothing out there tonight but fog and the sound of it — which is the point of walking it.',
    hours: 4,
    partySize: 1,
    unlockLevel: 11,
    sortOrder: 10,
    icon: 'nav-campaign',
    rewards: { silver: 22_000, xp_brew: 2, reliquary_dust: 40 },
    favours: [
      { kind: 'element', value: 'mist', bonusPct: 25 },
      { kind: 'role', value: 'support', bonusPct: 15 },
    ],
  },
  {
    key: 'exp_reliquary_dig',
    name: 'The Reliquary Dig',
    description:
      'Somebody buried a great deal of good iron under the old chapterhouse, and never came back for it. Two wardens and a working day should be enough.',
    hours: 8,
    partySize: 2,
    unlockLevel: 11,
    sortOrder: 20,
    icon: 'nav-relics',
    rewards: { silver: 60_000, reliquary_dust: 180, essence_pure: 3 },
    favours: [
      { kind: 'role', value: 'defense', bonusPct: 20 },
      { kind: 'rarity', value: 'epic', bonusPct: 20 },
      { kind: 'faction', value: 'ironhold', bonusPct: 20 },
    ],
  },
  {
    key: 'exp_long_survey',
    name: 'The Long Survey',
    description:
      'The whole eastern reach, mapped properly for the first time since the mist came. It takes four, it takes a day, and it wants people who have seen different things.',
    hours: 12,
    partySize: 4,
    unlockLevel: 14,
    sortOrder: 30,
    icon: 'nav-depths',
    rewards: { silver: 110_000, reliquary_dust: 320, essence_pure: 6, xp_brew: 8 },
    // Four favours across four different elements: a party of four *can* meet all of them,
    // but only an account that owns one of each — which is the whole argument for breadth.
    favours: [
      { kind: 'element', value: 'ember', bonusPct: 15 },
      { kind: 'element', value: 'tide', bonusPct: 15 },
      { kind: 'element', value: 'verdant', bonusPct: 15 },
      { kind: 'element', value: 'mist', bonusPct: 15 },
    ],
  },
];
