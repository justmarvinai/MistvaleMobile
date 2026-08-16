import { describe, expect, it } from 'vitest';
import { createRng } from '@mistvale/engine';
import {
  GEAR_MAX_LEVEL,
  type GearSetDef,
  type GearSlotDef,
  type GearStatDef,
} from '@mistvale/shared';
import {
  DEFAULT_GEAR_ECONOMY,
  applyUpgrade,
  assembleGearBonus,
  emptyStatBlock,
  gearEconomyFrom,
  gearTablesFrom,
  mainStatValue,
  pickRarity,
  powerScore,
  rollGear,
  sellValue,
  upgradeChance,
  upgradeCost,
  type GearPiece,
} from './stats';

/**
 * Relic arithmetic.
 *
 * These are the numbers a player farms for months, so the bar here is the engine's: pin
 * the endpoints, pin the rules that stop a relic being degenerate, and pin the fact that
 * percentages resolve against the champion's base rather than against each other.
 */

const statDef = (
  key: string,
  overrides: Partial<GearStatDef> & Pick<GearStatDef, 'stat'>,
): GearStatDef => ({
  key,
  sortOrder: 0,
  name: key,
  percent: false,
  canBeMain: true,
  canBeSub: true,
  mainBase: [10, 20, 30, 40, 50, 60],
  mainMax: [40, 80, 120, 160, 200, 240],
  subMin: [1, 2, 3, 4, 5, 6],
  subMax: [2, 4, 6, 8, 10, 12],
  ...overrides,
});

const TABLES = gearTablesFrom({
  gearStats: [
    statDef('atk_flat', { stat: 'atk' }),
    statDef('atk_pct', {
      stat: 'atk',
      percent: true,
      mainBase: [4, 8, 12, 16, 20, 24],
      mainMax: [10, 20, 30, 40, 50, 60],
      subMin: [1, 2, 2, 3, 3, 4],
      subMax: [2, 3, 4, 5, 5, 6],
    }),
    statDef('hp_flat', {
      stat: 'hp',
      mainBase: [170, 340, 510, 680, 850, 1020],
      mainMax: [680, 1360, 2040, 2720, 3400, 4080],
    }),
    statDef('def_flat', { stat: 'def' }),
    statDef('spd_flat', {
      stat: 'spd',
      mainBase: [3, 6, 9, 12, 15, 18],
      mainMax: [8, 15, 23, 30, 38, 45],
      subMin: [1, 2, 2, 3, 3, 4],
      subMax: [2, 3, 4, 5, 5, 6],
    }),
    statDef('crit_rate_pct', { stat: 'critRate', percent: true }),
    statDef('res_flat', { stat: 'res' }),
    statDef('acc_flat', { stat: 'acc' }),
  ],
  gearSlots: [
    {
      key: 'weapon',
      name: 'Weapon',
      allowedMainStats: ['atk'],
      allowsPercentMain: false,
      accessory: false,
      ascensionRequired: 0,
      sortOrder: 10,
    } satisfies GearSlotDef,
    {
      key: 'boots',
      name: 'Boots',
      allowedMainStats: ['hp', 'atk', 'def', 'spd'],
      allowsPercentMain: true,
      accessory: false,
      ascensionRequired: 0,
      sortOrder: 60,
    } satisfies GearSlotDef,
  ],
  gearSets: [
    {
      key: 'swiftwind',
      sortOrder: 0,
      name: 'Swiftwind',
      lore: '',
      pieces: 4,
      bonusType: 'stat',
      bonus: { stat: 'spd', pct: 12 },
    } satisfies GearSetDef,
    {
      key: 'wolfsfang',
      sortOrder: 0,
      name: 'Wolfsfang',
      lore: '',
      pieces: 2,
      bonusType: 'stat',
      bonus: { stat: 'atk', pct: 15 },
    } satisfies GearSetDef,
    {
      key: 'bloodthorn',
      sortOrder: 0,
      name: 'Bloodthorn',
      lore: '',
      pieces: 4,
      bonusType: 'lifesteal',
      bonus: { pct: 30 },
    } satisfies GearSetDef,
  ],
});

const piece = (overrides: Partial<GearPiece> = {}): GearPiece => ({
  setKey: 'wolfsfang',
  slot: 'weapon',
  rank: 6,
  rarity: 'epic',
  level: 0,
  main: { stat: 'atk', percent: false, value: 60 },
  substats: [],
  ...overrides,
});

