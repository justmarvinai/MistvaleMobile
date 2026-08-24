import type { DeepRunDefInput } from '@mistvale/shared';

/**
 * The Sunken Stair — Mistvale's Deep Run.
 *
 * Twelve floors under the Vale, and **your relics do not come with you**. Every other mode
 * in the game measures what an account has assembled; this one takes the assembly away and
 * asks a different question: what are these four champions worth on their own, and can you
 * build something out of what the stair happens to offer?
 *
 * Two rules do the work, and both are about cost rather than difficulty:
 *
 *  - **Damage carries between floors.** A fight won badly is still a wound, which is what
 *    makes a Quiet Landing a real choice against a reliquary — and what makes attrition,
 *    rather than any one room, the thing that actually ends a descent.
 *  - **A fallen champion stays fallen.** Nothing is lost outside the run, but inside it the
 *    party thins, and the last floors are fought with whatever is still standing.
 *
 * The boons are the third: every one of them is a bag of stat bonuses and **mastery
 * effects** — the same resolved-effect vocabulary the mastery trees already speak — which
 * is why the whole mode needed no engine work at all. Anything a mastery can do, a boon can
 * do, and `battle.ts` has never heard of a descent.
 *
 * Everything here is content. A second stair, a fortieth boon, a different depth ladder are
 * all Admin edits.
 */

const KEY = 'deeprun_sunken_stair';

/** A room's opposition, at a level the floor band can be read off. */
const foe = (enemyKey: string, level: number, stars: number, slot: number) => ({
  enemyKey,
  level,
  stars,
  slot,
});

