import { describe, expect, it } from 'vitest';
import { gameDay, gameDayFrom } from './game-day';
import { countersFor, remaining, type DailyCounters } from './daily-counters';

/**
 * When "today" is, and what it costs.
 *
 * These two rules underpin everything with a daily allowance — the Essence Springs
 * rotation, the multi-battle cap, and every quest counter a later phase adds — so the
 * awkward cases are pinned here rather than discovered by a player farming at 3 a.m.
 */

describe('game-day', () => {
  it('runs from the reset hour, not from midnight', () => {
    // Half past three in the morning still belongs to the previous day.
    expect(gameDay(new Date('2026-08-17T03:30:00Z'), 'UTC', 4).date).toBe('2026-08-16');
    expect(gameDay(new Date('2026-08-17T04:00:00Z'), 'UTC', 4).date).toBe('2026-08-17');
  });

  it('steps back over a month boundary', () => {
    expect(gameDay(new Date('2026-09-01T02:00:00Z'), 'UTC', 4).date).toBe('2026-08-31');
    expect(gameDay(new Date('2026-01-01T01:00:00Z'), 'UTC', 4).date).toBe('2025-12-31');
  });

  it('reports the weekday of the game-day it landed on', () => {
    // 2026-08-16 is a Sunday, which is index 0 — the index a rotation is written in.
    expect(gameDay(new Date('2026-08-17T03:30:00Z'), 'UTC', 4).weekday).toBe(0);
    expect(gameDay(new Date('2026-08-17T04:30:00Z'), 'UTC', 4).weekday).toBe(1);
  });

  it('reads the reset in the configured timezone', () => {
    // 06:00 UTC is 08:00 in Berlin — past a 04:00 reset there, before one in UTC+0 terms
    // only because the wall clock differs. The timezone is the whole point.
    const instant = new Date('2026-08-17T02:00:00Z');
    expect(gameDay(instant, 'UTC', 4).date).toBe('2026-08-16');
    expect(gameDay(instant, 'Europe/Berlin', 4).date).toBe('2026-08-17');
  });

  it('falls back to UTC rather than throwing on a nonsense timezone', () => {
    // An operator typo must cost a rotation, not every request that touches a daily rule.
    expect(gameDay(new Date('2026-08-17T12:00:00Z'), 'Nowhere/Nothing', 4).date).toBe('2026-08-17');
  });

  it('takes the hour and timezone from published config, with defaults', () => {
    const instant = new Date('2026-08-17T03:00:00Z');
    expect(gameDayFrom({}, instant).date).toBe('2026-08-16');
    expect(gameDayFrom({ 'ops.dailyResetHour': 0 }, instant).date).toBe('2026-08-17');
    expect(gameDayFrom({ 'ops.dailyResetTimezone': 42 }, instant).date).toBe('2026-08-16');
  });
});

describe('daily counters', () => {
  const config = { 'ops.dailyResetTimezone': 'UTC', 'ops.dailyResetHour': 4 };
  const now = new Date('2026-08-17T12:00:00Z');

  it('reads a stale day as zero, which is what makes a reset job unnecessary', () => {
    const stale = countersFor(
      { dailyCounters: { multiBattle: 30 }, dailyCountersDay: '2026-08-16' },
      config,
      now,
    );
    expect(stale.used).toEqual({});
    expect(stale.day).toBe('2026-08-17');
    expect(remaining(stale, 'multiBattle', 30)).toBe(30);
  });

  it('keeps the uses stamped with today', () => {
    const today = countersFor(
      { dailyCounters: { multiBattle: 12 }, dailyCountersDay: '2026-08-17' },
      config,
      now,
    );
    expect(remaining(today, 'multiBattle', 30)).toBe(18);
  });

  it('never reports a negative allowance', () => {
    // A cap lowered in Admin below what a player already spent is an operator decision,
    // not a debt: they get nothing more today, and nothing is clawed back.
    const counters: DailyCounters = { used: { multiBattle: 40 }, day: '2026-08-17' };
    expect(remaining(counters, 'multiBattle', 30)).toBe(0);
  });

  it('treats an unknown counter as unused', () => {
    const counters: DailyCounters = { used: {}, day: '2026-08-17' };
    expect(remaining(counters, 'somethingNew', 5)).toBe(5);
  });
});