describe('main stat values', () => {
  it('reads the published floor at +0 and the published ceiling at +16', () => {
    const def = TABLES.stats.get('hp_flat')!;
    expect(mainStatValue(def, 6, 0)).toBe(1020);
    expect(mainStatValue(def, 6, GEAR_MAX_LEVEL)).toBe(4080);
  });

  it('interpolates evenly in between, so no level is a dead one', () => {
    const def = TABLES.stats.get('hp_flat')!;
    expect(mainStatValue(def, 6, 8)).toBe(2550);
    const steps = Array.from(
      { length: 16 },
      (_, index) => mainStatValue(def, 6, index + 1) - mainStatValue(def, 6, index),
    );
    for (const step of steps) expect(step).toBeGreaterThan(0);
  });

  it('scales down by rank', () => {
    const def = TABLES.stats.get('hp_flat')!;
    expect(mainStatValue(def, 1, GEAR_MAX_LEVEL)).toBe(680);
    expect(mainStatValue(def, 6, GEAR_MAX_LEVEL)).toBeGreaterThan(
      mainStatValue(def, 5, GEAR_MAX_LEVEL),
    );
  });

  it('keeps a decimal on percentages and whole numbers on flats', () => {
    expect(Number.isInteger(mainStatValue(TABLES.stats.get('hp_flat')!, 6, 7))).toBe(true);
    expect(mainStatValue(TABLES.stats.get('atk_pct')!, 6, 3)).toBeCloseTo(30.8, 1);
  });

  it('clamps a level outside the track rather than extrapolating past the ceiling', () => {
    const def = TABLES.stats.get('hp_flat')!;
    expect(mainStatValue(def, 6, 99)).toBe(4080);
    expect(mainStatValue(def, 6, -5)).toBe(1020);
  });
});

describe('rolling a relic', () => {
  it('gives a fixed slot the only main stat it allows', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const rolled = rollGear(createRng(seed), TABLES, DEFAULT_GEAR_ECONOMY, {
        setKey: 'wolfsfang',
        slot: 'weapon',
        rank: 5,
        rarity: 'rare',
      });
      expect(rolled.main.stat).toBe('atk');
      // The weapon slot forbids percentages, so the flat form is the only candidate.
      expect(rolled.main.percent).toBe(false);
    }
  });

  it('starts with the substat count its rarity buys', () => {
    const counts = new Map<string, number>();
    for (const rarity of ['common', 'rare', 'legendary'] as const) {
      const rolled = rollGear(createRng(7), TABLES, DEFAULT_GEAR_ECONOMY, {
        setKey: 'wolfsfang',
        slot: 'boots',
        rank: 6,
        rarity,
      });
      counts.set(rarity, rolled.substats.length);
    }
    expect(counts.get('common')).toBe(0);
    expect(counts.get('rare')).toBe(2);
    expect(counts.get('legendary')).toBe(4);
  });

  it('never repeats a stat line, in either form, across a relic', () => {
    for (let seed = 1; seed <= 60; seed += 1) {
      const rolled = rollGear(createRng(seed), TABLES, DEFAULT_GEAR_ECONOMY, {
        setKey: 'swiftwind',
        slot: 'boots',
        rank: 6,
        rarity: 'legendary',
      });
      const forms = [rolled.main, ...rolled.substats].map((line) => `${line.stat}:${line.percent}`);
      expect(new Set(forms).size).toBe(forms.length);
    }
  });

  it('gives a percentage slot the percentage form of a stat that has one', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 40; seed += 1) {
      const rolled = rollGear(createRng(seed), TABLES, DEFAULT_GEAR_ECONOMY, {
        setKey: 'swiftwind',
        slot: 'boots',
        rank: 6,
        rarity: 'common',
      });
      seen.add(`${rolled.main.stat}:${rolled.main.percent}`);
    }
    // Boots allow HP/ATK/DEF/SPD. ATK has a percentage form and must roll as one; SPD
    // has only a flat form and must still be available.
    expect(seen.has('atk:true')).toBe(true);
    expect(seen.has('atk:false')).toBe(false);
    expect(seen.has('spd:false')).toBe(true);
  });

  it('rolls substats inside the published band', () => {
    for (let seed = 1; seed <= 40; seed += 1) {
      const rolled = rollGear(createRng(seed), TABLES, DEFAULT_GEAR_ECONOMY, {
        setKey: 'swiftwind',
        slot: 'boots',
        rank: 6,
        rarity: 'legendary',
      });
      for (const line of rolled.substats) {
        const def = [...TABLES.stats.values()].find(
          (entry) => entry.stat === line.stat && entry.percent === line.percent,
        )!;
        expect(line.value).toBeGreaterThanOrEqual(def.subMin[5]!);
        expect(line.value).toBeLessThanOrEqual(def.subMax[5]!);
        expect(line.rolls).toBe(1);
      }
    }
  });

  it('is deterministic for a seed, so a support query can reproduce a drop', () => {
    const params = {
      setKey: 'swiftwind',
      slot: 'boots' as const,
      rank: 6,
      rarity: 'epic' as const,
    };
    const a = rollGear(createRng(99), TABLES, DEFAULT_GEAR_ECONOMY, params);
    const b = rollGear(createRng(99), TABLES, DEFAULT_GEAR_ECONOMY, params);
    expect(a).toEqual(b);
  });
});

