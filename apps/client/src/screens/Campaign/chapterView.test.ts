import { describe, expect, it } from 'vitest';
import type {
  CampaignChapterDef,
  GearSetDef,
  GearSlotDef,
  StageDef,
  StageStanding,
} from '@mistvale/shared';
import { chestTiers, dropLine, nextChest, stageRows } from './chapterView';

const chapter = {
  key: 'chapter_01',
  sortOrder: 0,
  number: 1,
  name: 'Veilwood Fringe',
  region: 'The Veilwood',
  lore: '',
  backgroundAsset: '',
  setKey: 'set_emberhide',
  starRewards: [
    { stars: 30, rewards: { silver: 1 } },
    { stars: 10, rewards: { silver: 1 } },
    { stars: 60, rewards: { silver: 1 } },
  ],
} satisfies CampaignChapterDef;

function stage(number: number, over: Partial<StageDef> = {}): StageDef {
  return {
    key: `c01_s${number}_normal`,
    sortOrder: 0,
    mode: 'campaign',
    parentKey: 'chapter_01',
    number,
    difficulty: 'normal',
    energyCost: 8,
    waves: [[{ enemyKey: 'e_grunt', level: 3, stars: 1, slot: 0 }]],
    rewards: {
      silverMin: 100,
      silverMax: 200,
      playerXp: 10,
      championXp: 20,
      drops: {
        gearChance: 0.42,
        gearRankMin: 1,
        gearRankMax: 2,
        gearRarityWeights: {},
        gearSlots: ['weapon'],
        gearSetKeys: [],
        items: [],
      },
    },
    starRules: { noDeaths: true, maxTurns: 12 },
    firstClearRewards: {},
    unlock: {},
    presetTeam: [],
    ...over,
  } as StageDef;
}

function standing(key: string, over: Partial<StageStanding> = {}): StageStanding {
  return {
    stageKey: key,
    stars: 0,
    clears: 0,
    bestTurns: null,
    open: true,
    lockedReason: null,
    ...over,
  };
}

describe('stageRows', () => {
  it('numbers the stages the way a player says them', () => {
    const rows = stageRows(chapter, [stage(2), stage(1)], new Map());
    expect(rows.map((row) => row.label)).toEqual(['1-1', '1-2']);
  });

  it('marks only the last stage as the warlord’s', () => {
    const rows = stageRows(chapter, [stage(1), stage(2), stage(3)], new Map());
    expect(rows.map((row) => row.boss)).toEqual([false, false, true]);
  });

  it('opens everything before progress has landed', () => {
    const rows = stageRows(chapter, [stage(1), stage(2)], new Map());
    expect(rows.every((row) => row.open)).toBe(true);
    expect(rows.every((row) => row.stars === 0)).toBe(true);
  });

  it('carries what the server said about a stage', () => {
    const standings = new Map<string, StageStanding>([
      ['c01_s1_normal', standing('c01_s1_normal', { stars: 3, clears: 4, bestTurns: 6 })],
      [
        'c01_s2_normal',
        standing('c01_s2_normal', { open: false, lockedReason: 'Clear 1-1 first.' }),
      ],
    ]);
    const [first, second] = stageRows(chapter, [stage(1), stage(2)], standings);
    expect(first?.stars).toBe(3);
    expect(first?.clears).toBe(4);
    expect(first?.bestTurns).toBe(6);
    expect(second?.open).toBe(false);
    expect(second?.lockedReason).toBe('Clear 1-1 first.');
  });

  it('puts "you are here" on the first open stage short of three stars', () => {
    const standings = new Map<string, StageStanding>([
      ['c01_s1_normal', standing('c01_s1_normal', { stars: 3 })],
      ['c01_s2_normal', standing('c01_s2_normal', { stars: 1 })],
      ['c01_s3_normal', standing('c01_s3_normal', { stars: 0 })],
    ]);
    const rows = stageRows(chapter, [stage(1), stage(2), stage(3)], standings);
    expect(rows.map((row) => row.next)).toEqual([false, true, false]);
  });

  it('marks nowhere when the chapter is finished', () => {
    const standings = new Map<string, StageStanding>([
      ['c01_s1_normal', standing('c01_s1_normal', { stars: 3 })],
      ['c01_s2_normal', standing('c01_s2_normal', { stars: 3 })],
    ]);
    const rows = stageRows(chapter, [stage(1), stage(2)], standings);
    expect(rows.some((row) => row.next)).toBe(false);
  });
});

describe('dropLine', () => {
  const sets = [
    { key: 'set_emberhide', name: 'Emberhide' },
    { key: 'set_tidecall', name: 'Tidecall' },
  ] as GearSetDef[];
  const slots = [
    { key: 'weapon', name: 'Weapon' },
    { key: 'helmet', name: 'Helmet' },
  ] as GearSlotDef[];

  it('inherits the chapter’s set when the stage names none', () => {
    const line = dropLine(stage(1), chapter, sets, slots);
    expect(line.setName).toBe('Emberhide');
    expect(line.slotNames).toEqual(['Weapon']);
    expect(line.gearChancePct).toBe(42);
  });

  it('lets a stage that names its own sets win', () => {
    const own = stage(1, {
      rewards: {
        ...stage(1).rewards,
        drops: { ...stage(1).rewards.drops, gearSetKeys: ['set_tidecall'] },
      },
    });
    expect(dropLine(own, chapter, sets, slots).setName).toBe('Tidecall');
  });

  it('says nothing rather than a key when the set is not published', () => {
    const orphan = { ...chapter, setKey: 'set_missing' };
    expect(dropLine(stage(1), orphan, sets, slots).setName).toBeNull();
  });

  it('falls back to the slot’s own name when content has no row for it', () => {
    const line = dropLine(stage(1), chapter, sets, []);
    expect(line.slotNames).toEqual(['Weapon']);
  });
});

describe('chestTiers', () => {
  it('sorts the track and marks what is paid', () => {
    const tiers = chestTiers(chapter, { chapter_01: [10] });
    expect(tiers).toEqual([
      { stars: 10, claimed: true },
      { stars: 30, claimed: false },
      { stars: 60, claimed: false },
    ]);
  });

  it('treats a chapter with no claims as owing everything', () => {
    expect(chestTiers(chapter, {}).every((tier) => !tier.claimed)).toBe(true);
  });
});

describe('nextChest', () => {
  it('names the next tier above the current star count', () => {
    expect(nextChest(chapter, 12, {})?.stars).toBe(30);
  });

  it('skips a tier already paid', () => {
    expect(nextChest(chapter, 5, { chapter_01: [10] })?.stars).toBe(30);
  });

  it('returns nothing once the track is finished', () => {
    expect(nextChest(chapter, 60, { chapter_01: [10, 30, 60] })).toBeNull();
  });
});
