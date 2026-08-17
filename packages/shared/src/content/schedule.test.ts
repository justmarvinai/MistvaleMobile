import { describe, expect, it } from 'vitest';
import { addDays, claimsCloseOn, daysBetween, eventWindowAt } from './schedule';

/**
 * When an event runs.
 *
 * This is the arithmetic that replaces a scheduler, so it carries the weight one would:
 * get it wrong and an event either never opens or never shuts, and nothing else in the
 * system would notice. Pure, so it is pinned exhaustively and cheaply.
 */

describe('date helpers', () => {
  it('walks forward and backward across a month boundary', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
    // 2028 is a leap year, which is the case an off-by-one in day arithmetic finds.
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('counts whole days in both directions', () => {
    expect(daysBetween('2026-03-01', '2026-03-08')).toBe(7);
    expect(daysBetween('2026-03-08', '2026-03-01')).toBe(-7);
    expect(daysBetween('2026-03-01', '2026-03-01')).toBe(0);
  });
});

describe('a one-off window', () => {
  const schedule = {
    kind: 'window' as const,
    startsAt: '2026-03-16T04:00:00Z',
    endsAt: '2026-03-20T04:00:00Z',
  };

  it('runs between its instants, inclusive of the start', () => {
    const inside = eventWindowAt(schedule, '2026-03-17', 2, new Date('2026-03-17T12:00:00Z'));
    expect(inside).not.toBeNull();
    expect(inside?.anchor).toBe('2026-03-16');
    expect(inside?.endsOn).toBe('2026-03-20');

    expect(eventWindowAt(schedule, '2026-03-16', 1, new Date(schedule.startsAt))).not.toBeNull();
  });

  it('is shut before it opens and the instant it ends', () => {
    expect(eventWindowAt(schedule, '2026-03-15', 0, new Date('2026-03-15T23:59:00Z'))).toBeNull();
    // Exclusive at the end: the closing instant belongs to the next thing, not this one.
    expect(eventWindowAt(schedule, '2026-03-20', 5, new Date(schedule.endsAt))).toBeNull();
  });

  it('refuses a schedule whose timestamps are nonsense rather than guessing', () => {
    const broken = { kind: 'window' as const, startsAt: 'soon', endsAt: 'later' };
    expect(eventWindowAt(broken, '2026-03-17', 2, new Date('2026-03-17T12:00:00Z'))).toBeNull();
  });
});

describe('a weekly window', () => {
  // Friday through Sunday: the Depths Delve's shape.
  const weekend = { kind: 'weekly' as const, startWeekday: 5, durationDays: 3 };

  it('opens on its weekday and runs for its duration', () => {
    // 2026-03-20 is a Friday.
    expect(eventWindowAt(weekend, '2026-03-20', 5, new Date())).toEqual({
      anchor: '2026-03-20',
      startsOn: '2026-03-20',
      endsOn: '2026-03-22',
    });
    // Saturday and Sunday are the same occurrence — the anchor does not move mid-window,
    // which is what keeps a player's score theirs for the whole weekend.
    expect(eventWindowAt(weekend, '2026-03-21', 6, new Date())?.anchor).toBe('2026-03-20');
    expect(eventWindowAt(weekend, '2026-03-22', 0, new Date())?.anchor).toBe('2026-03-20');
  });

  it('is shut on the days between occurrences', () => {
    for (const [date, weekday] of [
      ['2026-03-23', 1],
      ['2026-03-24', 2],
      ['2026-03-25', 3],
      ['2026-03-26', 4],
    ] as const) {
      expect(eventWindowAt(weekend, date, weekday, new Date()), date).toBeNull();
    }
  });

  it('gives next week its own occurrence, so the ladder starts over', () => {
    expect(eventWindowAt(weekend, '2026-03-27', 5, new Date())?.anchor).toBe('2026-03-27');
  });

  it('handles a window that runs the whole week without ever shutting', () => {
    const always = { kind: 'weekly' as const, startWeekday: 1, durationDays: 7 };
    for (let weekday = 0; weekday < 7; weekday += 1) {
      expect(eventWindowAt(always, '2026-03-16', weekday, new Date())).not.toBeNull();
    }
  });

  it('crosses a month boundary without losing the occurrence', () => {
    // 2026-03-31 is a Tuesday; a Sunday-start 4-day window covers it from the 29th.
    const spanning = { kind: 'weekly' as const, startWeekday: 0, durationDays: 4 };
    expect(eventWindowAt(spanning, '2026-04-01', 3, new Date())).toEqual({
      anchor: '2026-03-29',
      startsOn: '2026-03-29',
      endsOn: '2026-04-01',
    });
  });
});

describe('the claim grace', () => {
  it('keeps a finished ladder collectable past the last scoring day', () => {
    const window = { anchor: '2026-03-20', startsOn: '2026-03-20', endsOn: '2026-03-22' };
    expect(claimsCloseOn(window, 3)).toBe('2026-03-25');
    // Zero grace is legitimate — an operator may want a hard close — and must not wrap.
    expect(claimsCloseOn(window, 0)).toBe('2026-03-22');
    expect(claimsCloseOn(window, -5)).toBe('2026-03-22');
  });
});
