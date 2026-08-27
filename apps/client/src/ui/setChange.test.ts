import { describe, expect, it } from 'vitest';
import type { ActiveSetBonus } from '@mistvale/shared';
import { describeSetChange, setChanges } from './setChange';

/**
 * The set half of a swap, which is the half a player gets wrong.
 *
 * The numbers were always right and always unexplained: a relic that costs a hundred and
 * forty attack because it broke a four-piece set looks exactly like a worse relic. These
 * cases are the four shapes that change is allowed to take.
 */

const bonus = (setKey: string, copies: number, equipped = copies * 4): ActiveSetBonus => ({
  setKey,
  name: setKey[0]!.toUpperCase() + setKey.slice(1),
  equipped,
  copies,
  description: `${setKey} does a thing`,
});

describe('setChanges', () => {
  it('says nothing when nothing moved', () => {
    const held = [bonus('truestrike', 1), bonus('wolfsfang', 2)];
    expect(setChanges(held, held)).toEqual([]);
  });

  it('names a set that breaks', () => {
    const changes = setChanges([bonus('truestrike', 1)], []);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ setKey: 'truestrike', before: 1, after: 0 });
    expect(describeSetChange(changes[0]!)).toBe('Breaks Truestrike');
  });

  it('names a set that completes', () => {
    const changes = setChanges([], [bonus('reaver', 1)]);
    expect(describeSetChange(changes[0]!)).toBe('Completes Reaver');
    expect(describeSetChange(setChanges([], [bonus('reaver', 2)])[0]!)).toBe('Completes Reaver ×2');
  });

  it('counts copies rather than pieces, in both directions', () => {
    // A six-piece set at two copies losing one is still *on* — and saying so is the point,
    // because "you still have Truestrike" is true and useless.
    const down = setChanges([bonus('truestrike', 2)], [bonus('truestrike', 1)]);
    expect(describeSetChange(down[0]!)).toBe('Truestrike drops to 1 copy');
    const up = setChanges([bonus('truestrike', 1)], [bonus('truestrike', 2)]);
    expect(describeSetChange(up[0]!)).toBe('Truestrike 1 → 2 copies');
  });

  it('puts what breaks before what improves', () => {
    const changes = setChanges([bonus('truestrike', 1)], [bonus('reaver', 1)]);
    expect(changes.map((change) => change.setKey)).toEqual(['truestrike', 'reaver']);
  });

  it('keeps a name for a set that only exists on the losing side', () => {
    // The `after` entry is gone, so the name has to come from `before` — otherwise a broken
    // set is announced by its key, which is the one moment the player most needs the word.
    expect(setChanges([bonus('wolfsfang', 1)], [])[0]!.name).toBe('Wolfsfang');
  });
});
