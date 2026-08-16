import { describe, expect, it } from 'vitest';
import {
  ENERGY_REGEN_SECONDS,
  MAX_ACCOUNT_LEVEL,
  applyAccountXp,
  computeEnergy,
  energyCapForLevel,
  xpForNextLevel,
} from './progression';

describe('energyCapForLevel', () => {
  it('matches the designed endpoints', () => {
    expect(energyCapForLevel(1)).toBe(20);
    expect(energyCapForLevel(60)).toBe(129);
  });

  it('never decreases as level rises', () => {
    for (let level = 2; level <= MAX_ACCOUNT_LEVEL; level += 1) {
      expect(energyCapForLevel(level)).toBeGreaterThanOrEqual(energyCapForLevel(level - 1));
    }
  });

  it('clamps out-of-range levels instead of producing nonsense', () => {
    expect(energyCapForLevel(0)).toBe(energyCapForLevel(1));
    expect(energyCapForLevel(-5)).toBe(energyCapForLevel(1));
    expect(energyCapForLevel(999)).toBe(energyCapForLevel(MAX_ACCOUNT_LEVEL));
    expect(energyCapForLevel(Number.NaN)).toBe(energyCapForLevel(1));
  });
});

describe('xpForNextLevel', () => {
  it('rises with level and stops at the cap', () => {
    expect(xpForNextLevel(1)).toBe(120);
    expect(xpForNextLevel(10)).toBeGreaterThan(xpForNextLevel(9));
    expect(xpForNextLevel(MAX_ACCOUNT_LEVEL)).toBe(0);
  });
});

describe('applyAccountXp', () => {
  it('accumulates without levelling when below the threshold', () => {
    const result = applyAccountXp({ level: 1, xp: 0 }, 50);
    expect(result).toEqual({ level: 1, xp: 50, levelsGained: 0 });
  });

  it('levels up and carries the remainder', () => {
    const needed = xpForNextLevel(1);
    const result = applyAccountXp({ level: 1, xp: 0 }, needed + 15);
    expect(result.level).toBe(2);
    expect(result.xp).toBe(15);
    expect(result.levelsGained).toBe(1);
  });

  it('levels up exactly on the threshold', () => {
    const result = applyAccountXp({ level: 1, xp: 0 }, xpForNextLevel(1));
    expect(result.level).toBe(2);
    expect(result.xp).toBe(0);
  });

  it('handles multi-level jumps from a single grant', () => {
    const result = applyAccountXp({ level: 1, xp: 0 }, 100_000);
    expect(result.levelsGained).toBeGreaterThan(3);
    expect(result.level).toBeGreaterThan(4);
  });

  it('ignores zero and negative grants', () => {
    expect(applyAccountXp({ level: 3, xp: 10 }, 0)).toEqual({ level: 3, xp: 10, levelsGained: 0 });
    expect(applyAccountXp({ level: 3, xp: 10 }, -99)).toEqual({
      level: 3,
      xp: 10,
      levelsGained: 0,
    });
  });

  it('stops at the cap and zeroes the bar', () => {
    const result = applyAccountXp({ level: MAX_ACCOUNT_LEVEL, xp: 0 }, 999_999);
    expect(result.level).toBe(MAX_ACCOUNT_LEVEL);
    expect(result.xp).toBe(0);
  });
});

describe('computeEnergy', () => {
  const now = new Date('2026-08-16T12:00:00.000Z');

  it('regenerates one point per interval', () => {
    const updatedAt = new Date(now.getTime() - 3 * ENERGY_REGEN_SECONDS * 1000);
    const result = computeEnergy({ storedValue: 10, updatedAt, level: 1, now });
    expect(result.value).toBe(13);
  });

  it('does not regenerate before a full interval elapses', () => {
    const updatedAt = new Date(now.getTime() - (ENERGY_REGEN_SECONDS - 1) * 1000);
    expect(computeEnergy({ storedValue: 10, updatedAt, level: 1, now }).value).toBe(10);
  });

  it('never exceeds the cap through regeneration', () => {
    const updatedAt = new Date(now.getTime() - 100 * ENERGY_REGEN_SECONDS * 1000);
    const result = computeEnergy({ storedValue: 5, updatedAt, level: 1, now });
    expect(result.value).toBe(energyCapForLevel(1));
    expect(result.state.nextTickAt).toBeNull();
    expect(result.state.fullAt).toBeNull();
  });

  it('preserves an over-cap balance from refill items without draining it', () => {
    const overfilled = energyCapForLevel(1) + 40;
    const updatedAt = new Date(now.getTime() - 10 * ENERGY_REGEN_SECONDS * 1000);
    const result = computeEnergy({ storedValue: overfilled, updatedAt, level: 1, now });
    expect(result.value).toBe(overfilled);
    expect(result.state.nextTickAt).toBeNull();
  });

  it('reports the next tick and fill time while below the cap', () => {
    const updatedAt = new Date(now.getTime() - 90 * 1000);
    const result = computeEnergy({ storedValue: 1, updatedAt, level: 1, now });
    expect(result.state.nextTickAt).not.toBeNull();
    expect(result.state.fullAt).not.toBeNull();

    const nextTick = new Date(result.state.nextTickAt as string).getTime();
    // 90 s into a 180 s interval leaves 90 s to the next point.
    expect(Math.round((nextTick - now.getTime()) / 1000)).toBe(90);
    expect(new Date(result.state.fullAt as string).getTime()).toBeGreaterThan(nextTick);
  });

  it('treats a future timestamp as no elapsed time rather than draining energy', () => {
    const updatedAt = new Date(now.getTime() + 60_000);
    expect(computeEnergy({ storedValue: 7, updatedAt, level: 1, now }).value).toBe(7);
  });

  it('uses the level-appropriate cap', () => {
    const updatedAt = new Date(now.getTime() - 500 * ENERGY_REGEN_SECONDS * 1000);
    expect(computeEnergy({ storedValue: 0, updatedAt, level: 60, now }).value).toBe(
      energyCapForLevel(60),
    );
  });
});