describe('upgrading', () => {
  it('adds a substat at a roll level while there is room', () => {
    const start = piece({
      level: 3,
      rarity: 'rare',
      substats: [
        { stat: 'spd', percent: false, value: 5, rolls: 1 },
        { stat: 'res', percent: false, value: 8, rolls: 1 },
      ],
    });
    const result = applyUpgrade(createRng(3), TABLES, start);
    expect(result.substats).toHaveLength(3);
    expect(result.rolled).not.toBeNull();
    expect(result.rolled?.rolls).toBe(1);
  });

  it('deepens an existing substat once the fourth is filled', () => {
    const start = piece({
      level: 7,
      rarity: 'legendary',
      substats: [
        { stat: 'spd', percent: false, value: 5, rolls: 1 },
        { stat: 'res', percent: false, value: 8, rolls: 1 },
        { stat: 'def', percent: false, value: 6, rolls: 1 },
        { stat: 'hp', percent: false, value: 9, rolls: 1 },
      ],
    });
    const result = applyUpgrade(createRng(3), TABLES, start);
    expect(result.substats).toHaveLength(4);
    const deepened = result.substats.find((line) => (line.rolls ?? 1) > 1);
    expect(deepened).toBeDefined();
    expect(result.rolled?.stat).toBe(deepened?.stat);
  });

  it('moves the main stat on every level, roll level or not', () => {
    const start = piece({ level: 1 });
    const result = applyUpgrade(createRng(1), TABLES, start);
    expect(result.main.value).toBeGreaterThan(start.main.value);
    expect(result.rolled).toBeNull();
  });

  it('leaves substats alone outside a roll level', () => {
    const start = piece({
      level: 5,
      substats: [{ stat: 'spd', percent: false, value: 5, rolls: 1 }],
    });
    const result = applyUpgrade(createRng(1), TABLES, start);
    expect(result.substats).toEqual(start.substats);
  });
});

describe('costs and chances', () => {
  it('is free of risk through +4 and hardest at +16', () => {
    expect(upgradeChance(DEFAULT_GEAR_ECONOMY, 4)).toBe(1);
    expect(upgradeChance(DEFAULT_GEAR_ECONOMY, 16)).toBeLessThan(0.25);
    for (let level = 5; level <= 16; level += 1) {
      expect(upgradeChance(DEFAULT_GEAR_ECONOMY, level)).toBeLessThanOrEqual(
        upgradeChance(DEFAULT_GEAR_ECONOMY, level - 1),
      );
    }
  });

  it('charges a ★6 relic more than a ★5 one for the same level', () => {
    expect(upgradeCost(DEFAULT_GEAR_ECONOMY, 6, 16)).toBeGreaterThan(
      upgradeCost(DEFAULT_GEAR_ECONOMY, 5, 16),
    );
    expect(upgradeCost(DEFAULT_GEAR_ECONOMY, 6, 1)).toBe(3_000);
  });

  it('pays more for a rarer, higher, more upgraded relic', () => {
    const plain = sellValue(DEFAULT_GEAR_ECONOMY, piece({ rank: 1, rarity: 'common', level: 0 }));
    const good = sellValue(
      DEFAULT_GEAR_ECONOMY,
      piece({ rank: 6, rarity: 'legendary', level: 12 }),
    );
    expect(good).toBeGreaterThan(plain * 50);
  });
});

