import { describe, expect, it } from 'vitest';
import { createRng } from '@mistvale/engine';
import type { ChampionDef, Rarity, SummonPoolDef } from '@mistvale/shared';
import {
  effectiveRates,
  pityStates,
  poolContents,
  rarityLookup,
  rollMany,
  rollOne,
  type PityCounters,
} from './roll';

/**
 * The summon roll.
 *
 * This is the system a player is most entitled to distrust, so the bar is the engine's:
 * the advertised rate has to be the rate, mercy has to be provably correct rather than
 * plausibly correct, and the guarantees have to hold across bulk simulation and not just
 * on a happy path. Every test here is deterministic — a flaky gacha test is worthless.
 */

const champion = (key: string, rarity: Rarity): ChampionDef =>
  ({ key, rarity, name: key, isFood: false, summonable: true }) as ChampionDef;

const CHAMPIONS: ChampionDef[] = [
  champion('c_one', 'common'),
  champion('c_two', 'common'),
  champion('u_one', 'uncommon'),
  champion('r_one', 'rare'),
  champion('r_two', 'rare'),
  champion('e_one', 'epic'),
  champion('e_two', 'epic'),
  champion('l_one', 'legendary'),
];

const rarityOf = rarityLookup(CHAMPIONS);

const pool = (overrides: Partial<SummonPoolDef> = {}): SummonPoolDef =>
  ({
    key: 'gleaming',
    sortOrder: 0,
    name: 'Gleaming',
    description: '',
    sigilKey: 'sigil_gleaming',
    rates: { rare: 0.915, epic: 0.08, legendary: 0.005 },
    pity: {
      epic: { after: 20, step: 0.02, maxBonus: 1 },
      legendary: { after: 200, step: 0.05, maxBonus: 1 },
    },
    entries: [
      { championKey: 'r_one', weight: 10, featured: false },
      { championKey: 'r_two', weight: 10, featured: false },
      { championKey: 'e_one', weight: 10, featured: false },
      { championKey: 'e_two', weight: 5, featured: true },
      { championKey: 'l_one', weight: 10, featured: false },
    ],
    ...overrides,
  }) as SummonPoolDef;

/** Runs many pulls and returns how often each rarity landed. */
function simulate(
  poolDef: SummonPoolDef,
  pulls: number,
  seed = 1,
): { counts: Record<string, number>; longestEpicDrought: number } {
  const rng = createRng(seed);
  const counts: Record<string, number> = {};
  let counters: PityCounters = {};
  let drought = 0;
  let longest = 0;

  for (let index = 0; index < pulls; index += 1) {
    const outcome = rollOne(rng, poolDef, counters, rarityOf);
    if (!outcome) break;
    counts[outcome.rarity] = (counts[outcome.rarity] ?? 0) + 1;
    counters = outcome.counters;

    if (outcome.rarity === 'epic' || outcome.rarity === 'legendary') {
      longest = Math.max(longest, drought);
      drought = 0;
    } else {
      drought += 1;
    }
  }
  return { counts, longestEpicDrought: Math.max(longest, drought) };
}

describe('effective rates', () => {
  it('is the published table when no mercy has accrued', () => {
    const { rates, bonuses } = effectiveRates(pool(), {});
    expect(rates.rare).toBeCloseTo(0.915, 6);
    expect(rates.epic).toBeCloseTo(0.08, 6);
    expect(rates.legendary).toBeCloseTo(0.005, 6);
    expect(bonuses).toEqual({});
  });

  it('does not start accruing until the threshold is passed', () => {
    expect(effectiveRates(pool(), { epic: 20 }).bonuses.epic).toBeUndefined();
    expect(effectiveRates(pool(), { epic: 21 }).bonuses.epic).toBeCloseTo(0.02, 6);
  });

  it('grows by the published step per pull past the threshold', () => {
    expect(effectiveRates(pool(), { epic: 25 }).bonuses.epic).toBeCloseTo(0.1, 6);
    expect(effectiveRates(pool(), { epic: 30 }).bonuses.epic).toBeCloseTo(0.2, 6);
  });

  it('always sums to one, however much mercy has piled up', () => {
    for (const since of [0, 21, 40, 60, 200, 1000]) {
      const { rates } = effectiveRates(pool(), { epic: since, legendary: since });
      const total = Object.values(rates).reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(1, 6);
    }
  });

  it('takes the bonus off the commonest rarity rather than off other good ones', () => {
    const { rates } = effectiveRates(pool(), { epic: 30 });
    // Rare is the floor here, so it pays for the Epic bonus; Legendary is untouched.
    expect(rates.rare).toBeCloseTo(0.915 - 0.2, 6);
    expect(rates.legendary).toBeCloseTo(0.005, 6);
  });

  it('respects a maxBonus ceiling', () => {
    const capped = pool({ pity: { epic: { after: 10, step: 0.5, maxBonus: 0.25 } } });
    expect(effectiveRates(capped, { epic: 100 }).bonuses.epic).toBeCloseTo(0.25, 6);
  });

  it('never leaves a rarity below zero when mercy exceeds the floor', () => {
    const greedy = pool({ pity: { epic: { after: 1, step: 0.5, maxBonus: 1 } } });
    const { rates } = effectiveRates(greedy, { epic: 50 });
    for (const value of Object.values(rates)) expect(value).toBeGreaterThanOrEqual(0);
    const total = Object.values(rates).reduce((sum, value) => sum + value, 0);
    expect(total).toBeCloseTo(1, 6);
  });
});

