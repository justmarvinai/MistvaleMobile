import type { SummonPoolDefInput } from '@mistvale/shared';
import { EXTENDED_CHAMPIONS } from './extended-champions';
import { SHOWCASE_CHAMPIONS } from './showcase-champions';

/**
 * The four sigils (GAME_DESIGN §10).
 *
 * Rates and mercy live on the pool rather than in `game_config`, because they are
 * per-pool: Radiant's mercy is not Gleaming's, and a summon event that doubles Epic
 * weight for one banner must not touch the other three.
 *
 * Entries are generated from the roster rather than listed by hand. That is not laziness
 * — it is the property that matters: adding a champion in Admin puts it in the pools it
 * belongs to without anyone remembering to, and a champion flagged `summonable: false`
 * stays out of all of them by construction.
 */

const ROSTER = [...SHOWCASE_CHAMPIONS, ...EXTENDED_CHAMPIONS];

interface PoolFilter {
  rarities: readonly string[];
  /** Restrict to one element, for the Mistwoven pool. */
  element?: string;
  /** Food units are only summonable from the Faded sigil. */
  includeFood: boolean;
}

/**
 * Champions matching a filter, at equal weight within their rarity.
 *
 * Equal weights are the honest default: a rate-up is a deliberate act an operator
 * performs in Admin, not something that quietly exists because a seed author typed a
 * bigger number.
 */
function entriesFor(filter: PoolFilter): SummonPoolDefInput['entries'] {
  return ROSTER.filter((champion) => {
    if (champion.summonable === false) return false;
    if (!filter.rarities.includes(champion.rarity)) return false;
    if (filter.element && champion.element !== filter.element) return false;
    if (!filter.includeFood && champion.isFood) return false;
    if (filter.includeFood === false && champion.isFood) return false;
    return true;
  }).map((champion) => ({ championKey: champion.key, weight: 10, featured: false }));
}

export const SUMMON_POOLS: SummonPoolDefInput[] = [
  {
    key: 'faded',
    name: 'Faded Sigil',
    description:
      'A worn anchor. It calls the least of what the mist holds — brood-kin, mostly, and the occasional soul worth keeping.',
    sigilKey: 'sigil_faded',
    // The fodder sigil: what a player spends daily and rarely regrets.
    rates: { common: 0.74, uncommon: 0.2, rare: 0.06 },
    pity: { rare: { after: 30, step: 0.03, maxBonus: 1 } },
    entries: entriesFor({ rarities: ['common', 'uncommon', 'rare'], includeFood: true }),
    sortOrder: 10,
  },
  {
    key: 'gleaming',
    name: 'Gleaming Sigil',
    description: 'Still bright. The mist answers it properly, and sometimes generously.',
    sigilKey: 'sigil_gleaming',
    rates: { rare: 0.915, epic: 0.08, legendary: 0.005 },
    // Source-faithful mercy: an Epic is certain by pull 66, a Legendary by pull 220.
    pity: {
      epic: { after: 20, step: 0.02, maxBonus: 1 },
      legendary: { after: 200, step: 0.05, maxBonus: 1 },
    },
    entries: entriesFor({ rarities: ['rare', 'epic', 'legendary'], includeFood: false }),
    tenPullFloor: 'rare',
    sortOrder: 20,
  },
  {
    key: 'mistwoven',
    name: 'Mistwoven Sigil',
    description: 'Woven from the fog itself. It calls only its own, and they answer readily.',
    sigilKey: 'sigil_mistwoven',
    rates: { rare: 0.915, epic: 0.08, legendary: 0.005 },
    pity: {
      epic: { after: 20, step: 0.02, maxBonus: 1 },
      legendary: { after: 200, step: 0.05, maxBonus: 1 },
    },
    entries: entriesFor({
      rarities: ['rare', 'epic', 'legendary'],
      element: 'mist',
      includeFood: false,
    }),
    tenPullFloor: 'rare',
    sortOrder: 30,
  },
  {
    key: 'radiant',
    name: 'Radiant Sigil',
    description: 'It does not so much call as demand. Nothing small comes through it.',
    sigilKey: 'sigil_radiant',
    rates: { epic: 0.94, legendary: 0.06 },
    // A short, sharp mercy: the sigil is rare enough that a long drought would be cruel.
    pity: { legendary: { after: 12, step: 0.02, maxBonus: 1 } },
    entries: entriesFor({ rarities: ['epic', 'legendary'], includeFood: false }),
    tenPullFloor: 'epic',
    sortOrder: 40,
  },
];
