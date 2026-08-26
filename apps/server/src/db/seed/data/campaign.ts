import type { CampaignChapterDefInput, Difficulty, StageDefInput } from '@mistvale/shared';

/**
 * The Reclamation — twelve chapters, seven stages each, on three difficulties.
 *
 * 252 stages generated from twelve plan entries. Everything that varies between chapters
 * lives in `CHAPTER_PLANS` and `CAMPAIGN_CHAPTERS`; the rest is one function, which is
 * what keeps "the numbers ramp smoothly" a property of the code rather than of somebody's
 * patience with a spreadsheet (docs/CONTENT_PLAN_EA01.md §3).
 *
 * Stage shape follows the source game's conventions: stages 1–6 are three-wave fights
 * whose number decides which relic slot drops, and stage 7 is two waves and the chapter's
 * warlord. A chapter drops one relic set, so a chapter is a *farm for something* rather
 * than a lottery.
 */

/** Everything that varies between chapters. Adding a chapter is one entry here. */
interface ChapterPlan {
  key: string;
  number: number;
  bossKey: string;
  /** Enemy level band per difficulty. */
  levels: Record<Difficulty, [number, number]>;
  /** The breath this chapter's essence drops belong to. */
  element: 'ember' | 'tide' | 'verdant' | 'mist';
  /**
   * The archetype this chapter is *about*.
   *
   * Appears in most of its waves, which is what makes chapter 6 feel like a different
   * war from chapter 3 despite sharing a lizard model and a stage template.
   */
  theme: string;
}

/**
 * Star-chest tiers for a chapter.
 *
 * Seven stages × three stars × three difficulties is 63 stars, so the tiers are the
 * quarter-marks of a *whole* chapter rather than of one difficulty: 21 is Normal cleared
 * cleanly, 42 is Hard as well, 63 is everything. The 7 is the early taste that tells a
 * new player chests exist at all (docs/ECONOMY_BALANCE.md §11).
 */
function starRewards(chapterNumber: number): CampaignChapterDefInput['starRewards'] {
  const scale = 1 + (chapterNumber - 1) * 0.35;
  return [
    { stars: 7, rewards: { silver: Math.round(5_000 * scale) } },
    { stars: 21, rewards: { silver: Math.round(12_000 * scale), crystals: 25 } },
    { stars: 42, rewards: { silver: Math.round(30_000 * scale), crystals: 50 } },
    {
      stars: 63,
      rewards: {
        silver: Math.round(70_000 * scale),
        crystals: 100,
        // The last chest in the last chapter is the campaign's own reward for finishing
        // it: a Radiant Sigil, which is otherwise a Mistgate purchase.
        ...(chapterNumber === 12 ? { valorMedals: 200 } : {}),
      },
    },
  ];
}

interface ChapterCopy {
  key: string;
  number: number;
  name: string;
  region: string;
  lore: string;
  setKey: string;
}

