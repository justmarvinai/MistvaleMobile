import { describe, expect, it } from 'vitest';
import { DEFAULT_COMBAT_CONFIG } from './config';
import { statusMap, unit } from './fixtures';
import {
  advanceToNextActor,
  applyTurnMeter,
  compareForTurnOrder,
  consumeTurn,
  projectTurnOrder,
  resetMeters,
} from './turnmeter';

/**
 * Turn meter.
 *
 * Tempo is the stat the whole game is balanced around, so these tests pin both the
 * arithmetic (SPD × 0.07 per tick) and the tie-breaks, which decide who moves first in
 * every mirror match (COMBAT_SYSTEM §3).
 */

const config = DEFAULT_COMBAT_CONFIG;
const statuses = statusMap();

describe('advanceToNextActor', () => {
  it('takes about 14.3 ticks to fill a bar at 100 speed', () => {
    const solo = unit('ally', 0, { stats: { spd: 100 } });
    const next = advanceToNextActor([solo], statuses, config, 'ally');
    expect(next?.ticks).toBe(Math.ceil(100 / (100 * 0.07)));
    expect(next?.ticks).toBe(15);
    expect(solo.tm).toBeGreaterThanOrEqual(100);
  });

  it('lets the faster unit act first', () => {
    const quick = unit('ally', 0, { stats: { spd: 150 } });
    const slow = unit('enemy', 0, { stats: { spd: 90 } });
    const next = advanceToNextActor([quick, slow], statuses, config, 'ally');
    expect(next?.unit).toBe(quick);
  });

  it('breaks an exact tie on the priority side, then on slot', () => {
    const ally = unit('ally', 1, { stats: { spd: 100 } });
    const enemy = unit('enemy', 0, { stats: { spd: 100 } });
    expect(advanceToNextActor([ally, enemy], statuses, config, 'ally')?.unit).toBe(ally);

    resetMeters([ally, enemy]);
    // Arena hands ties to the defender instead.
    expect(advanceToNextActor([ally, enemy], statuses, config, 'enemy')?.unit).toBe(enemy);
  });

  it('breaks a same-side tie on the lower slot', () => {
    const first = unit('ally', 0, { stats: { spd: 100 } });
    const second = unit('ally', 1, { stats: { spd: 100 } });
    expect(advanceToNextActor([second, first], statuses, config, 'ally')?.unit).toBe(first);
  });

  it('ignores the dead', () => {
    const dead = unit('ally', 0, { stats: { spd: 300 }, alive: false });
    const alive = unit('enemy', 0, { stats: { spd: 90 } });
    expect(advanceToNextActor([dead, alive], statuses, config, 'ally')?.unit).toBe(alive);
  });

  it('returns null when nobody can ever act', () => {
    const frozen = unit('ally', 0, { stats: { spd: 0 } });
    expect(advanceToNextActor([frozen], statuses, config, 'ally')).toBeNull();
  });

  it('accounts for speed buffs and debuffs', () => {
    const hasted = unit('ally', 0, { stats: { spd: 100 } });
    hasted.buffs.push({ key: 'spd_up_30', turns: 2, source: null, stacks: 1 });
    const plain = unit('enemy', 0, { stats: { spd: 120 } });
    // 130 effective beats 120 even though the base is lower.
    expect(advanceToNextActor([hasted, plain], statuses, config, 'ally')?.unit).toBe(hasted);
  });
});

describe('overflow', () => {
  it('keeps the excess after acting, so speed compounds', () => {
    const fast = unit('ally', 0, { stats: { spd: 200 } });
    advanceToNextActor([fast], statuses, config, 'ally');
    const overflow = fast.tm - 100;
    expect(overflow).toBeGreaterThan(0);
    consumeTurn(fast);
    expect(fast.tm).toBeCloseTo(overflow, 6);
  });

  it('lets a much faster unit act twice before a slow one acts once', () => {
    const fast = unit('ally', 0, { stats: { spd: 220 } });
    const slow = unit('enemy', 0, { stats: { spd: 100 } });
    const acted: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const next = advanceToNextActor([fast, slow], statuses, config, 'ally');
      if (!next) break;
      acted.push(next.unit.ref.side);
      consumeTurn(next.unit);
    }
    expect(acted.filter((side) => side === 'ally').length).toBeGreaterThan(
      acted.filter((side) => side === 'enemy').length,
    );
  });
});

describe('applyTurnMeter', () => {
  it('fills and depletes as a percentage of a whole bar', () => {
    const target = unit('enemy', 0);
    target.tm = 40;
    applyTurnMeter(target, 30);
    expect(target.tm).toBe(70);
    applyTurnMeter(target, -50);
    expect(target.tm).toBe(20);
  });

  it('floors at zero rather than going negative', () => {
    const target = unit('enemy', 0);
    target.tm = 10;
    applyTurnMeter(target, -100);
    expect(target.tm).toBe(0);
  });

  it('can push a unit past a full bar, stealing the next turn', () => {
    const target = unit('ally', 0);
    target.tm = 80;
    applyTurnMeter(target, 100);
    expect(target.tm).toBeGreaterThanOrEqual(100);
  });
});

describe('projectTurnOrder', () => {
  it('predicts the same order the simulation produces', () => {
    const build = () => [
      unit('ally', 0, { stats: { spd: 150 } }),
      unit('ally', 1, { stats: { spd: 100 } }),
      unit('enemy', 0, { stats: { spd: 120 } }),
    ];

    const projected = projectTurnOrder(build(), statuses, config, 'ally', 6);

    const simulated: typeof projected = [];
    const units = build();
    for (let i = 0; i < 6; i += 1) {
      const next = advanceToNextActor(units, statuses, config, 'ally');
      if (!next) break;
      simulated.push(next.unit.ref);
      consumeTurn(next.unit);
    }

    expect(projected).toEqual(simulated);
  });

  it('returns nothing when no unit can act', () => {
    expect(
      projectTurnOrder([unit('ally', 0, { stats: { spd: 0 } })], statuses, config, 'ally'),
    ).toEqual([]);
  });
});

describe('compareForTurnOrder', () => {
  it('orders by meter first', () => {
    const high = unit('ally', 0);
    high.tm = 120;
    const low = unit('ally', 1);
    low.tm = 110;
    expect(compareForTurnOrder(high, low, 'ally')).toBeLessThan(0);
  });
});