export const DEEP_RUNS: DeepRunDefInput[] = [
  {
    key: KEY,
    name: 'The Sunken Stair',
    sortOrder: 1,
    tagline: 'Twelve floors down, and your relics stay at the top of them.',
    lore: 'Nobody built the Stair. It is what is left of a road the Vale used to have, folded over on itself by whatever moved underneath, and the Wardens go down it with nothing on but what they were born with. The rule is older than the Reclamation and nobody remembers who set it: the Stair takes the gift, and gives its own back one floor at a time.',
    backgroundAsset: 'bg_veilwood',
    unlockLevel: 20,
    runsPerDay: 2,
    floors: 12,
    forks: 3,

    rooms: [
      // ── The shallows (1–4) ───────────────────────────────────────────────
      {
        key: 'stair_r_brood',
        name: 'The Nesting Ledge',
        kind: 'fight',
        description: 'Sskarn broodlings, and more of them than there should be.',
        minFloor: 1,
        maxFloor: 5,
        waves: [
          [foe('sskarn_skirmisher', 30, 4, 0), foe('sskarn_skirmisher', 30, 4, 1)],
          [foe('sskarn_venomspitter', 32, 4, 0), foe('sskarn_spearguard', 32, 4, 1)],
        ],
        weight: 3,
      },
      {
        key: 'stair_r_spears',
        name: 'The Braced Landing',
        kind: 'fight',
        description: 'A shield wall on a step too narrow to go round.',
        minFloor: 1,
        maxFloor: 6,
        waves: [
          [
            foe('sskarn_spearguard', 32, 4, 0),
            foe('sskarn_spearguard', 32, 4, 1),
            foe('sskarn_warcaller', 30, 4, 2),
          ],
        ],
        weight: 3,
      },
      {
        key: 'stair_r_rest_low',
        name: 'A Quiet Landing',
        kind: 'rest',
        description: 'Dry stone and no sound from below. Sit down while it lasts.',
        minFloor: 1,
        maxFloor: 12,
        healPct: 35,
        boonsOffered: 0,
        weight: 2,
      },
      {
        key: 'stair_r_cache_low',
        name: 'A Cracked Reliquary',
        kind: 'cache',
        description: 'Somebody came down here before you and did not go back up.',
        minFloor: 1,
        maxFloor: 8,
        rewards: { silver: 24_000, emblem_bronze: 2 },
        boonsOffered: 0,
        weight: 1.5,
      },
      {
        key: 'stair_r_elite_brute',
        name: 'The Thing on the Turn',
        kind: 'elite',
        description: 'It has been waiting on the corner long enough to stop moving.',
        minFloor: 3,
        maxFloor: 7,
        waves: [[foe('boss_gorrakh_broodtyrant', 38, 5, 0), foe('sskarn_venomspitter', 34, 4, 1)]],
        boonsOffered: 3,
        weight: 1.2,
      },

      // ── The middle (5–9) ─────────────────────────────────────────────────
      {
        key: 'stair_r_hollow',
        name: 'The Hollow Run',
        kind: 'fight',
        description: 'Broodlings out of the Wyrm’s Hollow, a long way from it.',
        minFloor: 4,
        maxFloor: 10,
        waves: [
          [foe('hollow_broodling', 44, 5, 0), foe('hollow_broodling', 44, 5, 1)],
          [foe('hollow_wyrmguard', 46, 5, 0), foe('hollow_broodling', 44, 5, 1)],
        ],
        weight: 3,
      },
      {
        key: 'stair_r_frost',
        name: 'The Rimed Flight',
        kind: 'fight',
        description: 'The steps are white and the air off them stops the breath.',
        minFloor: 5,
        maxFloor: 11,
        waves: [
          [foe('frostgrave_sentry', 48, 5, 0), foe('frostgrave_rimeguard', 48, 5, 1)],
          [foe('frostgrave_rimeguard', 50, 6, 0), foe('frostgrave_sentry', 50, 6, 1)],
        ],
        weight: 2.5,
      },
      {
        key: 'stair_r_cache_mid',
        name: 'The Deep Reliquary',
        kind: 'cache',
        description: 'Sealed, and the seal is on the inside.',
        minFloor: 6,
        maxFloor: 12,
        rewards: { silver: 60_000, emblem_silver: 2, essence_pure: 1 },
        boonsOffered: 0,
        weight: 1.2,
      },
      {
        key: 'stair_r_elite_keeper',
        name: 'The Broodwyrm’s Get',
        kind: 'elite',
        description: 'Smaller than its mother. Not by much.',
        minFloor: 6,
        maxFloor: 11,
        waves: [[foe('boss_broodwyrm', 52, 6, 1)]],
        boonsOffered: 3,
        weight: 1.2,
      },

      // ── The deep (9–12) ──────────────────────────────────────────────────
      {
        key: 'stair_r_deep',
        name: 'The Last Flights',
        kind: 'fight',
        description: 'Whatever is down here has never been up.',
        minFloor: 8,
        maxFloor: 12,
        waves: [
          [foe('hollow_wyrmguard', 55, 6, 0), foe('frostgrave_rimeguard', 55, 6, 1)],
          [
            foe('boss_broodwyrm', 56, 6, 0),
            foe('hollow_broodling', 54, 6, 1),
            foe('hollow_broodling', 54, 6, 2),
          ],
        ],
        weight: 2.5,
      },
      {
        key: 'stair_r_bottom',
        name: 'The Bottom Step',
        kind: 'elite',
        description: 'There is no twelfth landing. There is this.',
        minFloor: 10,
        maxFloor: 12,
        waves: [[foe('titan_valewurm', 40, 6, 1)]],
        boonsOffered: 3,
        weight: 1.6,
      },
    ],

    boons: [
      // Commons: the filler that keeps a run moving.
      {
        key: 'boon_stoneblood',
        name: 'Stoneblood',
        description: 'The Stair’s own patience. +2,500 health to everyone still standing.',
        rarity: 'common',
        bonuses: { hp: 2_500 },
        stacks: true,
      },
      {
        key: 'boon_whetstone',
        name: 'The Old Whetstone',
        description: 'Somebody left it on a step. +180 attack.',
        rarity: 'common',
        bonuses: { atk: 180 },
        stacks: true,
      },
      {
        key: 'boon_braced',
        name: 'Braced',
        description: 'Shoulders to the wall. +180 defence.',
        rarity: 'common',
        bonuses: { def: 180 },
        stacks: true,
      },
      {
        key: 'boon_quickstep',
        name: 'Quickstep',
        description: 'The steps are shallower than they look. +8 speed.',
        rarity: 'common',
        bonuses: { spd: 8 },
        stacks: true,
      },

      // Uncommons: a stat with a shape to it.
      {
        key: 'boon_keen_edge',
        name: 'Keen Edge',
        description: '+10 critical rate and +15 critical damage.',
        rarity: 'uncommon',
        bonuses: { critRate: 10, critDmg: 15 },
      },
      {
        key: 'boon_sure_hand',
        name: 'The Sure Hand',
        description: '+40 accuracy. Debuffs stop sliding off things down here.',
        rarity: 'uncommon',
        bonuses: { acc: 40 },
      },
      {
        key: 'boon_deaf_to_it',
        name: 'Deaf to It',
        description: '+40 resistance. Whatever the Stair is saying, you stop hearing it.',
        rarity: 'uncommon',
        bonuses: { res: 40 },
      },
      {
        key: 'boon_second_wind',
        name: 'Second Wind',
        description: 'Everyone opens each fight behind a shield worth a tenth of their health.',
        rarity: 'uncommon',
        effects: [{ type: 'battleStartShield', pctMaxHp: 10, turns: 2 }],
      },

      // Rares: the ones that start to shape a run.
      {
        key: 'boon_bloodwake',
        name: 'Bloodwake',
        description: 'Every blow gives back a tenth of what it takes.',
        rarity: 'rare',
        effects: [{ type: 'lifesteal', pct: 10 }],
        stacks: true,
      },
      {
        key: 'boon_hardened',
        name: 'Hardened',
        description: 'Everything hits eight per cent softer.',
        rarity: 'rare',
        effects: [{ type: 'damageTaken', pct: -8 }],
        stacks: true,
      },
      {
        key: 'boon_the_long_swing',
        name: 'The Long Swing',
        description: 'Everything you do lands ten per cent harder.',
        rarity: 'rare',
        effects: [{ type: 'damageDealt', pct: 10 }],
        stacks: true,
      },
      {
        key: 'boon_grave_appetite',
        name: 'Grave Appetite',
        description: 'A kill leaves the killer faster — up to three times over.',
        rarity: 'rare',
        effects: [{ type: 'onKill', stat: 'spd', flat: 8, maxStacks: 3 }],
        minFloor: 3,
      },

      // Epics: run-defining, and rare enough to be a moment.
      {
        key: 'boon_stair_wardens_oath',
        name: 'The Stairwarden’s Oath',
        description: 'The first blow that would kill you does not. Once each, once a fight.',
        rarity: 'epic',
        effects: [{ type: 'lastStand' }],
        minFloor: 4,
      },
      {
        key: 'boon_tide_of_hours',
        name: 'Tide of Hours',
        description:
          'When somebody falls, the rest of the line moves a third of the way to its next turn.',
        rarity: 'epic',
        effects: [
          { type: 'turnMeterProc', trigger: 'allyDied', chance: 1, pct: 33, target: 'team' },
        ],
        minFloor: 5,
      },
      {
        key: 'boon_mending_dark',
        name: 'The Mending Dark',
        description: 'Everything that heals you heals you a third again.',
        rarity: 'epic',
        effects: [{ type: 'healing', mode: 'received', pct: 33 }],
        minFloor: 4,
      },

      // Legendaries: one of these is the story of the run.
      {
        key: 'boon_the_stair_remembers',
        name: 'The Stair Remembers',
        description:
          'Twenty per cent off everything that hits you, and twenty per cent onto everything you throw.',
        rarity: 'legendary',
        effects: [
          { type: 'damageTaken', pct: -20 },
          { type: 'damageDealt', pct: 20 },
        ],
        minFloor: 6,
      },
      {
        key: 'boon_nothing_left_to_take',
        name: 'Nothing Left to Take',
        description:
          'You came down with nothing, so it has nothing to take: +6,000 health and a quarter of all damage dealt comes back.',
        rarity: 'legendary',
        bonuses: { hp: 6_000 },
        effects: [{ type: 'lifesteal', pct: 25 }],
        minFloor: 7,
      },
    ],

    depthTiers: [
      {
        key: 'stair_d3',
        name: 'The Third Landing',
        floor: 3,
        rewards: { silver: 30_000, emblem_bronze: 3 },
      },
      {
        key: 'stair_d6',
        name: 'Halfway Down',
        floor: 6,
        rewards: { silver: 80_000, emblem_silver: 3, xp_brew: 3, crystals: 30 },
      },
      {
        key: 'stair_d9',
        name: 'Below the Roots',
        floor: 9,
        rewards: { silver: 170_000, emblem_gold: 2, waking_shard: 2, crystals: 70 },
      },
      {
        key: 'stair_d12',
        name: 'The Bottom Step',
        floor: 12,
        rewards: {
          silver: 320_000,
          emblem_gold: 4,
          waking_shard: 4,
          sigil_mistwoven: 1,
          crystals: 140,
        },
      },
    ],
  },
];