const CHAPTER_COPY: ChapterCopy[] = [
  {
    key: 'chapter_01',
    number: 1,
    name: 'Veilwood Fringe',
    region: 'The Fringe',
    lore: 'Where the old road gives out and the fog begins. The Sskarn came through here first, and left the treeline chewed.',
    setKey: 'ironroot',
  },
  {
    key: 'chapter_02',
    number: 2,
    name: 'The Drowned Road',
    region: 'Sunken Marches',
    lore: 'The causeway is under a foot of black water now, and something down there keeps pace with anyone walking it.',
    setKey: 'wolfsfang',
  },
  {
    key: 'chapter_03',
    number: 3,
    name: 'Silkmire Hollow',
    region: 'Sunken Marches',
    lore: 'A brood-warren dug into the hillside. The Sskarn do not guard it so much as feed it.',
    setKey: 'stoneguard',
  },
  {
    key: 'chapter_04',
    number: 4,
    name: 'Thornmere Marsh',
    region: 'The Thornmere',
    lore: 'Reed and root and standing water, and every third step is a hole. The brood grew up in it and you did not.',
    setKey: 'hawkeye',
  },
  {
    key: 'chapter_05',
    number: 5,
    name: 'The Shattered Span',
    region: 'The Thornmere',
    lore: 'The great bridge went down in the first month. What holds the gap now was not built by anyone who wanted it crossed.',
    setKey: 'truestrike',
  },
  {
    key: 'chapter_06',
    number: 6,
    name: 'Galehollow Cliffs',
    region: 'The Windward Rise',
    lore: 'Wind comes off the sea hard enough to lean on. The Sskarn nest in the hollows and drop on whatever the gale slows down.',
    setKey: 'swiftwind',
  },
  {
    key: 'chapter_07',
    number: 7,
    name: 'The Ashen Reach',
    region: 'The Windward Rise',
    lore: 'Somebody burned this to deny it to the brood. It did not work, and now nothing grows and the brood is still here.',
    setKey: 'wardweave',
  },
  {
    key: 'chapter_08',
    number: 8,
    name: 'Fenwrack Deeps',
    region: 'The Sunless Fen',
    lore: 'The fen goes down further than it goes across. Wardens who went in after the missing did not come back up either.',
    setKey: 'bloodthorn',
  },
  {
    key: 'chapter_09',
    number: 9,
    name: 'The Hollow Vale',
    region: 'The Sunless Fen',
    lore: 'The valley the mist came out of. Every account of it disagrees about the shape of the place, which is itself the warning.',
    setKey: 'reaver',
  },
  {
    key: 'chapter_10',
    number: 10,
    name: 'Coilstone Terraces',
    region: 'The Coilstone',
    lore: 'Steps cut into the mountain by something with more time than hands. The Sskarn did not build them; they moved in.',
    setKey: 'gravebind',
  },
  {
    key: 'chapter_11',
    number: 11,
    name: 'The Fallen Gates',
    region: 'The Coilstone',
    lore: 'The last gate the vale had. It held for eleven years and then it did not, and the keeper is still standing in it.',
    setKey: 'stormcoil',
  },
  {
    key: 'chapter_12',
    number: 12,
    name: 'The Coilmother’s Court',
    region: 'The Coilstone',
    lore: 'Where the invasion is *from*. She has been waiting the whole time, and she was never in a hurry.',
    setKey: 'mendersong',
  },
];

export const CAMPAIGN_CHAPTERS: CampaignChapterDefInput[] = CHAPTER_COPY.map((copy) => ({
  key: copy.key,
  number: copy.number,
  name: copy.name,
  region: copy.region,
  lore: copy.lore,
  backgroundAsset: 'bg_veilwood',
  setKey: copy.setKey,
  starRewards: starRewards(copy.number),
  sortOrder: copy.number,
}));

/**
 * Enemy level bands, per chapter and difficulty.
 *
 * Normal walks 1 → 40 across the twelve chapters, which is the pace an account levels at;
 * Hard picks up at 24 and Brutal at 42, so each difficulty is a *second and third pass*
 * over the same ground against enemies that have caught up and gone past. Brutal 12 ends
 * at 60, the cap, because there is nothing above it to save for.
 */
const LEVELS: Record<number, Record<Difficulty, [number, number]>> = {
  1: { normal: [1, 6], hard: [24, 30], brutal: [42, 48] },
  2: { normal: [4, 9], hard: [26, 32], brutal: [44, 50] },
  3: { normal: [7, 12], hard: [28, 34], brutal: [46, 51] },
  4: { normal: [10, 15], hard: [30, 36], brutal: [47, 52] },
  5: { normal: [13, 18], hard: [32, 38], brutal: [49, 53] },
  6: { normal: [16, 21], hard: [34, 40], brutal: [50, 54] },
  7: { normal: [19, 24], hard: [36, 42], brutal: [51, 55] },
  8: { normal: [22, 27], hard: [38, 44], brutal: [52, 56] },
  9: { normal: [25, 30], hard: [40, 46], brutal: [53, 57] },
  10: { normal: [28, 33], hard: [42, 48], brutal: [54, 58] },
  11: { normal: [31, 36], hard: [44, 50], brutal: [55, 59] },
  12: { normal: [34, 40], hard: [46, 52], brutal: [56, 60] },
};

