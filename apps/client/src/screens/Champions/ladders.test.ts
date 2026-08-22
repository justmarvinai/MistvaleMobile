import { describe, expect, it } from 'vitest';
import type { ChampionDetail } from '@mistvale/shared';
import { ladderRows, type LadderId, type LadderRow } from './ladders';

const ITEMS = [
  { key: 'waking_shard', name: 'Waking Shard' },
  { key: 'essence_pure', name: 'Pure Essence' },
];

function detail(over: {
  champion?: Partial<ChampionDetail['champion']>;
  costs?: Partial<ChampionDetail['costs']>;
} = {}): ChampionDetail {
  return {
    champion: {
      id: 'c1',
      championKey: 'anuria',
      level: 40,
      rank: 4,
      ascension: 4,
      awakening: 0,
      xp: 0,
      locked: false,
      favourite: false,
      levelCap: 40,
      xpToNextLevel: 0,
      power: 1,
      equippedGearIds: [],
      ...over.champion,
    },
    stats: {} as ChampionDetail['stats'],
    gear: [],
    skillUpgrades: {},
    masteries: {} as ChampionDetail['masteries'],
    costs: {
      rankUp: { foodRank: 4, foodCount: 4, silver: 100_000, atLevelCap: true },
      ascend: { items: { essence_pure: 12 }, allowedByRank: true },
      awaken: {
        items: { waking_shard: 4 },
        silver: 20_000,
        ready: { atMaxRank: false, atLevelCap: true, atMaxAscension: true },
      },
      maxRank: 6,
      deepens: true,
      starTrackMoves: true,
      ...over.costs,
    },
  } as ChampionDetail;
}

const row = (rows: LadderRow[], id: LadderId): LadderRow =>
  rows.find((entry) => entry.id === id) as LadderRow;

function rows(over: Parameters<typeof detail>[0] = {}, silver = 1_000_000, held = new Map()) {
  return ladderRows({ detail: detail(over), held, silver, items: ITEMS });
}

describe('ladderRows', () => {
  it('always answers with all four, in the order a player climbs them', () => {
    expect(rows().map((entry) => entry.id)).toEqual(['level', 'rank', 'ascension', 'awakening']);
  });
});

describe('the level row', () => {
  it('reads against the cap of the current star', () => {
    const level = row(rows({ champion: { level: 24, levelCap: 40 } }), 'level');
    expect(level.reading).toBe('24 / 40');
    expect(level.track).toEqual({ filled: 24, total: 40 });
    expect(level.state).toBe('ready');
  });

  it('says what raises the cap once it is reached', () => {
    const level = row(rows({ champion: { level: 40, levelCap: 40 } }), 'level');
    expect(level.state).toBe('done');
    expect(level.blockedBy).toMatch(/star/i);
  });
});

describe('the star row', () => {
  it('offers the next star with its price', () => {
    const rank = row(rows(), 'rank');
    expect(rank.state).toBe('ready');
    expect(rank.reading).toBe('★4 of 6');
    expect(rank.cost).toEqual(['4 × ★4 champions', '100,000 silver']);
    expect(rank.action).toBe('Raise to ★5');
  });

  it('names the level cap as the gate, before it names the silver', () => {
    const rank = row(
      rows({
        champion: { level: 20 },
        costs: { rankUp: { foodRank: 4, foodCount: 4, silver: 100_000, atLevelCap: false } },
      }),
      'rank',
    );
    expect(rank.state).toBe('blocked');
    expect(rank.blockedBy).toMatch(/level cap/i);
  });

  it('says how much silver is missing rather than that some is', () => {
    const rank = row(rows({}, 40_000), 'rank');
    expect(rank.blockedBy).toBe('Short 60,000 silver');
  });

  it('tells a Common it never had a track, rather than that it finished one', () => {
    const rank = row(
      rows({
        champion: { rank: 2 },
        costs: { rankUp: null, maxRank: 2, starTrackMoves: false, deepens: false, awaken: null, ascend: null },
      }),
      'rank',
    );
    expect(rank.state).toBe('absent');
    expect(rank.blockedBy).toMatch(/keep the star/i);
    expect(rank.action).toBe('No star track');
  });

  it('tells a finished Legendary it is fully starred', () => {
    const rank = row(rows({ champion: { rank: 6 }, costs: { rankUp: null } }), 'rank');
    expect(rank.state).toBe('done');
    expect(rank.action).toBe('Fully starred');
  });
});

