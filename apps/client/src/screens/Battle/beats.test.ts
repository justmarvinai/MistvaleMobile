import { describe, expect, it } from 'vitest';
import type { Effect } from '../../game/playback';
import { BEAT_MS, NO_BEATS, advanceBeats, beatFor } from './beats';

const effect = (
  id: number,
  kind: Effect['kind'],
  slot = 0,
  side: 'ally' | 'enemy' = 'ally',
): Effect => ({
  id,
  kind,
  ref: { side, slot },
});

describe('advanceBeats', () => {
  it('takes in an effect it has not seen', () => {
    const state = advanceBeats(NO_BEATS, [effect(1, 'impact')], 1000);
    expect(state.live).toHaveLength(1);
    expect(state.live[0]?.since).toBe(1000);
  });

  it('does not restart one it is already playing', () => {
    // The view keeps an effect around for a dozen events. Re-adding it every tick is how a
    // burst turns into a strobe.
    const first = advanceBeats(NO_BEATS, [effect(1, 'impact')], 1000);
    const again = advanceBeats(first, [effect(1, 'impact')], 1100);
    expect(again.live).toHaveLength(1);
    expect(again.live[0]?.since).toBe(1000);
  });

  it('drops one whose time is up', () => {
    const live = advanceBeats(NO_BEATS, [effect(1, 'impact')], 0);
    expect(advanceBeats(live, [effect(1, 'impact')], BEAT_MS.impact + 1).live).toHaveLength(0);
  });

  it('does not bring an expired beat back, however long the view keeps offering it', () => {
    // The mark exists for exactly this: the live list forgets a beat when it ends, and the
    // view goes on offering the same effect for a dozen more events. Without a separate
    // memory the burst would restart on every tick, forever.
    let state = advanceBeats(NO_BEATS, [effect(1, 'impact')], 0);
    const offered = [effect(1, 'impact')];
    for (const now of [BEAT_MS.impact + 1, 5_000, 60_000]) {
      state = advanceBeats(state, offered, now);
      expect(state.live).toHaveLength(0);
    }
  });

  it('keeps a long beat while a short one beside it expires', () => {
    const live = advanceBeats(NO_BEATS, [effect(1, 'strike'), effect(2, 'death')], 0);
    const later = advanceBeats(live, [], BEAT_MS.strike + 1);
    expect(later.live.map((beat) => beat.id)).toEqual([2]);
  });

  it('hands back the same object when nothing has changed', () => {
    // Identity, not equality: the caller runs one unconditional clock and relies on
    // `useState` bailing out, so an idle battlefield must not re-render twenty times a
    // second for the sake of an empty list that happens to be new.
    const idle = advanceBeats(NO_BEATS, [], 1000);
    expect(idle).toBe(NO_BEATS);

    const playing = advanceBeats(NO_BEATS, [effect(1, 'death')], 0);
    expect(advanceBeats(playing, [effect(1, 'death')], 100)).toBe(playing);
  });

  it('carries the mark forward across a lull', () => {
    const first = advanceBeats(NO_BEATS, [effect(7, 'impact')], 0);
    const empty = advanceBeats(first, [], BEAT_MS.impact + 1);
    expect(empty.mark).toBe(7);
    // A later effect still gets in; an earlier id — which cannot happen, since the counter
    // only climbs — would not.
    expect(advanceBeats(empty, [effect(8, 'impact')], 1000).live.map((b) => b.id)).toEqual([8]);
  });
});

describe('beatFor', () => {
  it('finds the newest beat of the kinds asked for, on that unit', () => {
    const state = advanceBeats(
      NO_BEATS,
      [effect(1, 'strike'), effect(5, 'strike'), effect(9, 'impact')],
      0,
    );
    expect(beatFor(state.live, 'ally:0', ['strike'])?.id).toBe(5);
  });

  it('ignores the beats of another unit', () => {
    const state = advanceBeats(NO_BEATS, [effect(1, 'impact', 0), effect(2, 'impact', 1)], 0);
    expect(beatFor(state.live, 'ally:1', ['impact'])?.id).toBe(2);
    expect(beatFor(state.live, 'enemy:0', ['impact'])).toBeUndefined();
  });
});
