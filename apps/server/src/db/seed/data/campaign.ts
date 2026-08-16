import type { CampaignChapterDefInput, StageDefInput } from '@mistvale/shared';

/**
 * Chapter 1 — the Veilwood Fringe.
 *
 * P1 seeds the first chapter across all three difficulties so the content pipeline has
 * real stages to serve; the remaining eleven chapters are generated and tuned in P3/P6
 * against the balance simulator (docs/CONTENT_PLAN_EA01.md §3).
 *
 * Stage shape follows the source game's conventions: stages 1–6 are three-wave fights
 * whose number decides which relic slot drops, and stage 7 is the chapter boss.
 */

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
];

/** Energy cost by difficulty; the boss stage costs one more (source-faithful). */
const ENERGY: Record<'normal' | 'hard' | 'brutal', number> = { normal: 4, hard: 6, brutal: 8 };

/** Enemy level bands per difficulty for chapter 1. */
const LEVELS: Record<'normal' | 'hard' | 'brutal', [number, number]> = {
  normal: [1, 6],
  hard: [24, 30],
  brutal: [42, 48],
};

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

function buildStage(stageNumber: number, difficulty: 'normal' | 'hard' | 'brutal'): StageDefInput {
  const [minLevel, maxLevel] = LEVELS[difficulty];
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
        [{ enemyKey: 'boss_vrash_fenblade', level: maxLevel, stars: 3, slot: 1 }],
      ]
    : (TRASH_COMPOSITIONS[stageNumber - 1] ?? []).map((wave, waveIndex) =>
        wave.map((enemyKey, slot) => ({
          enemyKey,
          level: levelAt(waveIndex),
          stars: difficulty === 'brutal' ? 3 : difficulty === 'hard' ? 2 : 1,
          slot,
        })),
      );

  return {
    key: `c01_s${stageNumber}_${difficulty}`,
    mode: 'campaign',
    parentKey: 'chapter_01',
    number: stageNumber,
    difficulty,
    energyCost: ENERGY[difficulty] + (isBoss ? 1 : 0),
    waves,
    rewards: {
      silverMin: Math.round((320 + stageNumber * 55) * scale),
      silverMax: Math.round((480 + stageNumber * 80) * scale),
      playerXp: Math.round((14 + stageNumber * 3) * scale),
      championXp: Math.round((110 + stageNumber * 26) * scale),
    },
    starRules: { noDeaths: true, maxTurns: isBoss ? 16 : 12 },
    firstClearRewards: isBoss
      ? { silver: Math.round(2_000 * scale), crystals: 15 }
      : { silver: Math.round(400 * scale) },
    unlock:
      stageNumber === 1
        ? difficulty === 'normal'
          ? {}
          : { previousStageKey: `c01_s7_${difficulty === 'hard' ? 'normal' : 'hard'}` }
        : { previousStageKey: `c01_s${stageNumber - 1}_${difficulty}` },
    sortOrder: stageNumber,
  };
}

export const CAMPAIGN_STAGES: StageDefInput[] = (['normal', 'hard', 'brutal'] as const).flatMap(
  (difficulty) => Array.from({ length: 7 }, (_, index) => buildStage(index + 1, difficulty)),
);
