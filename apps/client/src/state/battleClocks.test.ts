import { describe, expect, it } from 'vitest';
import { settledOnServer, watchedToTheEnd, type BattleClocks } from './battleClocks';

/**
 * The bug these guard against is the one that shipped: an auto-battle resolves in one
 * response and the results modal opened on that response rather than on the playback
 * that follows it, so every fight in the game gave its outcome away about three seconds
 * in. The distinction is one boolean wide and entirely invisible until somebody watches
 * a fight, which is why it is pinned here.
 */

function clocks(over: Partial<BattleClocks> = {}): BattleClocks {
  return { battle: { status: 'active' }, view: { finished: false }, pending: [], ...over };
}

describe('the two battle clocks', () => {
  it('says nothing is settled before a battle exists', () => {
    const state = clocks({ battle: null });
    expect(settledOnServer(state)).toBe(false);
    expect(watchedToTheEnd(state)).toBe(false);
  });

  it('leaves an active fight open on both clocks', () => {
    const state = clocks({ pending: [1, 2, 3] });
    expect(settledOnServer(state)).toBe(false);
    expect(watchedToTheEnd(state)).toBe(false);
  });

  it('disagrees for the whole length of an auto-battle', () => {
    // The shape of the bug: the server has the answer, the player has thirty turns of
    // animation still to come, and only one of those two facts may open a modal.
    const state = clocks({ battle: { status: 'finished' }, pending: [1, 2, 3] });
    expect(settledOnServer(state)).toBe(true);
    expect(watchedToTheEnd(state)).toBe(false);
  });

  it('agrees once the queue drains', () => {
    const state = clocks({ battle: { status: 'finished' }, view: { finished: true } });
    expect(settledOnServer(state)).toBe(true);
    expect(watchedToTheEnd(state)).toBe(true);
  });

  it('trusts the played battleEnd even while the response is still in flight', () => {
    // `skipToLatest` empties the queue and marks the view finished; the store only
    // stamps `battle.status` when a response arrives. The player has seen the end.
    const state = clocks({ view: { finished: true }, pending: [] });
    expect(settledOnServer(state)).toBe(false);
    expect(watchedToTheEnd(state)).toBe(true);
  });

  it('does not strand a player on a settled fight whose log lacks an ending', () => {
    const state = clocks({ battle: { status: 'finished' }, pending: [] });
    expect(watchedToTheEnd(state)).toBe(true);
  });
});
