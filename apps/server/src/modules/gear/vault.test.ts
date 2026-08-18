import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GEAR_ECONOMY,
  gearEconomyFrom,
  vaultCapacity,
  vaultUpgradeCost,
  vaultUpgradeSlots,
} from './stats';

/**
 * The vault's arithmetic (Q5, answered 2026-08-18).
 *
 * A cap is what makes selling and dismantling matter, and it is bought up in slabs to a
 * ceiling. All three numbers are content, so the tests that matter are the ones about what
 * happens when an operator moves them — including to values that make no sense.
 */

const economy = (overrides: Partial<typeof DEFAULT_GEAR_ECONOMY> = {}) => ({
  ...DEFAULT_GEAR_ECONOMY,
  ...overrides,
});

describe('vault capacity', () => {
  it('is the content base until something is bought', () => {
    expect(vaultCapacity(economy(), 0)).toBe(250);
  });

  it('adds what was bought, and stops at the ceiling', () => {
    expect(vaultCapacity(economy(), 100)).toBe(350);
    expect(vaultCapacity(economy(), 750)).toBe(1_000);
    expect(vaultCapacity(economy(), 5_000)).toBe(1_000);
  });

  it('survives an operator lowering the ceiling under what somebody already holds', () => {
    // A vault that went negative would refuse every drop and every unequip, which is a
    // worse answer to a typo than "you are at your maximum".
    const shrunk = economy({ vaultBaseCapacity: 250, vaultMaxCapacity: 100 });
    expect(vaultCapacity(shrunk, 400)).toBe(250);
    expect(vaultUpgradeSlots(shrunk, 400)).toBe(0);
  });

  it('reads a published config, and falls back rather than throwing on nonsense', () => {
    const published = gearEconomyFrom({
      'economy.vaultBaseCapacity': 40,
      'economy.vaultMaxCapacity': 90,
      'economy.vaultSlotsPerUpgrade': 'ten',
    });
    expect(published.vaultBaseCapacity).toBe(40);
    expect(published.vaultMaxCapacity).toBe(90);
    expect(published.vaultSlotsPerUpgrade).toBe(DEFAULT_GEAR_ECONOMY.vaultSlotsPerUpgrade);
  });
});

describe('buying room', () => {
  it('sells a full slab while there is room for one', () => {
    expect(vaultUpgradeSlots(economy(), 0)).toBe(50);
  });

  it('sells the remainder rather than refusing the last purchase', () => {
    // 250 base + 740 bought = 990, ten short of the ceiling. A button that can never be
    // pressed again is a worse last step than ten slots for the price of fifty.
    expect(vaultUpgradeSlots(economy(), 740)).toBe(10);
  });

  it('offers nothing at the ceiling', () => {
    expect(vaultUpgradeSlots(economy(), 750)).toBe(0);
  });

  it('costs more with each slab already bought', () => {
    const first = vaultUpgradeCost(economy(), 0);
    const second = vaultUpgradeCost(economy(), 50);
    const tenth = vaultUpgradeCost(economy(), 450);
    expect(first).toBe(25_000);
    expect(second).toBeGreaterThan(first);
    expect(tenth).toBeGreaterThan(second * 2);
    // Rounded so the Bazaar shows a price rather than a calculation.
    expect(second % 100).toBe(0);
    expect(tenth % 100).toBe(0);
  });

  it('grows by purchases made rather than by slots held', () => {
    // So retuning how many slots a slab adds does not also change the shape of the curve.
    const narrow = economy({ vaultSlotsPerUpgrade: 25 });
    expect(vaultUpgradeCost(narrow, 25)).toBe(vaultUpgradeCost(economy(), 50));
  });

  it('never charges zero, whatever the config says', () => {
    expect(vaultUpgradeCost(economy({ vaultUpgradeCost: 0 }), 0)).toBeGreaterThan(0);
    expect(vaultUpgradeCost(economy({ vaultUpgradeCostGrowth: 0 }), 100)).toBeGreaterThan(0);
  });
});
