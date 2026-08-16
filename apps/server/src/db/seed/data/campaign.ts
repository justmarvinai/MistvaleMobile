import type { CampaignChapterDefInput, StageDefInput } from '@mistvale/shared';

/**
 * The opening chapters.
 *
 * Chapter 1 ships on all three difficulties; chapters 2 and 3 ship on Normal, which is
 * what the campaign loop needs to feel like a journey rather than a single room. The
 * remaining nine chapters are generated and tuned in P6 against the balance simulator
 * (docs/CONTENT_PLAN_EA01.md §3).
 *
 * Stage shape follows the source game's conventions: stages 1–6 are three-wave fights
 * whose number decides which relic slot drops, and stage 7 is the chapter boss.
 */

/** Everything that varies between chapters. Adding a chapter is one entry here. */
interface ChapterPlan {
  key: string;
  number: number;
  bossKey: string;
  /** Enemy level band per difficulty. */
  levels: Record<'normal' | 'hard' | 'brutal', [number, number]>;
  /** Which difficulties this chapter ships on. */
  difficulties: readonly ('normal' | 'hard' | 'brutal')[];
  /** The breath this chapter's essence drops belong to. */
  element: 'ember' | 'tide' | 'verdant' | 'mist';
}

export const CAMPAIGN_CHAPTERS: CampaignChapterDefInput[] = [
  {
    key: 'chapter_01',
    number: 1,
    name: 'Veilwood Fringe',
    region: 'The Fringe',
    lore: 'Where the old road gives out and the fog begins. The Sskarn came through here first, and left the treeline chewed.',
    backgroundAsset: 'bg_veilwood',
    setKey: 'ironroot',
    starRewards: [
      { stars: 7, rewards: { silver: 5_000, crystals: 10 } },
      { stars: 14, rewards: { silver: 12_000, crystals: 25 } },
      { stars: 21, rewards: { silver: 30_000, crystals: 50 } },
    ],
    sortOrder: 1,
  },
  {
    key: 'chapter_02',
    number: 2,
    name: 'The Drowned Road',
    region: 'Sunken Marches',
    lore: 'The causeway is under a foot of black water now, and something down there keeps pace with anyone walking it.',
    backgroundAsset: 'bg_veilwood',
    setKey: 'stormcoil',
    starRewards: [
      { stars: 7, rewards: { silver: 7_000, crystals: 10 } },
      { stars: 14, rewards: { silver: 16_000, crystals: 25 } },
      { stars: 21, rewards: { silver: 38_000, crystals: 50 } },
    ],
    sortOrder: 2,
  },
  {
    key: 'chapter_03',
    number: 3,
    name: 'Silkmire Hollow',
    region: 'Sunken Marches',
    lore: 'A brood-warren dug into the hillside. The Sskarn do not guard it so much as feed it.',
    backgroundAsset: 'bg_veilwood',
    setKey: 'gravebind',
    starRewards: [
      { stars: 7, rewards: { silver: 9_000, crystals: 10 } },
      { stars: 14, rewards: { silver: 20_000, crystals: 25 } },
      { stars: 21, rewards: { silver: 46_000, crystals: 50 } },
    ],
    sortOrder: 3,
  },
];

const CHAPTER_PLANS: ChapterPlan[] = [
  {
    key: 'chapter_01',
    number: 1,
    bossKey: 'boss_vrash_fenblade',
    levels: { normal: [1, 6], hard: [24, 30], brutal: [42, 48] },
    difficulties: ['normal', 'hard', 'brutal'],
    element: 'verdant',
  },
  {
    key: 'chapter_02',
    number: 2,
    bossKey: 'boss_ssythra_tidecaller',
    levels: { normal: [6, 12], hard: [30, 36], brutal: [48, 53] },
    difficulties: ['normal'],
    element: 'tide',
  },
  {
    key: 'chapter_03',
    number: 3,
    bossKey: 'boss_gorrakh_broodtyrant',
    levels: { normal: [12, 19], hard: [36, 42], brutal: [53, 58] },
    difficulties: ['normal'],
    element: 'ember',
  },
];

/** Energy cost by difficulty; the boss stage costs one more (source-faithful). */
const ENERGY: Record<'normal' | 'hard' | 'brutal', number> = { normal: 4, hard: 6, brutal: 8 };

