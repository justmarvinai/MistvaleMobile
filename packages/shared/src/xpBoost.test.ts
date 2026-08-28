import { describe, expect, it } from 'vitest';
import { boostedChampionXp, extendXpBoost, xpBoostActive, xpBoostMultiplier } from './xpBoost';

/**
 * The boost's arithmetic, which the server pays by and the client draws.
 *
 * Both halves read this file, so what is checked here is the *rule* rather than either
 * side's use of it: when a timer counts as running, what a fight is worth while it does,
 * and what a second grant does to a boost already ticking.
 */

const NOW = new Date('2026-08-28T12:00:00.000Z');
const inHours = (hours: number) => new Date(NOW.getTime() + hours * 3_600_000);

describe('whether the boost is running', () => {
  it('is not running when it has never been granted', () => {
    expect(xpBoostActive(null, NOW)).toBe(false);
  });

  it('is running while the expiry is ahead of the clock', () => {
    expect(xpBoostActive(inHours(1), NOW)).toBe(true);
    expect(xpBoostActive(inHours(1).toISOString(), NOW)).toBe(true);
  });

  it('stops the instant it runs out, rather than on the next whole hour', () => {
    expect(xpBoostActive(NOW, NOW)).toBe(false);
    expect(xpBoostActive(inHours(-0.001), NOW)).toBe(false);
  });

  it('treats an unparseable expiry as no boost rather than as a permanent one', () => {
    // A column read back as rubbish must fail closed: paying double forever off a bad
    // string is the one outcome worse than paying nothing.
    expect(xpBoostActive('not a date', NOW)).toBe(false);
  });
});

describe('what a fight is worth', () => {
  it('multiplies champion XP while it runs, and not after', () => {
    expect(xpBoostMultiplier(inHours(2), 1.25, NOW)).toBe(1.25);
    expect(xpBoostMultiplier(inHours(-2), 1.25, NOW)).toBe(1);
  });

  it('never pays less than the fight was worth', () => {
    // An operator typing 0.8 into the multiplier means a mistake, not a penalty: a *boost*
    // that quietly took XP away would be the worst possible reading of a reward.
    expect(xpBoostMultiplier(inHours(2), 0.8, NOW)).toBe(1);
    expect(boostedChampionXp(400, 0.5)).toBe(400);
  });

  it('rounds the payout down', () => {
    // 25% of 401 is 100.25, and a quarter of a point of experience is not a thing the
    // engine can pay. Down, so the number shown is one the player actually received.
    expect(boostedChampionXp(401, 1.25)).toBe(501);
    expect(boostedChampionXp(1, 1.25)).toBe(1);
  });

  it('pays nothing on a fight that was worth nothing', () => {
    expect(boostedChampionXp(0, 1.25)).toBe(0);
    expect(boostedChampionXp(-50, 1.25)).toBe(0);
  });
});

describe('granting more of it', () => {
  it('starts from now when nothing is running', () => {
    expect(extendXpBoost(null, 24, NOW, 720).toISOString()).toBe(inHours(24).toISOString());
  });

  it('adds to a boost already ticking rather than replacing it', () => {
    // The rule that matters to a player: claiming a second reward while the first is still
    // running must not throw the rest of the first away.
    expect(extendXpBoost(inHours(6), 24, NOW, 720).toISOString()).toBe(inHours(30).toISOString());
  });

  it('starts from now when the old one has already run out', () => {
    expect(extendXpBoost(inHours(-6), 24, NOW, 720).toISOString()).toBe(inHours(24).toISOString());
  });

  it('honours a fraction of an hour', () => {
    expect(extendXpBoost(null, 0.5, NOW, 720).toISOString()).toBe(inHours(0.5).toISOString());
  });

  it('stops at the ceiling, so a typo is a long boost and not a permanent one', () => {
    expect(extendXpBoost(null, 100_000, NOW, 720).toISOString()).toBe(inHours(720).toISOString());
    // And the ceiling is measured from *now*, so stacking cannot creep past it either.
    expect(extendXpBoost(inHours(700), 100, NOW, 720).toISOString()).toBe(
      inHours(720).toISOString(),
    );
  });

  it('never moves the expiry backwards', () => {
    // Zero hours is a content typo rather than a revocation.
    expect(extendXpBoost(inHours(6), 0, NOW, 720).toISOString()).toBe(inHours(6).toISOString());
    expect(extendXpBoost(inHours(6), -10, NOW, 720).toISOString()).toBe(inHours(6).toISOString());
  });
});