describe('counters', () => {
  it('counts up on a miss and resets on a hit', () => {
    const first = rollOne(createRng(1), pool({ rates: { rare: 1 } }), {}, rarityOf)!;
    expect(first.rarity).toBe('rare');
    expect(first.counters.epic).toBe(1);
    expect(first.counters.legendary).toBe(1);

    const hit = rollOne(createRng(1), pool({ rates: { epic: 1 } }), { epic: 40 }, rarityOf)!;
    expect(hit.rarity).toBe('epic');
    expect(hit.counters.epic).toBe(0);
  });

  it('lets a Legendary satisfy the Epic counter too', () => {
    const outcome = rollOne(
      createRng(1),
      pool({ rates: { legendary: 1 } }),
      { epic: 19, legendary: 150 },
      rarityOf,
    )!;
    expect(outcome.rarity).toBe('legendary');
    expect(outcome.counters.epic).toBe(0);
    expect(outcome.counters.legendary).toBe(0);
  });

  it('does not track a rarity the pool has no mercy rule for', () => {
    const outcome = rollOne(createRng(1), pool({ rates: { rare: 1 } }), {}, rarityOf)!;
    expect(outcome.counters.rare).toBeUndefined();
    expect(outcome.counters.common).toBeUndefined();
  });

  it('flags a pull that only happened because of mercy', () => {
    const generous = pool({ pity: { epic: { after: 1, step: 1, maxBonus: 1 } } });
    const outcome = rollOne(createRng(3), generous, { epic: 5 }, rarityOf)!;
    expect(outcome.rarity).toBe('epic');
    expect(outcome.fromMercy).toBe(true);
  });
});

describe('champion selection', () => {
  it('only ever returns a champion of the rolled rarity', () => {
    for (let seed = 1; seed <= 200; seed += 1) {
      const outcome = rollOne(createRng(seed), pool(), {}, rarityOf)!;
      expect(rarityOf(outcome.championKey)).toBe(outcome.rarity);
    }
  });

  it('honours weights within a rarity without touching the rarity odds', () => {
    const seen = new Map<string, number>();
    const rng = createRng(11);
    const epicOnly = pool({ rates: { epic: 1 } });
    for (let index = 0; index < 3_000; index += 1) {
      const outcome = rollOne(rng, epicOnly, {}, rarityOf)!;
      seen.set(outcome.championKey, (seen.get(outcome.championKey) ?? 0) + 1);
    }
    // e_one is weighted 10 against e_two's 5, so roughly two to one.
    const ratio = (seen.get('e_one') ?? 0) / (seen.get('e_two') ?? 1);
    expect(ratio).toBeGreaterThan(1.7);
    expect(ratio).toBeLessThan(2.3);
  });

  it('falls back down the table rather than failing when a rarity has no champion', () => {
    const gap = pool({
      rates: { legendary: 1 },
      entries: [{ championKey: 'r_one', weight: 10, featured: false }],
    });
    const outcome = rollOne(createRng(1), gap, {}, rarityOf)!;
    expect(outcome.championKey).toBe('r_one');
    expect(outcome.rarity).toBe('rare');
  });

  it('returns null when the pool has nothing publishable at all', () => {
    const empty = pool({
      entries: [{ championKey: 'not_a_champion', weight: 10, featured: false }],
    });
    expect(rollOne(createRng(1), empty, {}, rarityOf)).toBeNull();
  });
});