describe('assembling a champion', () => {
  const base = { ...emptyStatBlock(), hp: 10_000, atk: 1_000, def: 800, spd: 100, critRate: 15 };

  it('adds flat lines as written and percentage lines against the base', () => {
    const { bonus } = assembleGearBonus(
      base,
      [
        piece({ main: { stat: 'atk', percent: false, value: 200 } }),
        piece({
          setKey: 'swiftwind',
          slot: 'boots',
          main: { stat: 'atk', percent: true, value: 15 },
        }),
      ],
      TABLES,
    );
    // 200 flat + 15% of the champion's 1,000 base = 350.
    expect(bonus.atk).toBe(350);
  });

  it('does not compound percentages against each other', () => {
    const single = assembleGearBonus(
      base,
      [piece({ main: { stat: 'atk', percent: true, value: 15 } })],
      TABLES,
    ).bonus.atk;
    // Deliberately mismatched sets: this isolates the stat lines from any set bonus.
    const doubled = assembleGearBonus(
      base,
      [
        piece({ main: { stat: 'atk', percent: true, value: 15 } }),
        piece({
          setKey: 'swiftwind',
          slot: 'boots',
          main: { stat: 'atk', percent: true, value: 15 },
        }),
      ],
      TABLES,
    ).bonus.atk;
    expect(doubled).toBe(single * 2);
  });

  it('activates a set only once its piece count is met', () => {
    const two = assembleGearBonus(
      base,
      [piece({ setKey: 'swiftwind' }), piece({ setKey: 'swiftwind', slot: 'boots' })],
      TABLES,
    );
    expect(two.setBonuses).toHaveLength(0);
    expect(two.bonus.spd).toBe(0);

    const four = assembleGearBonus(
      base,
      Array.from({ length: 4 }, () => piece({ setKey: 'swiftwind' })),
      TABLES,
    );
    expect(four.setBonuses[0]).toMatchObject({ setKey: 'swiftwind', copies: 1, equipped: 4 });
    expect(four.bonus.spd).toBe(12);
  });

  it('counts complete copies, so six pieces of a two-piece set is three bonuses', () => {
    const { bonus, setBonuses } = assembleGearBonus(
      base,
      Array.from({ length: 6 }, () => piece({ setKey: 'wolfsfang' })),
      TABLES,
    );
    expect(setBonuses[0]?.copies).toBe(3);
    // 15% of 1,000, three times — plus the six 60-ATK main stats.
    expect(bonus.atk).toBe(60 * 6 + 450);
  });

  it('reports a behaviour set without touching the stat block', () => {
    const { bonus, setBonuses } = assembleGearBonus(
      base,
      Array.from({ length: 4 }, () =>
        piece({ setKey: 'bloodthorn', main: { stat: 'atk', percent: false, value: 0 } }),
      ),
      TABLES,
    );
    expect(setBonuses[0]?.description).toContain('Lifesteal');
    expect(bonus.atk).toBe(0);
  });

  it('ignores a set the content no longer publishes rather than throwing', () => {
    const { setBonuses } = assembleGearBonus(
      base,
      Array.from({ length: 4 }, () => piece({ setKey: 'deleted_set' })),
      TABLES,
    );
    expect(setBonuses).toHaveLength(0);
  });
});

describe('power score', () => {
  it('rises with every stat and stays a whole number', () => {
    const low = powerScore({ ...emptyStatBlock(), atk: 100 }, DEFAULT_GEAR_ECONOMY);
    const high = powerScore({ ...emptyStatBlock(), atk: 200 }, DEFAULT_GEAR_ECONOMY);
    expect(high).toBeGreaterThan(low);
    expect(Number.isInteger(high)).toBe(true);
  });

  it('values speed far above raw health, as the weights intend', () => {
    const fast = powerScore({ ...emptyStatBlock(), spd: 10 }, DEFAULT_GEAR_ECONOMY);
    const beefy = powerScore({ ...emptyStatBlock(), hp: 10 }, DEFAULT_GEAR_ECONOMY);
    expect(fast).toBeGreaterThan(beefy);
  });
});

describe('rarity rolls', () => {
  it('only ever returns a rarity the weights allow', () => {
    for (let seed = 1; seed <= 50; seed += 1) {
      const rarity = pickRarity(createRng(seed), { rare: 1, epic: 1 }, DEFAULT_GEAR_ECONOMY);
      expect(['rare', 'epic']).toContain(rarity);
    }
  });

  it('falls back to the configured defaults when a drop names no distribution', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 200; seed += 1) {
      seen.add(pickRarity(createRng(seed), {}, DEFAULT_GEAR_ECONOMY));
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it('treats an all-zero table as common rather than dividing by zero', () => {
    expect(pickRarity(createRng(1), { rare: 0 }, DEFAULT_GEAR_ECONOMY)).toBe('common');
  });
});

describe('reading the economy from config', () => {
  it('takes published values and keeps defaults for anything missing', () => {
    const economy = gearEconomyFrom({
      'economy.gearSellPerLevel': 0.5,
      'economy.gearUpgradeCostByRank': [1, 1, 1, 1, 1, 1],
    });
    expect(economy.sellPerLevel).toBe(0.5);
    expect(economy.costByRank[0]).toBe(1);
    expect(economy.upgradeSuccess[16]).toBe(DEFAULT_GEAR_ECONOMY.upgradeSuccess[16]);
  });

  it('ignores a malformed row rather than taking the game down', () => {
    const economy = gearEconomyFrom({
      'economy.gearSellBase': 'not an array',
      'economy.gearSellPerLevel': null,
    });
    expect(economy.sellBase).toEqual(DEFAULT_GEAR_ECONOMY.sellBase);
    expect(economy.sellPerLevel).toBe(DEFAULT_GEAR_ECONOMY.sellPerLevel);
  });
});
