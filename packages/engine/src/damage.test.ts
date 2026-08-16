import { describe, expect, it } from 'vitest';
import { DEFAULT_COMBAT_CONFIG } from './config';
import { computeDamage, landChance, matchupOf, rollHitQuality } from './damage';
import { scriptedRng, statusMap, unit } from './fixtures';
import { createRng } from './rng';

/**
 * Damage mechanics.
 *
 * These pin the formulas in COMBAT_SYSTEM §4–§6 against hand-computed numbers, so a
 * change to the maths has to be deliberate: an accidental reorder of the crit and
 * mitigation steps, or a sign flip on the disadvantage penalty, fails here rather than
 * quietly shifting every balance number in the game.
 */

const config = DEFAULT_COMBAT_CONFIG;
const statuses = statusMap();

describe('element matchup', () => {
  it.each([
    ['ember', 'verdant', 'advantage'],
    ['verdant', 'tide', 'advantage'],
    ['tide', 'ember', 'advantage'],
    ['verdant', 'ember', 'disadvantage'],
    ['tide', 'verdant', 'disadvantage'],
    ['ember', 'tide', 'disadvantage'],
    ['ember', 'ember', 'neutral'],
  ] as const)('%s attacking %s is %s', (attacker, defender, expected) => {
    expect(matchupOf(attacker, defender)).toBe(expected);
  });

  it('leaves Mist outside the wheel in both directions', () => {
    for (const other of ['ember', 'tide', 'verdant', 'mist'] as const) {
      expect(matchupOf('mist', other)).toBe('neutral');
      expect(matchupOf(other, 'mist')).toBe('neutral');
    }
  });
});

describe('hit quality', () => {
  it('only rolls STRONG with advantage and WEAK with disadvantage', () => {
    const alwaysRolls = scriptedRng([0]);
    expect(rollHitQuality('advantage', alwaysRolls, config)).toBe('strong');
    expect(rollHitQuality('disadvantage', alwaysRolls, config)).toBe('weak');
    expect(rollHitQuality('neutral', alwaysRolls, config)).toBe('normal');
  });

  it('does not consume a roll on a neutral matchup', () => {
    // A neutral hit must not advance the stream, or adding a Mist unit to a team would
    // shift every later roll in the battle and break replays.
    const rng = createRng(7);
    const before = rng.getState();
    rollHitQuality('neutral', rng, config);
    expect(rng.getState()).toEqual(before);
  });

  it('respects the configured chances over many rolls', () => {
    const rng = createRng(11);
    let strong = 0;
    for (let i = 0; i < 20_000; i += 1) {
      if (rollHitQuality('advantage', rng, config) === 'strong') strong += 1;
    }
    expect(strong / 20_000).toBeCloseTo(config.strongHitChance, 1);
  });
});

