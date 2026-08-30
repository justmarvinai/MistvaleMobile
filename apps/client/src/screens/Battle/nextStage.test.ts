import { describe, expect, it } from 'vitest';
import type { StageDef, StageStanding } from '@mistvale/shared';
import { canRefight, energyCost, nextStage } from './nextStage';

function stage(over: Partial<StageDef> = {}): StageDef {
  return {
    key: 'c01_s1_normal',
    sortOrder: 0,
    mode: 'campaign',
    parentKey: 'chapter_01',
    number: 1,
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

describe('canRefight', () => {
  it('offers a repeat of anything paid for in energy', () => {
    expect(canRefight(stage(), 'campaign')).toBe(true);
  });

  it('refuses a mode paid for in attempts, whatever it calls itself', () => {
    // Every attempt-limited mode in the game is authored at zero energy — a Titan run, a
    // world-boss strike, a Mistspire floor — so the rule falls out of content rather than
    // out of a list of mode names somebody has to remember to extend.
    expect(canRefight(stage({ mode: 'titan', energyCost: 0 }), 'titan')).toBe(false);
    expect(canRefight(stage({ mode: 'spire', energyCost: 0 }), 'spire')).toBe(false);
  });

  it('refuses a fight whose stage the bundle does not have', () => {
    // The Arena's stage key is an opponent and a Deep Run's rooms are synthesised at battle
    // start, so neither resolves to anything the client can offer a repeat of.
    expect(canRefight(undefined, 'arena')).toBe(false);
  });

  it('offers the sandbox, which costs nothing and may be repeated freely', () => {
    expect(canRefight(stage(), 'practice')).toBe(true);
    expect(energyCost(stage(), 'practice')).toBe(0);
    expect(energyCost(stage(), 'campaign')).toBe(8);
  });

  it('refuses the cold open, which is fought once with champions nobody owns', () => {
    expect(canRefight(stage({ mode: 'tutorial', energyCost: 0 }), 'tutorial')).toBe(false);
  });
});

describe('nextStage', () => {
  const first = stage({ key: 'c01_s1_normal', number: 1 });
  const second = stage({ key: 'c01_s2_normal', number: 2 });

  it('follows a stage with the next one along', () => {
    expect(nextStage(first, [first, second], new Map())?.key).toBe('c01_s2_normal');
  });

  it('stops at the end of a chapter rather than walking onto the next difficulty', () => {
    // Hard 1-1 follows Normal 1-7 in the campaign's own ordering, and offering it as
    // "Next" would quietly walk a player onto a wall.
    const last = stage({ key: 'c01_s7_normal', number: 7 });
    const harder = stage({ key: 'c01_s1_hard', number: 1, difficulty: 'hard' });
    expect(nextStage(last, [last, harder], new Map())).toBeNull();
  });

  it('does not offer a stage the server has said is shut', () => {
    const standings = new Map([['c01_s2_normal', standing('c01_s2_normal', { open: false })]]);
    expect(nextStage(first, [first, second], standings)).toBeNull();
  });

  it('treats a stage with no standing as open, the way the chapter page does', () => {
    // Progress arrives after the first paint, and the server is the authority either way.
    expect(nextStage(first, [first, second], new Map())?.key).toBe('c01_s2_normal');
  });

  it('stays inside its own chapter', () => {
    const elsewhere = stage({ key: 'c02_s2_normal', number: 2, parentKey: 'chapter_02' });
    expect(nextStage(first, [first, elsewhere], new Map())).toBeNull();
  });
});
