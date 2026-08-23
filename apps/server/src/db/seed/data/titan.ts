import type {
  DungeonDefInput,
  EnemyDefInput,
  SkillDefInput,
  StageDefInput,
} from '@mistvale/shared';

/**
 * The Valewurm — the game's one Solo Titan.
 *
 * Every other fight in Mistvale asks *can you beat this*. The Valewurm asks **how far can
 * you get**, and that is the whole design: a wall that does not move, a team that does, and
 * a number afterwards that says whether the last thing you changed helped. It is the source
 * game's Clan Boss with the clan taken out — the puzzle never needed a guild, only an
 * opponent nobody clears (docs/GAME_DESIGN.md §9.4).
 *
 * Three things make it a puzzle rather than a long dungeon floor:
 *
 *  - **A hit-counter shield.** Twelve hits between its turns or the whole team is thrown
 *    back down the turn order. That is the mechanic the mode is built around: it makes a
 *    multi-hit A1 worth more than a bigger one, which is a *team-building* answer rather
 *    than a gear answer, and it is why the same relics can produce very different runs.
 *  - **Turn-meter manipulation works.** Almighty immunity blocks the hard CC, as it does on
 *    every boss, but slowing it down and pushing its meter back is deliberately left open —
 *    it is the other half of the puzzle and the reason a support has a place on the team.
 *  - **It enrages.** From turn 30 it hits harder every turn, so a run has a natural end
 *    somewhere before the fiftieth: the cap is the ceiling, the enrage is what you actually
 *    hit. Sitting in a corner surviving does not out-score attacking.
 *
 * Its health is deliberately far above the top rung. Killing it is not the goal and not
 * expected at EA — the ladder is — but it is reachable in principle, which is what stops
 * the top rung from being the end of the mode.
 */

const TITAN_KEY = 'titan_valewurm';

export const TITAN_SKILLS: SkillDefInput[] = [
  {
    key: 'titan_a1_coil',
    name: 'Coil',
    description:
      'It shifts its weight, and something the size of a mill wheel comes down across the line.',
    slot: 'a1',
    cooldown: 0,
    targeting: { side: 'enemy', mode: 'single' },
    components: [
      { type: 'damage', scale: 'atk', mult: 2.9 },
      { type: 'applyStatus', status: 'def_down_60', turns: 2, chance: 0.75, target: 'hitTargets' },
    ],
    upgrades: [],
    aiHints: {},
    animation: { track: 'attack', vfx: 'coil', shake: true },
    sortOrder: 1,
  },
  {
    key: 'titan_a2_mistdraw',
    name: 'Mistdraw',
    description:
      'It breathes in, and the vale goes quiet — the whole line loses its footing and some of its will.',
    slot: 'a2',
    cooldown: 3,
    targeting: { side: 'enemy', mode: 'all' },
    components: [
      { type: 'damage', scale: 'atk', mult: 2.4 },
      { type: 'applyStatus', status: 'atk_down_50', turns: 2, chance: 0.6, target: 'hitTargets' },
    ],
    upgrades: [],
    aiHints: {},
    animation: { track: 'cast', vfx: 'mistdraw', shake: true },
    sortOrder: 2,
  },
  {
    key: 'titan_a3_rootsurge',
    name: 'Rootsurge',
    description:
      'The ground opens under all four of them at once, and whatever was mending them mends half as well.',
    slot: 'a3',
    cooldown: 4,
    targeting: { side: 'enemy', mode: 'all' },
    components: [
      { type: 'damage', scale: 'atk', mult: 2.1 },
      {
        type: 'applyStatus',
        status: 'heal_reduction_50',
        turns: 2,
        chance: 0.7,
        target: 'hitTargets',
      },
    ],
    upgrades: [],
    aiHints: {},
    animation: { track: 'cast', vfx: 'rootsurge', shake: true },
    sortOrder: 3,
  },
];

