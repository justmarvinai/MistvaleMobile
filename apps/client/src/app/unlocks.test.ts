import { describe, expect, it } from 'vitest';
import { UNLOCK_LEVELS, computeUnlocks, type UnlockFlags } from '@mistvale/shared';
import { UNLOCKS, unlockedBetween } from './unlocks';

/**
 * What a level opened.
 *
 * The property worth pinning is that this list and the server's gates cannot drift: the
 * copy is written by hand and the levels are not, so a gate moved in `UNLOCK_LEVELS` moves
 * the celebration with it — and a flag added without copy fails here rather than opening
 * a silent feature.
 */

describe('the unlock catalogue', () => {
  it('covers every flag the server computes, and invents none', () => {
    const flags = Object.keys(computeUnlocks(60)) as (keyof UnlockFlags)[];
    expect([...UNLOCKS].map((unlock) => unlock.key).sort()).toEqual([...flags].sort());
  });

  it('takes its levels from the server’s gates rather than repeating them', () => {
    for (const unlock of UNLOCKS) {
      expect(unlock.level, unlock.key).toBe(UNLOCK_LEVELS[unlock.key]);
    }
  });

  it('is ordered the way the game hands things over', () => {
    const levels = UNLOCKS.map((unlock) => unlock.level);
    expect([...levels].sort((a, b) => a - b)).toEqual(levels);
  });

  it('names each one, in words that fit a banner', () => {
    // A banner is one line, ellipsised by the library at about forty characters — so a
    // title long enough to be cut is a title nobody reads the end of. The paragraph these
    // used to carry went with the modal in C25; the place itself says what it is for.
    for (const unlock of UNLOCKS) {
      expect(unlock.title.length, unlock.key).toBeGreaterThan(0);
      expect(unlock.title.length, `${unlock.key} is too long for one line`).toBeLessThan(32);
    }
  });

  it('gives every unlock a badge to wear', () => {
    // The library draws a fixed-width badge slot whether or not it is handed art, so an
    // unlock with neither a screen nor art of its own is a hole in the card. Most take the
    // picture off the place they open; two open no place — multi-battle is a stepper on
    // the team chooser and the Hall is behind the Arena's title bar — and carry their own.
    const unbadged = UNLOCKS.filter((unlock) => !unlock.screen && !unlock.art);
    expect(
      unbadged.map((unlock) => unlock.key),
      'unlocks with no badge',
    ).toEqual([]);
  });
});

describe('what a level-up opened', () => {
  it('reports the gate a single level crossed', () => {
    const opened = unlockedBetween(4, 5);
    expect(opened.map((unlock) => unlock.key)).toEqual(['bazaar']);
  });

  it('reports every gate when several levels arrive at once', () => {
    // A mission milestone can pay enough XP to move an account four levels; each gate it
    // passed is one the player earned and would otherwise never hear about.
    const opened = unlockedBetween(4, 8);
    expect(opened.map((unlock) => unlock.key)).toEqual([
      'bazaar',
      'multiBattle',
      'events',
      'valePass',
      'arena',
      'hallOfValor',
      'wardens',
    ]);
  });

  it('hands over every one of a level’s unlocks rather than picking one', () => {
    // Level 7 opens the events screen and the season that sits beside it; level 8 is the
    // busiest rung in the game — the Arena, the Hall it pays into, and the wardens who make
    // it a place with other people in it (C37).
    expect(unlockedBetween(6, 7)).toHaveLength(2);
    expect(unlockedBetween(7, 8)).toHaveLength(3);
    expect(unlockedBetween(13, 14)).toHaveLength(2);
  });

  it('says nothing when the level did not move', () => {
    expect(unlockedBetween(5, 5)).toEqual([]);
  });

  it('says nothing when the level went down', () => {
    // Only an operator's account reset does this, and it is not a moment for fanfare.
    expect(unlockedBetween(20, 1)).toEqual([]);
  });

  it('covers the whole ladder between one and the cap without a gap', () => {
    expect(unlockedBetween(1, 60)).toHaveLength(UNLOCKS.length);
  });
});
