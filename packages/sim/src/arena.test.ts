import { describe, expect, it } from 'vitest';
import { createRng } from '@mistvale/engine';
import { drawComp, poolRoles, type ChampionArenaRecord } from './arena';

/**
 * The Arena diversity measurement's pure half.
 *
 * The battles themselves are measured by `pnpm sim` against the shipped seeds — that is
 * where a balance number belongs. What is pinned here is the two decisions around them:
 * how a comp is drawn, and how a role's figure is arrived at.
 */

function row(fields: Partial<ChampionArenaRecord>): ChampionArenaRecord {
  return {
    championKey: 'x',
    name: 'X',
    role: 'attack',
    battles: 100,
    wins: 50,
    winRate: 0.5,
    ...fields,
  };
}

describe('drawComp', () => {
  it('never fields the same champion twice', () => {
    const pool = ['a', 'b', 'c', 'd', 'e', 'f'];
    const rng = createRng(7);
    for (let draw = 0; draw < 50; draw += 1) {
      const comp = drawComp(pool, 4, rng);
      expect(comp).toHaveLength(4);
      expect(new Set(comp).size).toBe(4);
    }
  });

  it('gives back what there is when the pool is short, rather than padding it', () => {
    // A three-champion pool is a three-champion fight, which the engine runs happily. The
    // caller is what decides whether that is enough to measure.
    expect(drawComp(['a', 'b'], 4, createRng(1))).toHaveLength(2);
  });
});

describe('poolRoles', () => {
  it('pools battles rather than averaging win rates', () => {
    // The case that separates the two: one champion fought twice and won both, another
    // fought a thousand times and won a quarter. A mean of means says 62.5%; the truth is
    // 25.1%, and the truth is what a gate has to read.
    const [band] = poolRoles([
      row({ championKey: 'rare', battles: 2, wins: 2, winRate: 1 }),
      row({ championKey: 'common', battles: 1000, wins: 250, winRate: 0.25 }),
    ]);
    expect(band?.battles).toBe(1002);
    expect(band?.wins).toBe(252);
    expect((band?.winRate ?? 0) * 100).toBeCloseTo(25.1, 1);
  });

  it('leaves a champion that never fought out rather than counting it as a loss', () => {
    const [band] = poolRoles([
      row({ championKey: 'fought', battles: 10, wins: 6 }),
      row({ championKey: 'benched', battles: 0, wins: 0, winRate: 0 }),
    ]);
    expect(band?.champions).toBe(1);
    expect(band?.winRate).toBe(0.6);
  });

  it('omits a role nobody in the roster has', () => {
    const bands = poolRoles([row({ role: 'support' })]);
    expect(bands.map((band) => band.role)).toEqual(['support']);
  });

  it('keeps the roles in the order the game declares them', () => {
    const bands = poolRoles([
      row({ championKey: 's', role: 'support' }),
      row({ championKey: 'a', role: 'attack' }),
      row({ championKey: 'h', role: 'hp' }),
    ]);
    expect(bands.map((band) => band.role)).toEqual(['attack', 'hp', 'support']);
  });
});