const CHAPTER_PLANS: ChapterPlan[] = (
  [
    { number: 1, bossKey: 'boss_vrash_fenblade', element: 'verdant', theme: 'sskarn_skirmisher' },
    {
      number: 2,
      bossKey: 'boss_ssythra_tidecaller',
      element: 'tide',
      theme: 'sskarn_venomspitter',
    },
    { number: 3, bossKey: 'boss_gorrakh_broodtyrant', element: 'ember', theme: 'sskarn_brute' },
    {
      number: 4,
      bossKey: 'boss_hessk_marshbinder',
      element: 'verdant',
      theme: 'sskarn_mireshaman',
    },
    { number: 5, bossKey: 'boss_hissrad_spantaker', element: 'tide', theme: 'sskarn_spearguard' },
    { number: 6, bossKey: 'boss_vyss_galetongue', element: 'mist', theme: 'sskarn_skirmisher' },
    { number: 7, bossKey: 'boss_korrash_reachburner', element: 'ember', theme: 'sskarn_warcaller' },
    { number: 8, bossKey: 'boss_mama_fenwrack', element: 'verdant', theme: 'sskarn_brute' },
    { number: 9, bossKey: 'boss_nulla_holloweye', element: 'mist', theme: 'sskarn_venomspitter' },
    { number: 10, bossKey: 'boss_tszar_coilstone', element: 'ember', theme: 'sskarn_broodguard' },
    { number: 11, bossKey: 'boss_ryssa_gatekeeper', element: 'tide', theme: 'sskarn_spearguard' },
    { number: 12, bossKey: 'boss_ssyleth_coilmother', element: 'mist', theme: 'sskarn_broodguard' },
  ] as const
).map((entry) => ({
  ...entry,
  key: `chapter_${String(entry.number).padStart(2, '0')}`,
  levels: LEVELS[entry.number]!,
}));

const DIFFICULTIES: readonly Difficulty[] = ['normal', 'hard', 'brutal'];

/** Energy cost by difficulty; the boss stage costs one more (source-faithful). */
const ENERGY: Record<Difficulty, number> = { normal: 4, hard: 6, brutal: 8 };

/** Reward scaling per difficulty. */
const REWARD_SCALE: Record<Difficulty, number> = { normal: 1, hard: 2.6, brutal: 5.4 };

/**
 * Who shows up, and how many.
 *
 * A wave is the chapter's theme archetype plus a supporting cast drawn from a rotation, so
 * every chapter has a texture without twelve hand-written tables. Waves widen as the
 * campaign goes on — two enemies in chapter 1, four by chapter 9 — which is most of why a
 * late stage is harder than an early one at the same level.
 */
const SUPPORT_ROTATION: readonly string[] = [
  'sskarn_skirmisher',
  'sskarn_venomspitter',
  'sskarn_spearguard',
  'sskarn_mireshaman',
  'sskarn_brute',
  'sskarn_warcaller',
  'sskarn_broodguard',
];

function waveWidth(chapterNumber: number, waveIndex: number): number {
  // Chapters 1–2 open at two, and the back half fights four abreast. The last wave of a
  // stage is always the widest — a stage should end harder than it began.
  const base = 2 + Math.floor((chapterNumber - 1) / 3);
  return Math.min(4, base + (waveIndex === 2 ? 1 : 0));
}

function composition(plan: ChapterPlan, stageNumber: number, waveIndex: number): string[] {
  const width = waveWidth(plan.number, waveIndex);
  const units: string[] = [plan.theme];
  // Deterministic, and different for every (chapter, stage, wave) — the seed generator's
  // job is to be varied, not random. A published stage must be the same stage tomorrow.
  let cursor = plan.number * 13 + stageNumber * 5 + waveIndex * 3;
  while (units.length < width) {
    const pick = SUPPORT_ROTATION[cursor % SUPPORT_ROTATION.length]!;
    cursor += 1;
    // One repeat of the theme is texture; three is a wall of the same lizard.
    if (pick === plan.theme && units.filter((unit) => unit === plan.theme).length >= 2) continue;
    units.push(pick);
  }
  return units;
}

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
 * the first place a ★4 piece appears and Brutal chapter 12 is the only campaign source of
 * ★6. The rarity mix shifts the same way: Normal is mostly sell-fodder that funds the
 * forge, and the good rolls live further in (docs/ECONOMY_BALANCE.md §4).
 */