describe('computeDamage', () => {
  const attacker = unit('ally', 0, { stats: { atk: 1_000, critRate: 0 } });

  /** Mitigation with the defaults: K = 10 × 60 = 600, so 600 DEF halves the hit. */
  const halved = (raw: number): number => raw * (600 / (600 + 600));

  it('halves damage against 600 DEF at level 60', () => {
    const defender = unit('enemy', 0, { stats: { def: 600 } });
    const { amount } = computeDamage(
      { attacker, defender, raw: 2_000, quality: 'normal', matchup: 'neutral' },
      statuses,
      scriptedRng([0.5]),
      { ...config, damageVariance: 0 },
    );
    expect(amount).toBe(Math.round(halved(2_000)));
  });

  it('applies the strong-hit bonus before mitigation', () => {
    const defender = unit('enemy', 0, { stats: { def: 600 } });
    const { amount } = computeDamage(
      { attacker, defender, raw: 2_000, quality: 'strong', matchup: 'advantage' },
      statuses,
      scriptedRng([0.99]), // No crit.
      { ...config, damageVariance: 0 },
    );
    expect(amount).toBe(Math.round(halved(2_000 * 1.3)));
  });

  it('stacks the disadvantage penalty with the weak penalty', () => {
    const defender = unit('enemy', 0, { stats: { def: 600 } });
    const { amount } = computeDamage(
      { attacker, defender, raw: 2_000, quality: 'weak', matchup: 'disadvantage' },
      statuses,
      scriptedRng([0]),
      { ...config, damageVariance: 0 },
    );
    expect(amount).toBe(Math.round(halved(2_000 * 0.8 * 0.7)));
  });

  it('never crits on a weak hit, however high crit rate climbs', () => {
    const critter = unit('ally', 0, { stats: { atk: 1_000, critRate: 100 } });
    const defender = unit('enemy', 0, { stats: { def: 600 } });
    const { crit } = computeDamage(
      { attacker: critter, defender, raw: 1_000, quality: 'weak', matchup: 'disadvantage' },
      statuses,
      scriptedRng([0]),
      { ...config, damageVariance: 0 },
    );
    expect(crit).toBe(false);
  });

  it('multiplies by crit damage on a crit', () => {
    const critter = unit('ally', 0, { stats: { atk: 1_000, critRate: 100, critDmg: 50 } });
    const defender = unit('enemy', 0, { stats: { def: 600 } });
    const { amount, crit } = computeDamage(
      { attacker: critter, defender, raw: 2_000, quality: 'normal', matchup: 'neutral' },
      statuses,
      scriptedRng([0]),
      { ...config, damageVariance: 0 },
    );
    expect(crit).toBe(true);
    expect(amount).toBe(Math.round(halved(2_000 * 1.5)));
  });

  it('lends crit chance on an advantaged hit', () => {
    const attackerAt10 = unit('ally', 0, { stats: { critRate: 10 } });
    const defender = unit('enemy', 0);
    // 10% base + 15pp advantage = 25%; a roll of 0.2 crits only with the bonus.
    const { crit } = computeDamage(
      { attacker: attackerAt10, defender, raw: 100, quality: 'normal', matchup: 'advantage' },
      statuses,
      scriptedRng([0.2]),
      { ...config, damageVariance: 0 },
    );
    expect(crit).toBe(true);
  });

  it('honours ignore-DEF', () => {
    const defender = unit('enemy', 0, { stats: { def: 600 } });
    const full = computeDamage(
      { attacker, defender, raw: 2_000, quality: 'normal', matchup: 'neutral' },
      statuses,
      scriptedRng([0.5]),
      { ...config, damageVariance: 0 },
    );
    const piercing = computeDamage(
      { attacker, defender, raw: 2_000, quality: 'normal', matchup: 'neutral', ignoreDefPct: 1 },
      statuses,
      scriptedRng([0.5]),
      { ...config, damageVariance: 0 },
    );
    expect(piercing.amount).toBe(2_000);
    expect(piercing.amount).toBeGreaterThan(full.amount);
  });

  it('skips mitigation entirely for damage that bypasses defence', () => {
    const defender = unit('enemy', 0, { stats: { def: 5_000 } });
    const { amount } = computeDamage(
      { attacker, defender, raw: 500, quality: 'normal', matchup: 'neutral', bypassDefence: true },
      statuses,
      scriptedRng([0.5]),
      { ...config, damageVariance: 0 },
    );
    expect(amount).toBe(500);
  });

  it('increases damage taken under Weaken and reduces it under Strengthen', () => {
    const weakened = unit('enemy', 0, { stats: { def: 600 } });
    weakened.debuffs.push({ key: 'weaken_25', turns: 2, source: null, stacks: 1 });
    const strengthened = unit('enemy', 1, { stats: { def: 600 } });
    strengthened.buffs.push({ key: 'strengthen_25', turns: 2, source: null, stacks: 1 });

    const roll = () => scriptedRng([0.5]);
    const base = computeDamage(
      {
        attacker,
        defender: unit('enemy', 2, { stats: { def: 600 } }),
        raw: 2_000,
        quality: 'normal',
        matchup: 'neutral',
      },
      statuses,
      roll(),
      { ...config, damageVariance: 0 },
    ).amount;
    const up = computeDamage(
      { attacker, defender: weakened, raw: 2_000, quality: 'normal', matchup: 'neutral' },
      statuses,
      roll(),
      { ...config, damageVariance: 0 },
    ).amount;
    const down = computeDamage(
      { attacker, defender: strengthened, raw: 2_000, quality: 'normal', matchup: 'neutral' },
      statuses,
      roll(),
      { ...config, damageVariance: 0 },
    ).amount;

    expect(up).toBe(Math.round(base * 1.25));
    expect(down).toBe(Math.round(base * 0.75));
  });

  it('never deals less than one point', () => {
    const tank = unit('enemy', 0, { stats: { def: 100_000 } });
    const { amount } = computeDamage(
      { attacker, defender: tank, raw: 1, quality: 'weak', matchup: 'disadvantage' },
      statuses,
      scriptedRng([0.5]),
      config,
    );
    expect(amount).toBe(1);
  });

  it('keeps variance inside the configured band', () => {
    const defender = unit('enemy', 0, { stats: { def: 600 } });
    const rng = createRng(3);
    const expected = halved(2_000);
    for (let i = 0; i < 500; i += 1) {
      const { amount } = computeDamage(
        { attacker, defender, raw: 2_000, quality: 'normal', matchup: 'neutral' },
        statuses,
        rng,
        config,
      );
      expect(amount).toBeGreaterThanOrEqual(Math.floor(expected * 0.95));
      expect(amount).toBeLessThanOrEqual(Math.ceil(expected * 1.05));
    }
  });
});

describe('landChance', () => {
  it('sits at parity when accuracy matches resistance', () => {
    expect(landChance(50, 50, config)).toBeCloseTo(0.9, 5);
  });

  it('caps the accuracy bonus at the documented delta', () => {
    expect(landChance(78, 50, config)).toBeCloseTo(0.97, 5);
    // Beyond +28 more accuracy buys nothing.
    expect(landChance(200, 50, config)).toBeCloseTo(0.97, 5);
  });

  it('loses about a percentage point per point of resistance above accuracy', () => {
    expect(landChance(0, 10, config)).toBeCloseTo(0.8, 5);
    expect(landChance(0, 40, config)).toBeCloseTo(0.5, 5);
  });

  it('never falls below the floor', () => {
    expect(landChance(0, 1_000, config)).toBeCloseTo(config.accuracyMinLandChance, 5);
  });

  it('rises monotonically with accuracy', () => {
    let previous = 0;
    for (let accuracy = 0; accuracy <= 120; accuracy += 5) {
      const chance = landChance(accuracy, 60, config);
      expect(chance).toBeGreaterThanOrEqual(previous);
      previous = chance;
    }
  });
});
