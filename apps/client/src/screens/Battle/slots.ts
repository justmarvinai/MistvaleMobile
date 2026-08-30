import { MAX_SLOTS } from '../../game/formation';

/**
 * Who stands where in a lineup of four, once a borrowed warden can take one of them (C37).
 *
 * Its own module for C28's reason. **Four** things ask this arithmetic — `Lineup` deciding
 * which slot to draw the guest in, `TeamSelect` capping how many of your own you may still
 * pick, `AllyStrip` deciding whether there is room to borrow at all, and the server's
 * `assertTeamShape`, which is the one that actually refuses — and three of those had it
 * written out inline in three files. A picker that lets you compose a team the server
 * refuses is not a layout bug, it is a wrong answer, so it is one function with a test.
 *
 * The borrowed champion never stands in slot one. The server builds the formation with the
 * account's own champions first (`entries` before `push`), so the leader whose aura applies
 * is always one of yours — drawing a borrowed face under the Leader tag would be a claim
 * about auras that is not true.
 */
export interface LineupSlots {
  /** How many of the four the account's own champions may fill. */
  ownCapacity: number;
  /** How many slots are empty right now. A borrow needs one of these. */
  free: number;
  /** Where the borrowed champion stands, or null when nobody is borrowed. */
  guestSlot: number | null;
}

export function lineupSlots(teamSize: number, borrowed: boolean): LineupSlots {
  const taken = Math.min(Math.max(teamSize, 0), MAX_SLOTS);
  const ownCapacity = MAX_SLOTS - (borrowed ? 1 : 0);
  return {
    ownCapacity,
    free: Math.max(0, ownCapacity - taken),
    // Clamped rather than trusted: a remembered team of four plus a borrow is a state the
    // picker prevents and a stale store can still produce, and a guest drawn at index 4 of
    // four slots is a champion nobody can see.
    guestSlot: borrowed ? Math.min(Math.max(taken, 1), MAX_SLOTS - 1) : null,
  };
}