function buildDrops(
  plan: ChapterPlan,
  stageNumber: number,
  difficulty: Difficulty,
): StageDefInput['rewards']['drops'] {
  const difficultyStep = difficulty === 'brutal' ? 2 : difficulty === 'hard' ? 1 : 0;
  const chapterStep = Math.floor((plan.number - 1) / 3);
  const rankMin = Math.min(6, 1 + chapterStep + difficultyStep);
  const rankMax = Math.min(6, rankMin + 1);
  const isBoss = stageNumber === 7;
  // Deep chapters are where the good rolls are, on top of what difficulty already does.
  const late = plan.number >= 9;

  return {
    // The boss drops nearly every run; trash stages are the trickle that funds selling.
    gearChance: isBoss ? 0.85 : 0.42,
    gearRankMin: rankMin,
    gearRankMax: rankMax,
    gearRarityWeights: {
      common: difficulty === 'normal' ? 46 : 24,
      uncommon: 32,
      rare: difficulty === 'brutal' ? 30 : 18,
      epic: (difficulty === 'brutal' ? 12 : difficulty === 'hard' ? 6 : 3) + (late ? 6 : 0),
      legendary: (difficulty === 'brutal' ? 2 : 1) + (late ? 1 : 0),
    },
    gearSlots: SLOT_BY_STAGE[stageNumber - 1] ?? [],
    // The boss is the campaign's ascension faucet; the Springs are the reliable one.
    //
    // Brews come off the campaign because levelling is what the campaign is *for*: the road
    // is where a warband is grown, and a stage that pays experience the player can carry
    // back to somebody else keeps a cleared chapter worth farming. They fall more often and
    // in bigger handfuls further in, so pushing forward beats grinding 1-1.
    items: isBoss
      ? [
          { itemKey: 'essence_pure', chance: 0.5, min: 1, max: 3 },
          { itemKey: `essence_${plan.element}_lesser`, chance: 0.7, min: 1, max: 4 },
          { itemKey: 'sigil_faded', chance: 0.25, min: 1, max: 1 },
          { itemKey: 'xp_brew', chance: 0.8, min: 2, max: 3 + chapterStep },
        ]
      : [
          { itemKey: `essence_${plan.element}_lesser`, chance: 0.14, min: 1, max: 2 },
          {
            itemKey: 'xp_brew',
            chance: 0.35 + difficultyStep * 0.08,
            min: 1,
            max: 1 + chapterStep,
          },
        ],
  };
}