/** Reward scaling per difficulty. */
const REWARD_SCALE: Record<'normal' | 'hard' | 'brutal', number> = {
  normal: 1,
  hard: 2.6,
  brutal: 5.4,
};

const TRASH_COMPOSITIONS: string[][][] = [
  [
    ['sskarn_skirmisher', 'sskarn_skirmisher'],
    ['sskarn_skirmisher', 'sskarn_venomspitter'],
    ['sskarn_skirmisher', 'sskarn_spearguard'],
  ],
  [
    ['sskarn_skirmisher', 'sskarn_venomspitter'],
    ['sskarn_spearguard', 'sskarn_skirmisher'],
    ['sskarn_venomspitter', 'sskarn_brute'],
  ],
  [
    ['sskarn_spearguard', 'sskarn_skirmisher'],
    ['sskarn_venomspitter', 'sskarn_venomspitter'],
    ['sskarn_brute', 'sskarn_mireshaman'],
  ],
  [
    ['sskarn_skirmisher', 'sskarn_brute'],
    ['sskarn_mireshaman', 'sskarn_skirmisher'],
    ['sskarn_broodguard', 'sskarn_venomspitter'],
  ],
  [
    ['sskarn_venomspitter', 'sskarn_spearguard'],
    ['sskarn_brute', 'sskarn_warcaller'],
    ['sskarn_broodguard', 'sskarn_mireshaman'],
  ],
  [
    ['sskarn_brute', 'sskarn_venomspitter'],
    ['sskarn_warcaller', 'sskarn_spearguard'],
    ['sskarn_broodguard', 'sskarn_brute', 'sskarn_skirmisher'],
  ],
];

/**
 * Which relic slot a campaign stage drops.
 *
 * Stage number decides the slot and the chapter decides the set — the source game's
 * arrangement, and the reason a chapter is a *specific* farm rather than a lottery. The
 * boss stage drops any slot, which is what makes it the one worth repeating.
 */
const SLOT_BY_STAGE: readonly StageDropSlots[] = [
  ['weapon'],
  ['helm'],
  ['shield'],
  ['gauntlets'],
  ['cuirass'],
  ['boots'],
  [],
];

type StageDropSlots = NonNullable<NonNullable<StageDefInput['rewards']['drops']>['gearSlots']>;

/**
 * What a clear can drop.
 *
 * Relic rank climbs with the chapter and again with difficulty, so Brutal chapter 3 is
 * the first place a ★4 piece appears. The rarity mix shifts the same way: Normal is
 * mostly sell-fodder that funds the forge, and the good rolls live further in
 * (docs/ECONOMY_BALANCE.md §4).
 */
function buildDrops(
  plan: ChapterPlan,
  stageNumber: number,
  difficulty: 'normal' | 'hard' | 'brutal',
): StageDefInput['rewards']['drops'] {
  const difficultyStep = difficulty === 'brutal' ? 2 : difficulty === 'hard' ? 1 : 0;
  const chapterStep = Math.floor((plan.number - 1) / 2);
  const rankMin = Math.min(6, 1 + chapterStep + difficultyStep);
  const rankMax = Math.min(6, rankMin + 1);
  const isBoss = stageNumber === 7;

  return {
    // The boss drops nearly every run; trash stages are the trickle that funds selling.
    gearChance: isBoss ? 0.85 : 0.42,
    gearRankMin: rankMin,
    gearRankMax: rankMax,
    gearRarityWeights: {
      common: difficulty === 'normal' ? 46 : 24,
      uncommon: 32,
      rare: difficulty === 'brutal' ? 30 : 18,
      epic: difficulty === 'brutal' ? 12 : difficulty === 'hard' ? 6 : 3,
      legendary: difficulty === 'brutal' ? 2 : 1,
    },
    gearSlots: SLOT_BY_STAGE[stageNumber - 1] ?? [],
    // The boss is also the ascension faucet until the Springs open in P6.
    items: isBoss
      ? [
          { itemKey: 'essence_pure', chance: 0.5, min: 1, max: 3 },
          { itemKey: `essence_${plan.element}_lesser`, chance: 0.7, min: 1, max: 4 },
          { itemKey: 'sigil_faded', chance: 0.25, min: 1, max: 1 },
        ]
      : [{ itemKey: `essence_${plan.element}_lesser`, chance: 0.14, min: 1, max: 2 }],
  };
}

