import { describe, expect, it } from 'vitest';
import {
  BATTLE_SPEEDS,
  DEFAULT_SPEED_UNLOCKS,
  canSkipBattle,
  clampSpeed,
  speedsFor,
} from './battle';

/**
 * Playback rules, which are the owner's (2026-08-22) and belong to nobody's screen.
 *
 * Both are about what a player is *allowed to skip watching*, and neither touches an
 * outcome: the speed divides a delay between events the server already decided, and Skip
 * asks for the rest of a fight that was going to resolve the same way regardless. What is
 * worth testing is the gating, because that is progress and progress is the server's.
 */

describe('speedsFor', () => {
  it('gives a fresh account the two rungs it starts with', () => {
    expect(speedsFor({})).toEqual([1, 2]);
  });

  it('opens ×4 on a finished Normal campaign, which is the whole ladder', () => {
    expect(speedsFor({ normal: true })).toEqual([1, 2, 4]);
    // Tied to the ladder itself rather than to a literal, so a rung added without a
    // condition beside it fails here instead of shipping open to everybody.
    expect(speedsFor({ normal: true })).toEqual([...BATTLE_SPEEDS]);
  });

  it('opens nothing further for Brutal, whose rung the owner removed', () => {
    // The ladder stops at ×4 and ×4's condition is Normal, so finishing Brutal as well
    // changes nothing. Asserted rather than left implicit: it is the one consequence of
    // dropping the top rung that a player would actually notice.
    expect(speedsFor({ normal: true, brutal: true })).toEqual([1, 2, 4]);
  });

  it('does not hand out ×4 for finishing Brutal alone', () => {
    // Not reachable in play — Brutal is unlocked by clearing Hard, which is unlocked by
    // Normal — but the rule is a lookup rather than a ladder, and it should say so.
    expect(speedsFor({ brutal: true })).toEqual([1, 2]);
  });

  it('takes its pairing from config rather than from this file', () => {
    // And reads an *absent* rung as always available, which is the same rule that gives a
    // fresh account ×1 and ×2 without either being listed. So gating ×2 and
    // leaving ×4 gated behind Brutal shuts it — an operator locks a speed by naming a
    // difficulty for it, and there is deliberately no way to spell "never".
    expect(speedsFor({ normal: true }, { '2': 'normal', '4': 'brutal' })).toEqual([1, 2]);
    expect(speedsFor({ hard: true }, { '4': 'hard' })).toEqual([1, 2, 4]);
  });

  it('never leaves an account with no speed at all', () => {
    // An operator who gates every rung has misconfigured it; a fight nobody can watch is
    // worse than one that ignores the mistake.
    expect(speedsFor({}, { '1': 'brutal', '2': 'brutal', '4': 'brutal' })).toEqual([1]);
  });

  it('ships the pairing the owner asked for as the default', () => {
    expect(DEFAULT_SPEED_UNLOCKS).toEqual({ '4': 'normal' });
  });
});

describe('clampSpeed', () => {
  it('keeps a remembered speed that is still open', () => {
    expect(clampSpeed(2, [1, 2, 4])).toBe(2);
  });

  it('falls back to the fastest open rung rather than to ×1', () => {
    // A player who unlocked ×4, then had it taken away by a retune, wants the fastest they
    // still have — not to be dropped to the slowest and left to find the control again.
    expect(clampSpeed(4, [1, 2])).toBe(2);
  });

  it('handles a stored value that was never a speed', () => {
    expect(clampSpeed(0, [1, 2])).toBe(2);
    expect(clampSpeed(99, [1, 2])).toBe(2);
  });
});

describe('canSkipBattle', () => {
  it('refuses a stage nobody has beaten', () => {
    expect(canSkipBattle('campaign', false)).toBe(false);
    expect(canSkipBattle('dungeon', false)).toBe(false);
  });

  it('allows one that has been beaten', () => {
    expect(canSkipBattle('campaign', true)).toBe(true);
    expect(canSkipBattle('dungeon', true)).toBe(true);
  });

  it('exempts the Arena, whose stage key is an opponent rather than a place', () => {
    expect(canSkipBattle('arena', false)).toBe(true);
  });

  it('does not exempt the cold open, which exists to be watched', () => {
    expect(canSkipBattle('tutorial', false)).toBe(false);
  });
});
