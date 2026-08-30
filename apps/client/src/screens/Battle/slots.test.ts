import { describe, expect, it } from 'vitest';
import { lineupSlots } from './slots';
import { MAX_SLOTS } from '../../game/formation';

describe('lineupSlots', () => {
  it('gives the whole formation to your own champions when nobody is borrowed', () => {
    expect(lineupSlots(0, false)).toEqual({ ownCapacity: 4, free: 4, guestSlot: null });
    expect(lineupSlots(2, false)).toEqual({ ownCapacity: 4, free: 2, guestSlot: null });
    expect(lineupSlots(4, false)).toEqual({ ownCapacity: 4, free: 0, guestSlot: null });
  });

  it('takes a slot rather than adding a fifth, which is the server’s own rule', () => {
    // Three of your own plus a borrowed warden is a full formation — and the picker must
    // stop offering a fourth, because `assertTeamShape` counts the borrow against the four.
    expect(lineupSlots(3, true)).toEqual({ ownCapacity: 3, free: 0, guestSlot: 3 });
    expect(lineupSlots(1, true)).toEqual({ ownCapacity: 3, free: 2, guestSlot: 1 });
  });

  it('never puts the borrowed champion in slot one', () => {
    // The leader is always one of yours: the server assembles your champions first, so an
    // aura is never a borrowed champion's. With nothing picked the guest still stands in
    // slot two, and slot one stays the empty Leader socket.
    expect(lineupSlots(0, true).guestSlot).toBe(1);
  });

  it('stays inside the formation on a team a stale store could hand it', () => {
    // Four remembered champions and a borrow is a state the picker prevents and a store
    // rehydrated from an older build can still produce. Nothing here may answer with a
    // slot the field does not have, or with a negative count.
    const overfull = lineupSlots(MAX_SLOTS, true);
    expect(overfull.free).toBe(0);
    expect(overfull.guestSlot).toBe(MAX_SLOTS - 1);
    expect(lineupSlots(-3, false)).toEqual({ ownCapacity: 4, free: 4, guestSlot: null });
  });
});
