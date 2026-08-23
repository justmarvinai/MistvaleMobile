import { describe, expect, it } from 'vitest';
import { nextTier, tierFor, titanCounter, titanRuleProblems } from './titan';
import type { TitanRules, TitanTier } from './content/entities';

const tier = (key: string, damage: number): TitanTier => ({
  key,
  name: key,
  damage,
  rewards: { silver: 100 },
});

const LADDER = [tier('bronze', 100), tier('silver', 500), tier('gold', 2000)];

describe('tierFor', () => {
  it('pays the highest rung a run reached', () => {
    expect(tierFor(700, LADDER)?.key).toBe('silver');
    expect(tierFor(2000, LADDER)?.key).toBe('gold');
    expect(tierFor(99_999, LADDER)?.key).toBe('gold');
  });

  it('pays the rung exactly, not one above it', () => {
    expect(tierFor(500, LADDER)?.key).toBe('silver');
    expect(tierFor(499, LADDER)?.key).toBe('bronze');
  });

  it('pays nothing for a run that reached no rung', () => {
    // A key spent on a team that cannot scratch it is a lesson rather than a payout, and
    // the screen has to be able to say so.
    expect(tierFor(0, LADDER)).toBeNull();
    expect(tierFor(99, LADDER)).toBeNull();
  });

  it('does not assume the ladder was authored in order', () => {
    // Publish validation refuses an out-of-order ladder, but an unpaid run is a worse
    // failure than a slow loop, so this reads the whole list either way.
    const jumbled = [tier('gold', 2000), tier('bronze', 100), tier('silver', 500)];
    expect(tierFor(700, jumbled)?.key).toBe('silver');
  });

  it('has nothing to pay from an empty ladder', () => {
    expect(tierFor(10_000, [])).toBeNull();
  });
});

describe('nextTier', () => {
  it('names the rung a run fell short of', () => {
    expect(nextTier(700, LADDER)?.key).toBe('gold');
    expect(nextTier(0, LADDER)?.key).toBe('bronze');
  });

  it('has nothing above the top', () => {
    expect(nextTier(5000, LADDER)).toBeNull();
  });
});

describe('titanCounter', () => {
  it('gives each keep its own allowance', () => {
    // Keys are per-Titan, not per-account: a second Titan published in Admin must not eat
    // the first one's attempts.
    expect(titanCounter('titan_valewurm')).not.toBe(titanCounter('titan_other'));
  });
});

describe('titanRuleProblems', () => {
  const rules = (tiers: TitanTier[]): TitanRules => ({ turnCap: 50, keysPerDay: 2, tiers });

  it('accepts an ascending ladder that pays', () => {
    expect(titanRuleProblems(rules(LADDER))).toEqual([]);
  });

  it('refuses a Titan with no ladder, because a run could never pay', () => {
    expect(titanRuleProblems(rules([])).join(' ')).toMatch(/at least one damage tier/i);
  });

  it('names the rung that is out of order rather than just refusing', () => {
    const problems = titanRuleProblems(rules([tier('a', 500), tier('b', 100)]));
    expect(problems.join(' ')).toMatch(/tier 2 \("b"\)/i);
  });

  it('catches a duplicated rung key', () => {
    const problems = titanRuleProblems(rules([tier('a', 100), tier('a', 200)]));
    expect(problems.join(' ')).toMatch(/listed twice/i);
  });

  it('catches a rung that pays nothing', () => {
    const problems = titanRuleProblems(rules([{ key: 'a', name: 'A', damage: 100, rewards: {} }]));
    expect(problems.join(' ')).toMatch(/pays nothing/i);
  });
});
