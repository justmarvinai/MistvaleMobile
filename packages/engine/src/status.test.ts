import { describe, expect, it } from 'vitest';
import { DEFAULT_COMBAT_CONFIG } from './config';
import { statusMap, unit } from './fixtures';
import {
  applyStatus,
  breakOnDamage,
  clearAllStatuses,
  isHardCc,
  provokedBy,
  removeStatus,
  skipReason,
  tickDurations,
  tickingStatuses,
} from './status';

/**
 * Status effects.
 *
 * The stacking rules are what stop a team chaining the same buff forever, and the timing
 * rules decide how many turns an effect is really worth. Both are easy to break by
 * accident and impossible to notice from a play session, so each is pinned here
 * (COMBAT_SYSTEM §7).
 */

const config = DEFAULT_COMBAT_CONFIG;
const statuses = statusMap();
const def = (key: string) => statuses.get(key)!;

describe('families', () => {
  it('lets a stronger member replace a weaker one', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('atk_up_25'), 2, null, statuses, config);
    const outcome = applyStatus(target, def('atk_up_50'), 3, null, statuses, config);

    expect(outcome.applied).toBe(true);
    expect(target.buffs).toHaveLength(1);
    expect(target.buffs[0]?.key).toBe('atk_up_50');
    if (outcome.applied) expect(outcome.replaced).toBe('atk_up_25');
  });

  it('refuses a weaker member over a stronger one', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('atk_up_50'), 2, null, statuses, config);
    const outcome = applyStatus(target, def('atk_up_25'), 5, null, statuses, config);

    expect(outcome.applied).toBe(false);
    expect(target.buffs).toHaveLength(1);
    expect(target.buffs[0]?.key).toBe('atk_up_50');
    expect(target.buffs[0]?.turns).toBe(2);
  });

  it('refreshes duration when the same member is reapplied', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('atk_up_25'), 1, null, statuses, config);
    applyStatus(target, def('atk_up_25'), 4, null, statuses, config);

    expect(target.buffs).toHaveLength(1);
    expect(target.buffs[0]?.turns).toBe(4);
  });

  it('never shortens a duration on refresh', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('atk_up_25'), 5, null, statuses, config);
    applyStatus(target, def('atk_up_25'), 2, null, statuses, config);
    expect(target.buffs[0]?.turns).toBe(5);
  });

  it('keeps different families side by side', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('atk_up_25'), 2, null, statuses, config);
    applyStatus(target, def('def_up_30'), 2, null, statuses, config);
    expect(target.buffs).toHaveLength(2);
  });
});

describe('poison stacking', () => {
  it('adds a stack rather than refreshing', () => {
    const target = unit('enemy', 0);
    applyStatus(target, def('poison_5'), 3, null, statuses, config);
    applyStatus(target, def('poison_5'), 3, null, statuses, config);

    expect(target.debuffs).toHaveLength(1);
    expect(target.debuffs[0]?.stacks).toBe(2);
  });

  it('stops at the configured cap', () => {
    const target = unit('enemy', 0);
    for (let i = 0; i < 12; i += 1) {
      applyStatus(target, def('poison_5'), 3, null, statuses, config);
    }
    expect(target.debuffs[0]?.stacks).toBe(config.poisonStackCap);
  });
});

describe('blocks and immunities', () => {
  it('Block Debuffs stops a debuff', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('block_debuffs'), 2, null, statuses, config);
    const outcome = applyStatus(target, def('atk_down_50'), 2, null, statuses, config);

    expect(outcome).toEqual({ applied: false, reason: 'blocked' });
    expect(target.debuffs).toHaveLength(0);
  });

  it('Block Buffs stops a buff', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('block_buffs'), 2, null, statuses, config);
    const outcome = applyStatus(target, def('atk_up_25'), 2, null, statuses, config);
    expect(outcome).toEqual({ applied: false, reason: 'blocked' });
  });

  it('Block Debuffs does not stop a buff', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('block_debuffs'), 2, null, statuses, config);
    expect(applyStatus(target, def('atk_up_25'), 2, null, statuses, config).applied).toBe(true);
  });

  it('bosses shrug off hard crowd control', () => {
    const boss = unit('enemy', 0, {
      isBoss: true,
      boss: { almightyImmunity: true, tmReductionImmune: false },
    });
    for (const key of ['stun', 'freeze', 'sleep', 'provoke']) {
      expect(applyStatus(boss, def(key), 2, null, statuses, config)).toEqual({
        applied: false,
        reason: 'immune',
      });
    }
  });

  it('bosses still take ordinary debuffs', () => {
    const boss = unit('enemy', 0, {
      isBoss: true,
      boss: { almightyImmunity: true, tmReductionImmune: false },
    });
    expect(applyStatus(boss, def('def_down_60'), 2, null, statuses, config).applied).toBe(true);
  });

  it('rejects a status once the bar is full', () => {
    const target = unit('ally', 0);
    const tiny = { ...config, effectBarCap: 2 };
    applyStatus(target, def('atk_up_25'), 2, null, statuses, tiny);
    applyStatus(target, def('def_up_30'), 2, null, statuses, tiny);
    expect(applyStatus(target, def('spd_up_30'), 2, null, statuses, tiny)).toEqual({
      applied: false,
      reason: 'full',
    });
  });

  it('counts buffs and debuffs against separate caps', () => {
    const target = unit('ally', 0);
    const tiny = { ...config, effectBarCap: 1 };
    applyStatus(target, def('atk_up_25'), 2, null, statuses, tiny);
    expect(applyStatus(target, def('atk_down_50'), 2, null, statuses, tiny).applied).toBe(true);
  });
});

