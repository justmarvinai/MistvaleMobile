import { describe, expect, it } from 'vitest';
import type { ChampionDef } from '@mistvale/shared';
import type { LoadedContent } from './content';
import {
  benchPartners,
  benchmarkedChampions,
  roleIndex,
  type ChampionBenchmark,
  type RoleBand,
} from './benchmark';

/**
 * The champion benchmark's pure half.
 *
 * The fight itself is measured by `pnpm sim` against the shipped seeds, which is where it
 * belongs — a unit test that ran a battle would be asserting a balance number, and balance
 * numbers live in the gates. What is worth pinning here is the arithmetic around the
 * fight: which champions are picked, and how a row is placed against its role.
 */

/** Enough of a champion for the two functions that only read a name and a role. */
function champion(fields: Partial<ChampionDef> & { key: string; role: ChampionDef['role'] }) {
  return {
    name: fields.key,
    isFood: false,
    summonable: true,
    ...fields,
  } as ChampionDef;
}

function content(champions: ChampionDef[]): LoadedContent {
  return { champions: new Map(champions.map((c) => [c.key, c])) } as LoadedContent;
}

function row(fields: Partial<ChampionBenchmark>): ChampionBenchmark {
  return {
    championKey: 'x',
    name: 'X',
    role: 'attack',
    turnsToClear: 40,
    winRate: 1,
    damagePerTurn: 100,
    sustainPerTurn: 0,
    survivalRate: 1,
    runs: 10,
    ...fields,
  };
}

const band = (medianTurns: number): RoleBand => ({ role: 'attack', medianTurns, members: [] });

describe('benchPartners', () => {
  it('takes one of each fighting role, by key, so the baseline never drifts', () => {
    const partners = benchPartners(
      content([
        champion({ key: 'zeta', role: 'attack' }),
        champion({ key: 'alpha', role: 'attack' }),
        champion({ key: 'beta', role: 'defense' }),
        champion({ key: 'gamma', role: 'support' }),
        champion({ key: 'delta', role: 'hp' }),
      ]),
    );
    // Alphabetical within a role, and `hp` is not among the three: the trio is one of each
    // of attack/defense/support so the fight a champion is measured in is an ordinary one.
    expect(partners).toEqual(['alpha', 'beta', 'gamma']);
  });

  it('leaves out food and anything the game cannot give you', () => {
    const partners = benchPartners(
      content([
        champion({ key: 'aaa_food', role: 'attack', isFood: true }),
        champion({ key: 'bbb_locked', role: 'attack', summonable: false }),
        champion({ key: 'ccc_real', role: 'attack' }),
      ]),
    );
    expect(partners).toEqual(['ccc_real']);
  });
});

describe('benchmarkedChampions', () => {
  it('measures the playable roster and not the food', () => {
    // Food is levelled and eaten rather than fielded, so a benchmark row for one would be
    // a number about something nobody takes into a fight.
    expect(
      benchmarkedChampions(
        content([
          champion({ key: 'brew', role: 'attack', isFood: true }),
          champion({ key: 'anuria', role: 'attack' }),
        ]),
      ),
    ).toEqual(['anuria']);
  });

  it('keeps a champion the gate cannot summon, because a player may still hold one', () => {
    // An exclusive paid out by a mission is not summonable and is very much fielded.
    expect(
      benchmarkedChampions(
        content([champion({ key: 'aureleth', role: 'support', summonable: false })]),
      ),
    ).toEqual(['aureleth']);
  });
});

describe('roleIndex', () => {
  it('reads the median as 100%', () => {
    expect(roleIndex(row({ turnsToClear: 40 }), band(40))).toBe(100);
  });

  it('puts a faster champion above the median, not below it', () => {
    // The score is turns and fewer is better, so the index is inverted. Getting this the
    // other way up would rank the best champion last in every column.
    expect(roleIndex(row({ turnsToClear: 20 }), band(40))).toBe(200);
    expect(roleIndex(row({ turnsToClear: 80 }), band(40))).toBe(50);
  });

  it('scores a champion that never cleared at zero rather than at NaN', () => {
    // A champion whose team never won has no turn count to average. Letting the `NaN`
    // through would make every comparison against it false — including the gate's — so a
    // champion that cannot finish reads as the bottom of the column instead.
    expect(roleIndex(row({ turnsToClear: Number.NaN }), band(40))).toBe(0);
    expect(roleIndex(row({ turnsToClear: 0 }), band(40))).toBe(0);
  });
});
