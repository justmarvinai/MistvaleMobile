import type { Goal, MissionDef } from '@mistvale/shared';

/**
 * The Valewarden's Path — eighty steps from the first battle to the Coilmother's court.
 *
 * The chain is a *teacher*, and that is the whole design brief (GAME_DESIGN §9). Each arc
 * introduces one system and then asks the player to use it properly: arc 2 makes them
 * equip a relic before it asks them to upgrade one, arc 4 sends them into the Depths only
 * after the campaign has given them a team that survives there. A player who follows the
 * Path never meets a wall they have no tool for, and never has to be told in a tooltip
 * what a fight would have taught them.
 *
 * **Arcs open in order; the eight inside one are open at once.** Strictly sequential would
 * be a wall the day somebody cannot do step 43 — an entirely open list would not be a path.
 *
 * Rewards ramp the way ECONOMY §11 sizes them: silver and energy early, where a new
 * account is poor in both; sigils, tomes and emblems through the middle, where progress is
 * gated on materials rather than on time; and the finale hands over **Aureleth, Voice of
 * the Vale** — an exclusive Legendary the Mistgate will never roll — plus the title
 * "Warden of the Reclamation".
 *
 * Every goal here is validated against the goal registry at publish time, and every goal
 * type used is one some module actually reports (`content/goals.ts`, and the reachability
 * test in `meta/quests.test.ts`).
 */

const goal = (type: Goal['type'], target: number, filters: Goal['filters'] = {}): Goal => ({
  type,
  target,
  filters,
});

interface ArcPlan {
  arc: number;
  name: string;
  /** Eight steps. The eighth is the arc's milestone and pays the most. */
  steps: {
    key: string;
    name: string;
    description: string;
    goals: Goal[];
    rewards: Record<string, number>;
    grants?: { champions?: string[]; title?: string };
  }[];
}