describe('durations', () => {
  it('ticks down at the end of the holder’s turn and expires at zero', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('atk_up_25'), 2, null, statuses, config);

    expect(tickDurations(target)).toEqual([]);
    expect(target.buffs[0]?.turns).toBe(1);
    expect(tickDurations(target)).toEqual(['atk_up_25']);
    expect(target.buffs).toHaveLength(0);
  });

  it('expires several statuses in one tick', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('atk_up_25'), 1, null, statuses, config);
    applyStatus(target, def('atk_down_50'), 1, null, statuses, config);
    expect(tickDurations(target).sort()).toEqual(['atk_down_50', 'atk_up_25']);
  });
});

describe('turn skipping', () => {
  it.each([
    ['stun', 'stun'],
    ['freeze', 'freeze'],
    ['sleep', 'sleep'],
  ])('%s skips the turn', (key, expected) => {
    const target = unit('ally', 0);
    applyStatus(target, def(key), 2, null, statuses, config);
    expect(skipReason(target, statuses)).toBe(expected);
  });

  it('leaves a unit free when nothing is holding it', () => {
    expect(skipReason(unit('ally', 0), statuses)).toBeNull();
  });

  it('breaks Sleep on damage but leaves Stun alone', () => {
    const sleeper = unit('ally', 0);
    applyStatus(sleeper, def('sleep'), 3, null, statuses, config);
    expect(breakOnDamage(sleeper, statuses)).toEqual(['sleep']);
    expect(sleeper.debuffs).toHaveLength(0);

    const stunned = unit('ally', 1);
    applyStatus(stunned, def('stun'), 3, null, statuses, config);
    expect(breakOnDamage(stunned, statuses)).toEqual([]);
    expect(stunned.debuffs).toHaveLength(1);
  });

  it('lets Stun replace Sleep, being the stronger member of the family', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('sleep'), 2, null, statuses, config);
    expect(applyStatus(target, def('stun'), 2, null, statuses, config).applied).toBe(true);
    expect(target.debuffs).toHaveLength(1);
    expect(target.debuffs[0]?.key).toBe('stun');
  });
});

describe('provoke', () => {
  it('reports who is forcing the target', () => {
    const target = unit('ally', 0);
    const provoker = { side: 'enemy' as const, slot: 2 };
    applyStatus(target, def('provoke'), 2, provoker, statuses, config);
    expect(provokedBy(target, statuses)).toEqual(provoker);
  });

  it('reports nothing when unprovoked', () => {
    expect(provokedBy(unit('ally', 0), statuses)).toBeNull();
  });
});

describe('bookkeeping', () => {
  it('finds the statuses that tick at a given moment', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('poison_5'), 3, null, statuses, config);
    applyStatus(target, def('atk_up_25'), 3, null, statuses, config);

    const ticking = tickingStatuses(target, 'ownerTurnStart', statuses);
    expect(ticking.map((entry) => entry.def.key)).toEqual(['poison_5']);
  });

  it('removes a named status from either bar', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('atk_up_25'), 2, null, statuses, config);
    applyStatus(target, def('atk_down_50'), 2, null, statuses, config);

    expect(removeStatus(target, 'atk_up_25')).toBe(true);
    expect(removeStatus(target, 'atk_down_50')).toBe(true);
    expect(removeStatus(target, 'nothing_here')).toBe(false);
  });

  it('clears both bars at a wave boundary', () => {
    const target = unit('ally', 0);
    applyStatus(target, def('atk_up_25'), 5, null, statuses, config);
    applyStatus(target, def('poison_5'), 5, null, statuses, config);
    clearAllStatuses(target);
    expect(target.buffs).toHaveLength(0);
    expect(target.debuffs).toHaveLength(0);
  });

  it('classifies hard crowd control', () => {
    for (const key of ['stun', 'freeze', 'sleep', 'provoke']) {
      expect(isHardCc(def(key))).toBe(true);
    }
    for (const key of ['atk_down_50', 'poison_5', 'weaken_25']) {
      expect(isHardCc(def(key))).toBe(false);
    }
  });
});