function buildStage(
  plan: ChapterPlan,
  stageNumber: number,
  difficulty: 'normal' | 'hard' | 'brutal',
): StageDefInput {
  const [minLevel, maxLevel] = plan.levels[difficulty];
  // Later chapters pay more for the same work, which is what makes pushing forward
  // better than farming the opening stage forever.
  const chapterScale = 1 + (plan.number - 1) * 0.45;
  const isBoss = stageNumber === 7;
  const scale = REWARD_SCALE[difficulty];

  // Enemy level climbs across the chapter and again with each wave.
  const levelAt = (waveIndex: number): number => {
    const span = maxLevel - minLevel;
    const progress = (stageNumber - 1) / 6 + waveIndex / 12;
    return Math.max(1, Math.round(minLevel + span * Math.min(1, progress)));
  };

  const waves: StageDefInput['waves'] = isBoss
    ? [
        (TRASH_COMPOSITIONS[5] ?? [[]])[0]!.map((enemyKey, slot) => ({
          enemyKey,
          level: levelAt(0),
          stars: 2,
          slot,
        })),
        (TRASH_COMPOSITIONS[5] ?? [[]])[1]!.map((enemyKey, slot) => ({
          enemyKey,
          level: levelAt(1),
          stars: 2,
          slot,
        })),
        [{ enemyKey: plan.bossKey, level: maxLevel, stars: 3, slot: 1 }],
      ]
    : (TRASH_COMPOSITIONS[stageNumber - 1] ?? []).map((wave, waveIndex) =>
        wave.map((enemyKey, slot) => ({
          enemyKey,
          level: levelAt(waveIndex),
          stars: difficulty === 'brutal' ? 3 : difficulty === 'hard' ? 2 : 1,
          slot,
        })),
      );

  const prefix = `c${String(plan.number).padStart(2, '0')}`;

  return {
    key: `${prefix}_s${stageNumber}_${difficulty}`,
    mode: 'campaign',
    parentKey: plan.key,
    number: stageNumber,
    difficulty,
    energyCost: ENERGY[difficulty] + (isBoss ? 1 : 0),
    waves,
    rewards: {
      silverMin: Math.round((320 + stageNumber * 55) * scale * chapterScale),
      silverMax: Math.round((480 + stageNumber * 80) * scale * chapterScale),
      playerXp: Math.round((14 + stageNumber * 3) * scale * chapterScale),
      championXp: Math.round((110 + stageNumber * 26) * scale * chapterScale),
      drops: buildDrops(plan, stageNumber, difficulty),
    },
    starRules: { noDeaths: true, maxTurns: isBoss ? 16 : 12 },
    firstClearRewards: isBoss
      ? { silver: Math.round(2_000 * scale * chapterScale), crystals: 15 }
      : { silver: Math.round(400 * scale * chapterScale) },
    unlock: buildUnlock(plan, stageNumber, difficulty),
    sortOrder: stageNumber,
  };
}

/**
 * What has to be cleared before this stage opens.
 *
 * Within a chapter it is simply the previous stage. The first stage of a chapter opens on
 * the previous chapter's boss, and a harder difficulty opens on finishing the one below —
 * so the campaign reads as one continuous line rather than three parallel ones.
 */
function buildUnlock(
  plan: ChapterPlan,
  stageNumber: number,
  difficulty: 'normal' | 'hard' | 'brutal',
): StageDefInput['unlock'] {
  const prefix = `c${String(plan.number).padStart(2, '0')}`;
  if (stageNumber > 1) return { previousStageKey: `${prefix}_s${stageNumber - 1}_${difficulty}` };

  if (difficulty !== 'normal') {
    const below = difficulty === 'hard' ? 'normal' : 'hard';
    return { previousStageKey: `${prefix}_s7_${below}` };
  }

  const previous = CHAPTER_PLANS.find((entry) => entry.number === plan.number - 1);
  return previous
    ? { previousStageKey: `c${String(previous.number).padStart(2, '0')}_s7_normal` }
    : {};
}

export const CAMPAIGN_STAGES: StageDefInput[] = CHAPTER_PLANS.flatMap((plan) =>
  plan.difficulties.flatMap((difficulty) =>
    Array.from({ length: 7 }, (_, index) => buildStage(plan, index + 1, difficulty)),
  ),
);
