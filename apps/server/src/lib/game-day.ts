/**
 * When "today" is.
 *
 * A game-day runs from the daily reset hour to the next one, not from midnight, so a
 * player farming at half past three in the morning is still on yesterday's day — for the
 * Essence Springs rotation, for a multi-battle allowance, and for every daily counter a
 * later phase adds. Both the hour and the timezone are `game_config` rows, because "when
 * does the day turn over" is an operations decision rather than a code one.
 *
 * Lives in `lib` rather than in whichever module needed it first: the second consumer
 * arrived one phase after the first, and a copy would have drifted by the third.
 */

export interface GameDay {
  /** ISO date of the game-day currently in progress, in the reset timezone. */
  date: string;
  /** Weekday of that game-day, `0` = Sunday — the index a rotation is written in. */
  weekday: number;
}

export function gameDay(now: Date, timezone: string, resetHour: number): GameDay {
  const parts = localParts(now, timezone);
  let { year, month, day } = parts;

  if (parts.hour < resetHour) {
    const stepped = new Date(Date.UTC(year, month - 1, day));
    stepped.setUTCDate(stepped.getUTCDate() - 1);
    year = stepped.getUTCFullYear();
    month = stepped.getUTCMonth() + 1;
    day = stepped.getUTCDate();
  }

  const anchored = new Date(Date.UTC(year, month - 1, day));
  return {
    date: `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    weekday: anchored.getUTCDay(),
  };
}

/** The game-day for a published config map — the form nearly every caller wants. */
export function gameDayFrom(config: Readonly<Record<string, unknown>>, now: Date): GameDay {
  const timezone = config['ops.dailyResetTimezone'];
  const resetHour = config['ops.dailyResetHour'];
  return gameDay(
    now,
    typeof timezone === 'string' && timezone.length > 0 ? timezone : 'UTC',
    typeof resetHour === 'number' && Number.isFinite(resetHour) ? resetHour : 4,
  );
}

/** Wall-clock fields of an instant in a named timezone. */
function localParts(
  now: Date,
  timezone: string,
): { year: number; month: number; day: number; hour: number } {
  const formatter = safeFormatter(timezone);
  const fields = new Map(
    formatter.formatToParts(now).map((part) => [part.type, Number.parseInt(part.value, 10)]),
  );
  return {
    year: fields.get('year') ?? now.getUTCFullYear(),
    month: fields.get('month') ?? now.getUTCMonth() + 1,
    day: fields.get('day') ?? now.getUTCDate(),
    hour: fields.get('hour') ?? now.getUTCHours(),
  };
}

/**
 * A formatter for the configured timezone, or UTC if the configuration is nonsense.
 *
 * The timezone is operator-editable, and a typo in it must cost a rotation rather than the
 * server: falling back is the difference between "the springs are on UTC today" and a 500
 * on every request that touches a daily anything.
 */
function safeFormatter(timezone: string): Intl.DateTimeFormat {
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  };
  try {
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone: timezone });
  } catch {
    return new Intl.DateTimeFormat('en-CA', { ...options, timeZone: 'UTC' });
  }
}
