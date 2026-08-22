import { describe, expect, it } from 'vitest';
import type { PlayerSummary, RosterChampion } from '@mistvale/shared';
import { abbreviatePower, accountPower, levelReading } from './chip';

function player(over: Partial<PlayerSummary> = {}): PlayerSummary {
  return {
    id: 'p1',
    profileName: 'Test',
    level: 9,
    xp: 124,
    xpToNextLevel: 342,
    silver: 0,
    crystals: 0,
    valorMedals: 0,
    energy: { value: 0, cap: 0, regenSeconds: 180, nextTickAt: null, fullAt: null },
    rosterCapacity: 50,
    tutorialStep: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    avatarChampionKey: null,
    ...over,
  };
}

function champion(power: number, id = String(power)): RosterChampion {
  return {
    id,
    championKey: 'anuria',
    level: 1,
    rank: 1,
    ascension: 0,
    awakening: 0,
    xp: 0,
    locked: false,
    favourite: false,
    levelCap: 10,
    xpToNextLevel: 0,
    power,
    equippedGearIds: [],
  };
}

describe('levelReading', () => {
  it('reads the fraction and both numbers off the span of the current level', () => {
    const reading = levelReading(player());
    expect(reading.fraction).toBeCloseTo(124 / 342);
    expect(reading.have).toBe('124');
    expect(reading.need).toBe('342');
    expect(reading.remaining).toBe(218);
    expect(reading.capped).toBe(false);
  });

  it('groups the thousands a player has to read at a glance', () => {
    const reading = levelReading(player({ xp: 12_400, xpToNextLevel: 34_200 }));
    expect(reading.have).toBe('12,400');
    expect(reading.need).toBe('34,200');
  });

  it('reads full at the cap rather than empty', () => {
    const reading = levelReading(player({ xpToNextLevel: 0, xp: 0 }));
    expect(reading.capped).toBe(true);
    expect(reading.fraction).toBe(1);
    expect(reading.remaining).toBeNull();
  });

  it('never runs past the end of its own bar', () => {
    // The server can pay experience past the span in the same call that levels the account;
    // between that response and the next the client holds both numbers.
    const reading = levelReading(player({ xp: 900, xpToNextLevel: 342 }));
    expect(reading.fraction).toBe(1);
    expect(reading.remaining).toBe(0);
  });
});

describe('accountPower', () => {
  it('adds the four strongest, which is a team rather than a hoard', () => {
    const roster = [100, 400, 200, 50, 300, 10].map((power) => champion(power));
    expect(accountPower(roster)).toBe(400 + 300 + 200 + 100);
  });

  it('sums what there is when there are fewer than four', () => {
    expect(accountPower([champion(120), champion(80)])).toBe(200);
  });

  it('is zero for an account with nobody', () => {
    expect(accountPower([])).toBe(0);
  });

  it('leaves the roster it was handed alone', () => {
    const roster = [champion(100, 'a'), champion(400, 'b')];
    accountPower(roster);
    expect(roster.map((entry) => entry.id)).toEqual(['a', 'b']);
  });
});

describe('abbreviatePower', () => {
  it('leaves a small number alone, grouped', () => {
    expect(abbreviatePower(0)).toBe('0');
    expect(abbreviatePower(940)).toBe('940');
    expect(abbreviatePower(9_999)).toBe('9,999');
  });

  it('shortens thousands', () => {
    expect(abbreviatePower(10_000)).toBe('10K');
    expect(abbreviatePower(12_400)).toBe('12.4K');
    expect(abbreviatePower(193_000)).toBe('193K');
  });

  it('drops the decimal once the whole part is three digits', () => {
    // Three significant figures throughout. `708.4K` on a chip is false precision — the
    // number moves every time a relic is forged, and nobody reads the tenth of a thousand.
    expect(abbreviatePower(708_380)).toBe('708K');
    expect(abbreviatePower(99_900)).toBe('99.9K');
  });

  it('shortens millions', () => {
    expect(abbreviatePower(1_000_000)).toBe('1M');
    expect(abbreviatePower(1_240_000)).toBe('1.2M');
    expect(abbreviatePower(12_400_000)).toBe('12.4M');
  });

  it('drops a decimal that is only a zero', () => {
    expect(abbreviatePower(11_000)).toBe('11K');
    expect(abbreviatePower(2_000_000)).toBe('2M');
  });

  it('answers a nonsense number rather than rendering NaN into the bar', () => {
    expect(abbreviatePower(Number.NaN)).toBe('0');
    expect(abbreviatePower(-5)).toBe('0');
  });
});
