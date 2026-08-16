import type { GearStatDefInput, Stat } from '@mistvale/shared';

/**
 * What every rollable relic stat is worth, per rank.
 *
 * These eleven entries are the entire numeric surface of the relic economy: a slot names
 * which stats it takes, and this says how much of each a player gets. The ceilings are
 * the ones in docs/ECONOMY_BALANCE.md §4 — an r6 +16 weapon is 265 ATK because the
 * `mainMax` below says so, not because anything in code does.
 *
 * A stat can exist in two forms and they are tuned separately, so `atk_flat` and
 * `atk_pct` are separate entries. Every array is indexed by rank − 1.
 */

/**
 * How a rank scales a value relative to ★6.
 *
 * Gentle at the top and steep at the bottom, so an early ★2 drop is clearly a stepping
 * stone while the ★5→★6 jump still feels worth chasing.
 */
const RANK_SCALE = [0.17, 0.25, 0.37, 0.52, 0.72, 1] as const;

/** A main stat starts at a quarter of its ceiling and quadruples across +0→+16. */
const MAIN_START_SHARE = 0.25;

/** Scales a ★6 value across all six ranks. */
const byRank = (atSix: number, round: (value: number) => number): number[] =>
  RANK_SCALE.map((scale) => round(atSix * scale));

const whole = (value: number): number => Math.max(1, Math.round(value));
const tenth = (value: number): number => Math.max(0.1, Math.round(value * 10) / 10);

interface StatPlan {
  key: string;
  name: string;
  stat: Stat;
  percent: boolean;
  /** Main-stat ceiling at ★6 +16. Omit for a substat-only line. */
  mainMax?: number;
  /** Substat roll band at ★6. */
  subMin: number;
  subMax: number;
  sortOrder: number;
}

/**
 * The eleven lines.
 *
 * Substat bands are the source-parity ones: SPD 4–6, percentage stats 4–6%, ACC/RES 8–12
 * at ★6. Flat HP/ATK/DEF substats are deliberately weak — that is what makes a
 * percentage roll the thing a player actually wants, and the flat ones sell fodder.
 */
const PLANS: StatPlan[] = [
  {
    key: 'hp_flat',
    name: 'HP',
    stat: 'hp',
    percent: false,
    mainMax: 4_080,
    subMin: 150,
    subMax: 260,
    sortOrder: 10,
  },
  {
    key: 'hp_pct',
    name: 'HP %',
    stat: 'hp',
    percent: true,
    mainMax: 60,
    subMin: 4,
    subMax: 6,
    sortOrder: 11,
  },
  {
    key: 'atk_flat',
    name: 'ATK',
    stat: 'atk',
    percent: false,
    mainMax: 265,
    subMin: 15,
    subMax: 26,
    sortOrder: 20,
  },
  {
    key: 'atk_pct',
    name: 'ATK %',
    stat: 'atk',
    percent: true,
    mainMax: 60,
    subMin: 4,
    subMax: 6,
    sortOrder: 21,
  },
  {
    key: 'def_flat',
    name: 'DEF',
    stat: 'def',
    percent: false,
    mainMax: 265,
    subMin: 15,
    subMax: 26,
    sortOrder: 30,
  },
  {
    key: 'def_pct',
    name: 'DEF %',
    stat: 'def',
    percent: true,
    mainMax: 60,
    subMin: 4,
    subMax: 6,
    sortOrder: 31,
  },
  {
    key: 'spd_flat',
    name: 'SPD',
    stat: 'spd',
    percent: false,
    mainMax: 45,
    subMin: 4,
    subMax: 6,
    sortOrder: 40,
  },
  {
    key: 'crit_rate_pct',
    name: 'C.RATE',
    stat: 'critRate',
    percent: true,
    mainMax: 60,
    subMin: 4,
    subMax: 6,
    sortOrder: 50,
  },
  {
    key: 'crit_dmg_pct',
    name: 'C.DMG',
    stat: 'critDmg',
    percent: true,
    mainMax: 80,
    subMin: 4,
    subMax: 7,
    sortOrder: 51,
  },
  {
    key: 'acc_flat',
    name: 'ACC',
    stat: 'acc',
    percent: false,
    mainMax: 96,
    subMin: 8,
    subMax: 12,
    sortOrder: 60,
  },
  {
    key: 'res_flat',
    name: 'RES',
    stat: 'res',
    percent: false,
    mainMax: 96,
    subMin: 8,
    subMax: 12,
    sortOrder: 61,
  },
];

export const GEAR_STATS: GearStatDefInput[] = PLANS.map((plan) => {
  const round = plan.percent ? tenth : whole;
  const ceiling = plan.mainMax ?? 0;
  return {
    key: plan.key,
    name: plan.name,
    stat: plan.stat,
    percent: plan.percent,
    canBeMain: plan.mainMax !== undefined,
    canBeSub: true,
    mainBase: byRank(ceiling * MAIN_START_SHARE, round),
    mainMax: byRank(ceiling, round),
    subMin: byRank(plan.subMin, round),
    subMax: byRank(plan.subMax, round),
    sortOrder: plan.sortOrder,
  };
});