function buildStage(plan: ChapterPlan, stageNumber: number, difficulty: Difficulty): StageDefInput {
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

  // Elite tier, on the ladder the engine actually reads (C13 / Q8).
  //
  // A wave unit's stars are its stat budget, so a Brutal trash mob is a genuinely
  // different creature from the Normal one rather than the same one at a higher level
  // (docs/CONTENT_PLAN_EA01.md §2 — "Elite variants"). That intent is unchanged; what
  // moves is the scale it is written on.
  //
  // These were 1 / 2 / 3, chosen while `scaleEnemyStats` ignored `stars` altogether, so
  // nothing could tell that the campaign was the only content in the game not authored on
  // the ★1–6 ladder — the Depths, the Spire, the Deep Run and the tutorial all already
  // ran 3→6. Now that the field is read, ★6 is full strength and an enemy's authored
  // anchor stats *are* its six-star stats, so the old numbers meant "the whole campaign at
  // 42–68% of what it was tuned to be". Brutal is the full-strength creature; Hard and
  // Normal are its lesser versions, which is what the line above has always said.
  const stars = difficulty === 'brutal' ? 6 : difficulty === 'hard' ? 5 : 4;

  const waves: StageDefInput['waves'] = isBoss
    ? [
        composition(plan, stageNumber, 0).map((enemyKey, slot) => ({
          enemyKey,
          level: levelAt(0),
          stars: Math.min(6, stars + 1),
          slot,
        })),
        composition(plan, stageNumber, 1).map((enemyKey, slot) => ({
          enemyKey,
          level: levelAt(1),
          stars: Math.min(6, stars + 1),
          slot,
        })),
        [{ enemyKey: plan.bossKey, level: maxLevel, stars: 6, slot: 1 }],
      ]
    : [0, 1, 2].map((waveIndex) =>
        composition(plan, stageNumber, waveIndex).map((enemyKey, slot) => ({
          enemyKey,
          level: levelAt(waveIndex),
          stars,
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
      // Champion XP climbs faster with the chapter than silver does, which is what makes
      // deep Brutal the *intended* levelling farm rather than merely the richest stage
      // (ECONOMY_BALANCE §3 — ≈4.3k per champion per run at Brutal 12-3, split across the
      // team, so the "farmer carries three food" loop is worth running).
      championXp: Math.round((110 + stageNumber * 26) * scale * Math.pow(chapterScale, 1.6)),
      drops: buildDrops(plan, stageNumber, difficulty),
    },
    starRules: { noDeaths: true, maxTurns: turnLimit(plan.number, isBoss) },
    firstClearRewards: firstClear(plan, stageNumber, difficulty),
    unlock: buildUnlock(plan, stageNumber, difficulty),
    sortOrder: stageNumber,
  };
}

/**
 * The turn limit the third star hangs on.
 *
 * It has to grow with the chapter or the third star quietly stops existing: a warlord with
 * four times the health of chapter 1's takes four times as long to fell, and a fixed limit
 * would make the 63-star chest unreachable for exactly the players who earned it. Waves
 * widen too, so even the trash stages get a little more room as the campaign goes on.
 */
function turnLimit(chapterNumber: number, isBoss: boolean): number {
  if (isBoss) return 16 + Math.round((chapterNumber - 1) * 2.5);
  return 12 + Math.floor((chapterNumber - 1) / 3) * 2;
}

/**
 * What clearing a stage for the first time pays, on top of the clear itself.
 *
 * Silver everywhere, crystals on the warlord, and a sigil on stages 4 and 7 — so walking
 * the campaign is itself a slow trickle into the Mistgate rather than something that only
 * pays in relics (docs/CONTENT_PLAN_EA01.md §3).
 */
function firstClear(
  plan: ChapterPlan,
  stageNumber: number,
  difficulty: Difficulty,
): StageDefInput['firstClearRewards'] {
  const scale = REWARD_SCALE[difficulty] * (1 + (plan.number - 1) * 0.45);
  if (stageNumber === 7) {
    return { silver: Math.round(2_000 * scale), crystals: 15 };
  }
  return { silver: Math.round(400 * scale) };
}

/**
 * What has to be cleared before this stage opens.
 *
 * Within a chapter it is simply the previous stage, and the first stage of a chapter opens
 * on the previous chapter's warlord — so each difficulty is one continuous line from 1-1
 * to 12-7.
 *
 * A *difficulty* opens on finishing the whole one below it (source-faithful): Hard 1-1
 * wants 12-7 Normal. That is what makes Hard a second pass over the vale rather than an
 * immediately-available alternative to the chapter you are already on, and it is why the
 * level bands can assume a levelled account rather than hedging.
 */
function buildUnlock(
  plan: ChapterPlan,
  stageNumber: number,
  difficulty: Difficulty,
): StageDefInput['unlock'] {
  const prefix = `c${String(plan.number).padStart(2, '0')}`;
  if (stageNumber > 1) return { previousStageKey: `${prefix}_s${stageNumber - 1}_${difficulty}` };

  if (plan.number > 1) {
    const previous = `c${String(plan.number - 1).padStart(2, '0')}`;
    return { previousStageKey: `${previous}_s7_${difficulty}` };
  }

  if (difficulty === 'normal') return {};
  const below: Difficulty = difficulty === 'hard' ? 'normal' : 'hard';
  return { previousStageKey: `c12_s7_${below}` };
}

export const CAMPAIGN_STAGES: StageDefInput[] = CHAPTER_PLANS.flatMap((plan) =>
  DIFFICULTIES.flatMap((difficulty) =>
    Array.from({ length: 7 }, (_, index) => buildStage(plan, index + 1, difficulty)),
  ),
);