describe('the ascension row', () => {
  it('prices the next level in published item names', () => {
    const ascension = row(rows({}, 1_000_000, new Map([['essence_pure', 99]])), 'ascension');
    expect(ascension.cost).toEqual(['12 Pure Essence']);
    expect(ascension.state).toBe('ready');
  });

  it('says how many essences are missing', () => {
    const ascension = row(rows({}, 1_000_000, new Map([['essence_pure', 5]])), 'ascension');
    expect(ascension.blockedBy).toBe('Short 7 Pure Essence');
  });

  it('names the star as the gate when the rank caps it', () => {
    const ascension = row(
      rows({ costs: { ascend: { items: { essence_pure: 12 }, allowedByRank: false } } }),
      'ascension',
    );
    expect(ascension.blockedBy).toMatch(/star/i);
  });

  it('tells an Uncommon it never ascends', () => {
    const ascension = row(
      rows({ costs: { ascend: null, awaken: null, deepens: false } }),
      'ascension',
    );
    expect(ascension.state).toBe('absent');
    expect(ascension.action).toBe('Never ascends');
  });
});

describe('the awakening row', () => {
  it('names the gates in the order a player would clear them', () => {
    const held = new Map([['waking_shard', 99]]);
    const notStarred = row(rows({}, 1_000_000, held), 'awakening');
    expect(notStarred.blockedBy).toBe('Take it to ★6 first');

    const notLevelled = row(
      rows(
        {
          costs: {
            awaken: {
              items: { waking_shard: 4 },
              silver: 20_000,
              ready: { atMaxRank: true, atLevelCap: false, atMaxAscension: true },
            },
          },
        },
        1_000_000,
        held,
      ),
      'awakening',
    );
    expect(notLevelled.blockedBy).toMatch(/level cap/i);

    const notAscended = row(
      rows(
        {
          costs: {
            awaken: {
              items: { waking_shard: 4 },
              silver: 20_000,
              ready: { atMaxRank: true, atLevelCap: true, atMaxAscension: false },
            },
          },
        },
        1_000_000,
        held,
      ),
      'awakening',
    );
    expect(notAscended.blockedBy).toMatch(/ascension/i);
  });

  it('offers the rung once every gate is open', () => {
    const ready = row(
      rows(
        {
          costs: {
            awaken: {
              items: { waking_shard: 4 },
              silver: 20_000,
              ready: { atMaxRank: true, atLevelCap: true, atMaxAscension: true },
            },
          },
        },
        1_000_000,
        new Map([['waking_shard', 10]]),
      ),
      'awakening',
    );
    expect(ready.state).toBe('ready');
    expect(ready.cost).toEqual(['4 Waking Shard', '20,000 silver']);
    expect(ready.action).toBe('Awaken to 1');
  });

  it('counts the shards that are missing, after every other gate is open', () => {
    const short = row(
      rows(
        {
          costs: {
            awaken: {
              items: { waking_shard: 4 },
              silver: 20_000,
              ready: { atMaxRank: true, atLevelCap: true, atMaxAscension: true },
            },
          },
        },
        1_000_000,
        new Map([['waking_shard', 1]]),
      ),
      'awakening',
    );
    expect(short.blockedBy).toBe('Short 3 Waking Shard');
  });

  it('tells a Rare that never awakened that it never will, if it cannot', () => {
    const absent = row(rows({ costs: { awaken: null, ascend: null, deepens: false } }), 'awakening');
    expect(absent.state).toBe('absent');
    expect(absent.action).toBe('Never awakens');
  });
});
