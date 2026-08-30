import { describe, expect, it } from 'vitest';
import { diffFields, rootField } from './cache';

/**
 * The publish diff, field by field (gap G2).
 *
 * It is what an operator makes a publish decision on, so it is worth pinning as pure
 * arithmetic rather than only through a live publish: what a diff has to do is name the
 * thing that changed, and the failure it used to have — naming the *container* of the
 * thing that changed — reads as correct until you are the one looking for the digit.
 */

const paths = (rows: { path: string }[]): string[] => rows.map((row) => row.path);

describe('diffFields', () => {
  it('names the leaf that moved rather than the block holding it', () => {
    // The defect this exists for: one point of attack rendered the whole stat block twice.
    const rows = diffFields(
      { baseStats: { hp: 100, atk: 10, def: 5 } },
      { baseStats: { hp: 100, atk: 11, def: 5 } },
    );
    expect(paths(rows)).toEqual(['baseStats.atk']);
    expect(rows[0]).toMatchObject({ before: 10, after: 11 });
  });

  it('indexes into arrays, and into arrays of arrays', () => {
    // A stage's `waves` is enemies inside waves. A one-enemy retune used to print the
    // whole plan on both sides.
    const rows = diffFields(
      { waves: [[{ enemyKey: 'a' }], [{ enemyKey: 'b' }, { enemyKey: 'c' }]] },
      { waves: [[{ enemyKey: 'a' }], [{ enemyKey: 'b' }, { enemyKey: 'z' }]] },
    );
    expect(paths(rows)).toEqual(['waves[1][1].enemyKey']);
  });

  it('reports a longer array as the entries that appeared', () => {
    const rows = diffFields({ tags: ['a'] }, { tags: ['a', 'b'] });
    expect(paths(rows)).toEqual(['tags[1]']);
    expect(rows[0]).toMatchObject({ before: undefined, after: 'b' });
  });

  it('says nothing about a field nobody touched', () => {
    expect(diffFields({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 2 } })).toEqual([]);
  });

  it('reports a whole field when its shape changed, not the shape', () => {
    // An object replaced by a string is one edit. Walking it would describe the shapes
    // rather than the change, which is the diff talking about itself.
    const rows = diffFields({ aura: { stat: 'atk', pct: 10 } }, { aura: 'none' });
    expect(paths(rows)).toEqual(['aura']);
    expect(rows[0]?.after).toBe('none');
  });

  it('collapses a rewrite back to one row rather than printing forty', () => {
    // Past the cap the old behaviour is the right one: "the waves were rewritten" is a
    // better account of a rewrite than twenty rows each naming one enemy.
    const before = { waves: Array.from({ length: 20 }, (_, i) => ({ enemyKey: `a${i}` })) };
    const after = { waves: Array.from({ length: 20 }, (_, i) => ({ enemyKey: `z${i}` })) };
    const rows = diffFields(before, after);
    expect(paths(rows)).toEqual(['waves']);
    expect(rows[0]?.after).toEqual(after.waves);
  });

  it('keeps a change just under the cap broken down', () => {
    // The other side of the same boundary, so the cap is a threshold rather than a guess.
    const before = { waves: Array.from({ length: 12 }, (_, i) => ({ enemyKey: `a${i}` })) };
    const after = { waves: Array.from({ length: 12 }, (_, i) => ({ enemyKey: `z${i}` })) };
    expect(diffFields(before, after)).toHaveLength(12);
  });

  it('handles a field that appeared and one that went', () => {
    const rows = diffFields({ gone: 1 }, { fresh: 2 });
    expect(paths(rows)).toEqual(['fresh', 'gone']);
  });

  it('orders by path, so two diffs of the same edit read the same', () => {
    const rows = diffFields({ z: 1, a: 1 }, { z: 2, a: 2 });
    expect(paths(rows)).toEqual(['a', 'z']);
  });

  it('treats null as a value rather than as an object to walk', () => {
    const rows = diffFields({ aura: null }, { aura: { stat: 'atk' } });
    expect(paths(rows)).toEqual(['aura']);
  });
});

describe('rootField', () => {
  it('finds the top-level field a deep path belongs to', () => {
    // What the risk rules read. Matching the whole path would have quietly stopped
    // flagging every balance change the moment the diff got deeper than one level.
    expect(rootField('baseStats.atk')).toBe('baseStats');
    expect(rootField('waves[1][0].enemyKey')).toBe('waves');
    expect(rootField('value')).toBe('value');
  });
});