const ARCS: ArcPlan[] = [
  {
    arc: 1,
    name: 'Awakening the Gate',
    steps: [
      {
        key: 'm01_first_blood',
        name: 'First light',
        description: 'Win your first battle in the Vale.',
        goals: [goal('battleWin', 1, { mode: 'campaign' })],
        rewards: { silver: 2_000, energy: 120 },
      },
      {
        key: 'm01_five_stages',
        name: 'Down the road',
        description: 'Clear five campaign stages.',
        goals: [goal('stageClear', 5, { mode: 'campaign' })],
        rewards: { silver: 3_000, energy: 150 },
      },
      {
        key: 'm01_first_summon',
        name: 'The gate answers',
        description: 'Summon a champion at the Mistgate.',
        goals: [goal('summon', 1)],
        rewards: { silver: 3_000, energy: 120 },
      },
      {
        key: 'm01_level_five',
        name: 'Learning the work',
        description: 'Level a champion five times.',
        goals: [goal('championLevelUp', 5)],
        rewards: { silver: 4_000, energy: 150 },
      },
      {
        key: 'm01_account_three',
        name: 'A name in the Vale',
        description: 'Reach account level 3.',
        goals: [goal('accountLevel', 3)],
        rewards: { silver: 4_000, sigil_faded: 1, energy: 150 },
      },
      {
        key: 'm01_first_warlord',
        name: 'The first warlord',
        description: 'Beat a chapter warlord.',
        goals: [goal('bossKill', 1, { mode: 'campaign' })],
        rewards: { silver: 5_000, energy: 180 },
      },
      {
        key: 'm01_energy',
        name: 'A long first day',
        description: 'Spend sixty energy.',
        goals: [goal('useEnergy', 60)],
        rewards: { silver: 5_000, energy: 150 },
      },
      {
        key: 'm01_chapter_one',
        name: 'Chapter one, held',
        description: 'Hold twelve stars in the first chapter.',
        goals: [goal('chapterStars', 12, { chapterKey: 'chapter_01' })],
        rewards: { sigil_faded: 3, crystals: 30, energy: 350, xpBoostHours: 12 },
      },
    ],
  },
  {
    arc: 2,
    name: 'First Steel',
    steps: [
      {
        key: 'm02_upgrade_relic',
        name: 'At the forge',
        description: 'Make five relic upgrade attempts.',
        goals: [goal('gearUpgrade', 5)],
        rewards: { silver: 6_000, energy: 60 },
      },
      {
        key: 'm02_relic_four',
        name: 'Sharper',
        description: 'Take a relic to +4.',
        goals: [goal('gearLevel', 4)],
        rewards: { silver: 8_000, energy: 60 },
      },
      {
        key: 'm02_summon_five',
        name: 'Voices in the mist',
        description: 'Summon five champions.',
        goals: [goal('summon', 5)],
        rewards: { sigil_faded: 2 },
      },
      {
        key: 'm02_rank_two',
        name: 'Promoted',
        description: 'Rank a champion to ★2.',
        goals: [goal('championRankUp', 1, { rank: 2 })],
        rewards: { silver: 8_000 },
      },
      {
        key: 'm02_account_six',
        name: 'Six days in',
        description: 'Reach account level 6.',
        goals: [goal('accountLevel', 6)],
        rewards: { energy: 150 },
      },
      {
        key: 'm02_bazaar',
        name: 'What silver buys',
        description: 'Buy something from the Bazaar.',
        goals: [goal('shopPurchase', 1, { shopKey: 'bazaar' })],
        rewards: { silver: 10_000, energy: 60 },
      },
      {
        key: 'm02_twenty_wins',
        name: 'A road walked',
        description: 'Win twenty campaign battles.',
        goals: [goal('battleWin', 20, { mode: 'campaign' })],
        rewards: { silver: 12_000 },
      },
      {
        key: 'm02_chapter_two',
        name: 'Chapter two, held',
        description: 'Hold sixteen stars in the second chapter.',
        goals: [goal('chapterStars', 16, { chapterKey: 'chapter_02' })],
        rewards: { sigil_gleaming: 1, crystals: 40, energy: 150, xpBoostHours: 12 },
      },
    ],
  },
  {
    arc: 3,
    name: 'The Causeway',
    steps: [
      {
        key: 'm03_relic_eight',
        name: 'Eight and holding',
        description: 'Take a relic to +8.',
        goals: [goal('gearLevel', 8)],
        rewards: { silver: 15_000 },
      },
      {
        key: 'm03_rank_three',
        name: 'Three stars',
        description: 'Rank a champion to ★3.',
        goals: [goal('championRankUp', 1, { rank: 3 })],
        rewards: { silver: 15_000, tome_rare: 1 },
      },
      {
        key: 'm03_forty_wins',
        name: 'The long causeway',
        description: 'Win forty campaign battles.',
        goals: [goal('battleWin', 40, { mode: 'campaign' })],
        rewards: { silver: 18_000 },
      },
      {
        key: 'm03_five_bosses',
        name: 'Five warlords',
        description: 'Beat five chapter warlords.',
        goals: [goal('bossKill', 5, { mode: 'campaign' })],
        rewards: { sigil_faded: 3 },
      },
      {
        key: 'm03_account_ten',
        name: 'Ten',
        description: 'Reach account level 10.',
        goals: [goal('accountLevel', 10)],
        rewards: { crystals: 30, energy: 120 },
      },
      {
        key: 'm03_dailies',
        name: 'A habit forms',
        description: 'Claim a full day of quests three times.',
        goals: [goal('claimAllDailies', 3)],
        rewards: { silver: 20_000 },
      },
      {
        key: 'm03_level_thirty',
        name: 'Fed and rested',
        description: 'Level champions thirty times.',
        goals: [goal('championLevelUp', 30)],
        rewards: { silver: 20_000 },
      },
      {
        key: 'm03_chapter_three',
        name: 'Chapter three, held',
        description: 'Hold eighteen stars in the third chapter.',
        goals: [goal('chapterStars', 18, { chapterKey: 'chapter_03' })],
        rewards: { sigil_gleaming: 2, crystals: 50, energy: 100, xpBoostHours: 24 },
      },
    ],
  },
  {
    arc: 4,
    name: 'Depths-Delver',
    steps: [
      {
        key: 'm04_first_floor',
        name: 'Down the stair',
        description: 'Clear a floor of the Depths.',
        goals: [goal('dungeonClear', 1)],
        rewards: { silver: 20_000 },
      },
      {
        key: 'm04_ten_floors',
        name: 'Deeper',
        description: 'Clear ten Depths floors.',
        goals: [goal('dungeonClear', 10)],
        rewards: { emblem_bronze: 20 },
      },
      {
        key: 'm04_spring',
        name: 'What the springs hold',
        description: 'Clear five floors of an Essence Spring.',
        goals: [goal('dungeonClear', 5, { dungeonKey: 'spring_pure' })],
        rewards: { essence_pure: 2 },
      },
      {
        key: 'm04_relic_twelve',
        name: 'Twelve',
        description: 'Take a relic to +12.',
        goals: [goal('gearLevel', 12)],
        rewards: { silver: 30_000, crystals: 25 },
      },
      {
        key: 'm04_ascend',
        name: 'Beyond the mist',
        description: 'Ascend a champion.',
        goals: [goal('championAscend', 1)],
        rewards: { essence_pure: 3 },
      },
      {
        key: 'm04_account_fourteen',
        name: 'Fourteen',
        description: 'Reach account level 14.',
        goals: [goal('accountLevel', 14)],
        rewards: { crystals: 40 },
      },
      {
        key: 'm04_summon_twenty',
        name: 'The gate stays open',
        description: 'Summon twenty champions.',
        goals: [goal('summon', 20)],
        rewards: { sigil_gleaming: 2 },
      },
      {
        key: 'm04_twentyfive_floors',
        name: 'Delver',
        description: 'Clear twenty-five Depths floors.',
        goals: [goal('dungeonClear', 25)],
        rewards: { sigil_gleaming: 3, crystals: 60 },
      },
    ],
  },
  {
    arc: 5,
    name: 'Proving Yourself',
    steps: [
      {
        key: 'm05_proving',
        name: 'Into the Grounds',
        description: 'Clear five floors of the Proving Grounds.',
        goals: [goal('dungeonClear', 5, { dungeonKey: 'proving_grounds' })],
        rewards: { emblem_bronze: 30 },
      },
      {
        key: 'm05_mastery',
        name: 'Trained',
        description: 'Learn five mastery nodes.',
        goals: [goal('masteryLearn', 5)],
        rewards: { emblem_bronze: 40 },
      },
      {
        key: 'm05_mastery_fifteen',
        name: 'A finished tree',
        description: 'Learn fifteen mastery nodes.',
        goals: [goal('masteryLearn', 15)],
        rewards: { emblem_silver: 60, crystals: 30 },
      },
      {
        key: 'm05_rank_four',
        name: 'Four stars',
        description: 'Rank a champion to ★4.',
        goals: [goal('championRankUp', 1, { rank: 4 })],
        rewards: { silver: 40_000 },
      },
      {
        key: 'm05_epic',
        name: 'Something rarer',
        description: 'Obtain an Epic champion.',
        goals: [goal('championObtained', 1, { rarity: 'epic' })],
        rewards: { tome_epic: 1 },
      },
      {
        key: 'm05_hundred_wins',
        name: 'A hundred roads',
        description: 'Win one hundred campaign battles.',
        goals: [goal('battleWin', 100, { mode: 'campaign' })],
        rewards: { silver: 50_000 },
      },
      {
        key: 'm05_chapter_five',
        name: 'Chapter five, held',
        description: 'Hold eighteen stars in the fifth chapter.',
        goals: [goal('chapterStars', 18, { chapterKey: 'chapter_05' })],
        rewards: { sigil_gleaming: 2 },
      },
      {
        key: 'm05_account_twenty',
        name: 'Twenty',
        description: 'Reach account level 20.',
        goals: [goal('accountLevel', 20)],
        rewards: { sigil_mistwoven: 1, crystals: 80 },
      },
    ],
  },
  {
    arc: 6,
    name: 'Arena Blooded',
    steps: [
      {
        key: 'm06_first_attack',
        name: 'Onto the sand',
        description: 'Fight an Arena battle.',
        goals: [goal('arenaBattle', 1)],
        rewards: { silver: 30_000 },
      },
      {
        key: 'm06_first_win',
        name: 'First blood on the sand',
        description: 'Win an Arena battle.',
        goals: [goal('arenaWin', 1)],
        rewards: { crystals: 30 },
      },
      {
        key: 'm06_ten_wins',
        name: 'Blooded',
        description: 'Win ten Arena battles.',
        goals: [goal('arenaWin', 10)],
        rewards: { silver: 50_000 },
      },
      {
        key: 'm06_bronze_three',
        name: 'Up from the bottom',
        description: 'Reach Bronze III.',
        // Tiers are a threshold on the ladder's own order — third rung of ten.
        goals: [goal('arenaTier', 3)],
        rewards: { crystals: 40 },
      },
      {
        key: 'm06_relic_sixteen',
        name: 'Sixteen',
        description: 'Take a relic to +16.',
        goals: [goal('gearLevel', 16)],
        rewards: { silver: 60_000 },
      },
      {
        key: 'm06_dailies_ten',
        name: 'Ten good days',
        description: 'Claim a full day of quests ten times.',
        goals: [goal('claimAllDailies', 10)],
        rewards: { sigil_gleaming: 3 },
      },
      {
        key: 'm06_fifty_floors',
        name: 'Fifty floors down',
        description: 'Clear fifty Depths floors.',
        goals: [goal('dungeonClear', 50)],
        rewards: { emblem_silver: 100 },
      },
      {
        key: 'm06_silver_tier',
        name: 'Silver',
        description: 'Reach Silver I in the Arena.',
        goals: [goal('arenaTier', 5)],
        rewards: { sigil_mistwoven: 1, crystals: 100 },
      },
    ],
  },
  {
    arc: 7,
    name: 'Silver Standard',
    steps: [
      {
        key: 'm07_rank_five',
        name: 'Five stars',
        description: 'Rank a champion to ★5.',
        goals: [goal('championRankUp', 1, { rank: 5 })],
        rewards: { silver: 80_000 },
      },
      {
        key: 'm07_ascend_three',
        name: 'Thrice beyond',
        description: 'Ascend champions three times.',
        goals: [goal('championAscend', 3)],
        rewards: { essence_pure: 8 },
      },
      {
        key: 'm07_relic_twenty',
        name: 'Twenty',
        description: 'Take a relic to +20.',
        goals: [goal('gearLevel', 20)],
        rewards: { crystals: 80 },
      },
      {
        key: 'm07_mastery_thirty',
        name: 'Two trees deep',
        description: 'Learn thirty mastery nodes.',
        goals: [goal('masteryLearn', 30)],
        rewards: { emblem_gold: 80 },
      },
      {
        key: 'm07_arena_thirty',
        name: 'Thirty on the sand',
        description: 'Win thirty Arena battles.',
        goals: [goal('arenaWin', 30)],
        rewards: { crystals: 60 },
      },
      {
        key: 'm07_hard_wins',
        name: 'The harder road',
        description: 'Win two hundred campaign battles.',
        goals: [goal('battleWin', 200, { mode: 'campaign' })],
        rewards: { silver: 100_000 },
      },
      {
        key: 'm07_chapter_eight',
        name: 'Chapter eight, held',
        description: 'Hold eighteen stars in the eighth chapter.',
        goals: [goal('chapterStars', 18, { chapterKey: 'chapter_08' })],
        rewards: { sigil_mistwoven: 1 },
      },
      {
        key: 'm07_account_thirty',
        name: 'Thirty',
        description: 'Reach account level 30.',
        goals: [goal('accountLevel', 30)],
        rewards: { sigil_radiant: 1, crystals: 120 },
      },
    ],
  },
  {
    arc: 8,
    name: 'The Deep Floors',
    steps: [
      {
        key: 'm08_hundred_floors',
        name: 'A hundred floors',
        description: 'Clear one hundred Depths floors.',
        goals: [goal('dungeonClear', 100)],
        rewards: { emblem_gold: 120 },
      },
      {
        key: 'm08_wyrms_hollow',
        name: 'The hollow',
        description: 'Clear twenty floors of Wyrm’s Hollow.',
        goals: [goal('dungeonClear', 20, { dungeonKey: 'wyrms_hollow' })],
        rewards: { sigil_gleaming: 3 },
      },
      {
        key: 'm08_frostgrave',
        name: 'The frozen vault',
        description: 'Clear twenty floors of Frostgrave Vault.',
        goals: [goal('dungeonClear', 20, { dungeonKey: 'frostgrave_vault' })],
        rewards: { sigil_gleaming: 3 },
      },
      {
        key: 'm08_cinderspire',
        name: 'The spire',
        description: 'Clear twenty floors of Cinderspire.',
        goals: [goal('dungeonClear', 20, { dungeonKey: 'cinderspire' })],
        rewards: { sigil_gleaming: 3 },
      },
      {
        key: 'm08_silkmire',
        name: 'The silk deeps',
        description: 'Clear twenty floors of Silkmire Depths.',
        goals: [goal('dungeonClear', 20, { dungeonKey: 'silkmire_depths' })],
        rewards: { sigil_gleaming: 3 },
      },
      {
        key: 'm08_relic_max',
        name: 'As far as it goes',
        description: 'Take a relic to +24.',
        goals: [goal('gearLevel', 24)],
        rewards: { crystals: 150 },
      },
      {
        key: 'm08_gold_tier',
        name: 'Gold',
        description: 'Reach Gold I in the Arena.',
        goals: [goal('arenaTier', 7)],
        rewards: { sigil_mistwoven: 1 },
      },
      {
        key: 'm08_account_forty',
        name: 'Forty',
        description: 'Reach account level 40.',
        goals: [goal('accountLevel', 40)],
        rewards: { sigil_radiant: 1, tome_legendary: 1 },
      },
    ],
  },
  {
    arc: 9,
    name: 'Brutal Roads',
    steps: [
      {
        key: 'm09_legendary',
        name: 'A legend answers',
        description: 'Obtain a Legendary champion.',
        goals: [goal('championObtained', 1, { rarity: 'legendary' })],
        rewards: { tome_legendary: 1 },
      },
      {
        key: 'm09_rank_six',
        name: 'Six stars',
        description: 'Rank a champion to ★6.',
        goals: [goal('championRankUp', 1, { rank: 6 })],
        rewards: { crystals: 150 },
      },
      {
        key: 'm09_ascend_six',
        name: 'Six times beyond',
        description: 'Ascend champions six times.',
        goals: [goal('championAscend', 6)],
        rewards: { essence_pure: 15 },
      },
      {
        key: 'm09_chapter_eleven',
        name: 'Chapter eleven, held',
        description: 'Hold eighteen stars in the eleventh chapter.',
        goals: [goal('chapterStars', 18, { chapterKey: 'chapter_11' })],
        rewards: { sigil_mistwoven: 1 },
      },
      {
        key: 'm09_dailies_thirty',
        name: 'A month of days',
        description: 'Claim a full day of quests thirty times.',
        goals: [goal('claimAllDailies', 30)],
        rewards: { sigil_radiant: 1 },
      },
      {
        key: 'm09_arena_hundred',
        name: 'A hundred on the sand',
        description: 'Win one hundred Arena battles.',
        goals: [goal('arenaWin', 100)],
        rewards: { crystals: 200 },
      },
      {
        key: 'm09_mastery_all',
        name: 'Mastered',
        description: 'Learn forty-five mastery nodes.',
        goals: [goal('masteryLearn', 45)],
        rewards: { emblem_gold: 200 },
      },
      {
        key: 'm09_account_fifty',
        name: 'Fifty',
        description: 'Reach account level 50.',
        goals: [goal('accountLevel', 50)],
        rewards: { sigil_radiant: 2, crystals: 200 },
      },
    ],
  },
  {
    arc: 10,
    name: 'Court of the Coilmother',
    steps: [
      {
        key: 'm10_chapter_twelve',
        name: 'The last chapter',
        description: 'Hold eighteen stars in the twelfth chapter.',
        goals: [goal('chapterStars', 18, { chapterKey: 'chapter_12' })],
        rewards: { sigil_radiant: 1 },
      },
      {
        key: 'm10_bosses',
        name: 'Every warlord',
        description: 'Beat thirty chapter warlords.',
        goals: [goal('bossKill', 30, { mode: 'campaign' })],
        rewards: { crystals: 150 },
      },
      {
        key: 'm10_platinum',
        name: 'Platinum',
        description: 'Reach Platinum in the Arena.',
        goals: [goal('arenaTier', 10)],
        rewards: { sigil_radiant: 1, crystals: 200 },
      },
      {
        key: 'm10_depths_two_hundred',
        name: 'Two hundred floors',
        description: 'Clear two hundred Depths floors.',
        goals: [goal('dungeonClear', 200)],
        rewards: { emblem_gold: 300 },
      },
      {
        key: 'm10_five_hundred_wins',
        name: 'Five hundred roads',
        description: 'Win five hundred campaign battles.',
        goals: [goal('battleWin', 500, { mode: 'campaign' })],
        rewards: { silver: 300_000 },
      },
      {
        key: 'm10_summon_two_hundred',
        name: 'The gate, worn thin',
        description: 'Summon two hundred champions.',
        goals: [goal('summon', 200)],
        rewards: { sigil_mistwoven: 2 },
      },
      {
        key: 'm10_account_sixty',
        name: 'Sixty',
        description: 'Reach account level 60.',
        goals: [goal('accountLevel', 60)],
        rewards: { sigil_radiant: 3, crystals: 300 },
      },
      {
        key: 'm10_the_voice',
        name: 'The Voice of the Vale',
        description:
          'Beat the Coilmother on Brutal, and the Vale itself will answer for you. Aureleth walks out of the mist — and she will not be summoned by anyone else.',
        goals: [
          goal('stageClear', 1, { mode: 'campaign', stageKey: 'c12_s7_brutal' }),
          goal('accountLevel', 55),
        ],
        rewards: { crystals: 500 },
        grants: { champions: ['aureleth'], title: 'Warden of the Reclamation' },
      },
    ],
  },
];

let order = 0;

export const MISSIONS: MissionDef[] = ARCS.flatMap((arc) =>
  arc.steps.map((step, index) => ({
    key: step.key,
    name: step.name,
    description: step.description,
    arc: arc.arc,
    step: index + 1,
    arcName: arc.name,
    goals: step.goals,
    rewards: step.rewards,
    grants: { champions: step.grants?.champions ?? [], title: step.grants?.title ?? '' },
    icon: 'mv-mission',
    active: true,
    sortOrder: (order += 10),
  })),
);