export const TITAN_ENEMIES: EnemyDefInput[] = [
  {
    key: 'titan_valewurm',
    name: 'The Valewurm',
    archetype: 'valewurm',
    element: 'verdant',
    role: 'hp',
    // Far above the top rung of the ladder on purpose: the mode is a damage race, and a
    // Titan that a good team kills is a Titan the mode is over for.
    baseStats: {
      hp: 600_000,
      atk: 1_150,
      def: 1_100,
      spd: 88,
      critRate: 20,
      critDmg: 70,
      res: 90,
      acc: 120,
    },
    growth: 1,
    skills: TITAN_SKILLS.map((skill) => skill.key),
    assetKey: 'enemy_lizard',
    isBoss: true,
    bossMechanics: {
      almightyImmunity: true,
      // Deliberately *not* immune: slowing it and pushing its meter back is half the puzzle,
      // and the reason a support earns a slot on a team built to hit things.
      tmReductionImmune: false,
      // The mechanic the mode is built around. Five hits between its turns is reachable
      // with a multi-hit A1 in the team and out of reach with four big single ones — a
      // team-building answer rather than a gear one.
      hitShield: { hits: 5, punishTmPct: 40 },
      enrage: { afterTurn: 30, dmgPctPerTurn: 5 },
    },
    sortOrder: 400,
  },
];

export const TITAN_DUNGEONS: DungeonDefInput[] = [
  {
    key: TITAN_KEY,
    name: 'The Valewurm',
    kind: 'titan',
    region: 'Under the vale',
    lore: 'The mist does not come off the marshes. It comes off something coiled under the whole vale, breathing slowly, and it has been doing that since before there was anybody here to name it. The Wardens do not expect to kill it. They go down to find out how much of it they can move.',
    tagline: 'It cannot be beaten. It can be measured — bring a team and find out how far it gets.',
    backgroundAsset: 'bg_veilwood',
    floors: 1,
    setKeys: [],
    itemKeys: ['emblem_bronze', 'emblem_silver', 'emblem_gold', 'waking_shard'],
    bossEnemyKey: 'titan_valewurm',
    openDays: [],
    unlockLevel: 16,
    titan: {
      // Fifty turns, with the enrage from turn thirty making the back half the dangerous
      // half. The ladder below is **measured rather than guessed** — `pnpm sim` fights the
      // Valewurm with a fresh, a middling and a fully-built team and gates four things
      // about the spread (see `titan-*` in tools/balance-sim).
      turnCap: 50,
      keysPerDay: 2,
      tiers: [
        {
          key: 'valewurm_t1',
          name: 'Splintered Hoard',
          damage: 8_000,
          rewards: { silver: 12_000, emblem_bronze: 2 },
        },
        {
          key: 'valewurm_t2',
          name: 'Mossbound Cache',
          damage: 25_000,
          rewards: { silver: 28_000, emblem_bronze: 4, xp_brew: 2 },
        },
        {
          key: 'valewurm_t3',
          name: 'Rootdeep Coffer',
          damage: 60_000,
          rewards: { silver: 55_000, emblem_silver: 2, essence_pure: 1 },
        },
        {
          key: 'valewurm_t4',
          name: 'Wyrmscale Vault',
          damage: 110_000,
          rewards: { silver: 95_000, emblem_silver: 4, essence_pure: 2, crystals: 25 },
        },
        {
          key: 'valewurm_t5',
          name: 'Heart of the Vale',
          damage: 175_000,
          rewards: { silver: 160_000, emblem_gold: 2, waking_shard: 2, crystals: 50 },
        },
        {
          key: 'valewurm_t6',
          name: 'Titanshard',
          damage: 250_000,
          rewards: {
            silver: 260_000,
            emblem_gold: 4,
            waking_shard: 4,
            sigil_mistwoven: 1,
            crystals: 100,
          },
        },
      ],
    },
    sortOrder: 90,
  },
];

export const TITAN_STAGES: StageDefInput[] = [
  {
    key: `${TITAN_KEY}_run`,
    mode: 'titan',
    parentKey: TITAN_KEY,
    number: 1,
    difficulty: 'normal',
    // Keys, not energy. The resource this mode limits is *attempts* — a Titan you could
    // farm with a big enough energy bar is not a puzzle, it is a grind with extra steps.
    energyCost: 0,
    waves: [[{ enemyKey: 'titan_valewurm', level: 60, stars: 6, slot: 1 }]],
    // Nothing here is paid on the clear. A Titan run is paid for the damage it did, by the
    // ladder on the keep, which is the one payout the stage rewards deliberately do not
    // describe (see `battle.settleTitan`).
    rewards: {
      silverMin: 0,
      silverMax: 0,
      playerXp: 0,
      championXp: 0,
      drops: {},
    },
    // Stars mean nothing against a Titan — the ladder is the score — but a stage carries
    // them, so they are set where they can never be earned rather than left to imply that
    // a fifty-turn run was a bad one.
    starRules: { noDeaths: true, maxTurns: 1 },
    firstClearRewards: {},
    unlock: { playerLevel: 16 },
    sortOrder: 1,
  },
];