describe('the ×10', () => {
  it('spends exactly ten pulls', () => {
    const results = rollMany(createRng(5), pool(), {}, 10, rarityOf);
    expect(results).toHaveLength(10);
  });

  it('guarantees the floor when nothing earlier reached it', () => {
    const floored = pool({ rates: { rare: 1, epic: 0, legendary: 0 }, tenPullFloor: 'epic' });
    for (let seed = 1; seed <= 40; seed += 1) {
      const results = rollMany(createRng(seed), floored, {}, 10, rarityOf);
      expect(results.filter((entry) => entry.rarity === 'epic')).toHaveLength(1);
      expect(results[9]?.rarity).toBe('epic');
    }
  });

  it('does not spend the guarantee when the floor was already met naturally', () => {
    const floored = pool({ rates: { epic: 1 }, tenPullFloor: 'epic' });
    const results = rollMany(createRng(7), floored, {}, 10, rarityOf);
    expect(results.every((entry) => entry.rarity === 'epic')).toBe(true);
  });

  it('lets the guaranteed pull exceed the floor rather than capping it', () => {
    // Everything is Legendary-weighted; a floor of Epic must not force the last pull down.
    const floored = pool({ rates: { rare: 0.5, legendary: 0.5 }, tenPullFloor: 'epic' });
    const seen = new Set<string>();
    for (let seed = 1; seed <= 60; seed += 1) {
      const results = rollMany(createRng(seed), floored, {}, 10, rarityOf);
      const last = results[9];
      if (last) seen.add(last.rarity);
    }
    expect(seen.has('legendary')).toBe(true);
  });

  it('carries counters across the ten, so mercy can land mid-pull', () => {
    const results = rollMany(createRng(9), pool(), { epic: 19 }, 10, rarityOf);
    const epicAt = results.findIndex((entry) => entry.rarity === 'epic');
    // Whether or not one lands, the counter must move monotonically until it does.
    if (epicAt === -1) {
      expect(results[9]?.counters.epic).toBe(29);
    } else {
      expect(results[epicAt]?.counters.epic).toBe(0);
    }
  });
});

describe('in bulk', () => {
  it('lands close to the published rates over many pulls without mercy', () => {
    const noMercy = pool({ pity: {} });
    const { counts } = simulate(noMercy, 40_000, 42);
    const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
    expect(total).toBe(40_000);
    // Wide enough not to be flaky, tight enough to catch a real distribution bug.
    expect((counts.epic ?? 0) / total).toBeGreaterThan(0.07);
    expect((counts.epic ?? 0) / total).toBeLessThan(0.09);
    expect((counts.rare ?? 0) / total).toBeGreaterThan(0.9);
  });

  it('makes an Epic strictly more likely over time, not less', () => {
    const withMercy = simulate(pool(), 40_000, 42);
    const withoutMercy = simulate(pool({ pity: {} }), 40_000, 42);
    expect(withMercy.counts.epic ?? 0).toBeGreaterThan(withoutMercy.counts.epic ?? 0);
  });

  it('bounds the worst drought, which is what mercy is for', () => {
    // Base 8% Epic with +2%/pull after 20 reaches certainty by pull 66 at the latest.
    const { longestEpicDrought } = simulate(pool(), 40_000, 42);
    expect(longestEpicDrought).toBeLessThan(70);
  });

  it('is reproducible: the same seed gives the same pulls', () => {
    const a = rollMany(createRng(1234), pool(), {}, 10, rarityOf);
    const b = rollMany(createRng(1234), pool(), {}, 10, rarityOf);
    expect(a).toEqual(b);
  });
});

describe('what the player is shown', () => {
  it('reports the chance the next pull will actually use', () => {
    const states = pityStates(pool(), { epic: 30 });
    const epic = states.find((state) => state.rarity === 'epic')!;
    expect(epic.since).toBe(30);
    expect(epic.after).toBe(20);
    expect(epic.currentBonus).toBeCloseTo(0.2, 6);
    expect(epic.effectiveChance).toBeCloseTo(0.28, 6);
  });

  it('lists only the rarities the pool actually has mercy for', () => {
    const states = pityStates(
      pool({ pity: { legendary: { after: 5, step: 0.1, maxBonus: 1 } } }),
      {},
    );
    expect(states.map((state) => state.rarity)).toEqual(['legendary']);
  });

  it('groups the pool by rarity for the full-odds disclosure', () => {
    const contents = poolContents(pool(), rarityOf);
    expect(contents.epic).toEqual(['e_one', 'e_two']);
    expect(contents.legendary).toEqual(['l_one']);
    expect(contents.common).toBeUndefined();
  });
});
