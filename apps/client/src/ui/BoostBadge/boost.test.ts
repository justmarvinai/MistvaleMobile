import { describe, expect, it } from 'vitest';
import { boostReading, formatRemaining } from './boost';

/**
 * What the badge on the player frame says, and when it says nothing.
 */

const NOW = Date.parse('2026-08-28T12:00:00.000Z');
const inMs = (ms: number) => new Date(NOW + ms).toISOString();

describe('boostReading', () => {
  it('is dim for an account that has never had one', () => {
    expect(boostReading({ until: null }, NOW)).toEqual({
      active: false,
      remainingMs: 0,
      countdown: null,
    });
  });

  it('is dim when the player summary has not arrived yet', () => {
    // The chip renders before the first `/auth/me` settles on a cold boot, and a badge
    // that threw there would take the whole top bar down with it.
    expect(boostReading(undefined, NOW).active).toBe(false);
  });

  it('is lit with a countdown while it runs', () => {
    const reading = boostReading({ until: inMs(90 * 60_000) }, NOW);
    expect(reading.active).toBe(true);
    expect(reading.countdown).toBe('1h 30m');
  });

  it('goes dim the moment it expires rather than at the next tick', () => {
    expect(boostReading({ until: inMs(-1) }, NOW).active).toBe(false);
    expect(boostReading({ until: inMs(0) }, NOW).active).toBe(false);
  });
});

describe('formatRemaining', () => {
  it('counts seconds only in the last minute', () => {
    expect(formatRemaining(45_000)).toBe('45s');
    expect(formatRemaining(59_999)).toBe('59s');
  });

  it('counts minutes for the last hour', () => {
    expect(formatRemaining(60_000)).toBe('1m');
    expect(formatRemaining(59 * 60_000)).toBe('59m');
  });

  it('counts hours and minutes below a day', () => {
    expect(formatRemaining(3_600_000)).toBe('1h');
    expect(formatRemaining(3_600_000 + 5 * 60_000)).toBe('1h 5m');
    expect(formatRemaining(23 * 3_600_000)).toBe('23h');
  });

  it('counts days and hours above one', () => {
    expect(formatRemaining(24 * 3_600_000)).toBe('1d');
    expect(formatRemaining(30 * 3_600_000)).toBe('1d 6h');
    expect(formatRemaining(7 * 24 * 3_600_000)).toBe('7d');
  });

  it('never counts below zero', () => {
    expect(formatRemaining(-5_000)).toBe('0s');
  });

  it('rounds down, so it never claims more time than is left', () => {
    // A badge that reads "1m" for the last fifty-nine seconds promises a minute it does
    // not have; the last minute is the one where a player might actually start a fight.
    expect(formatRemaining(119_000)).toBe('1m');
  });
});
