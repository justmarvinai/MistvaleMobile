import { eq } from 'drizzle-orm';
import { players } from '../db/schema/index';
import type { Database } from '../db/client';
import { gameDayFrom } from './game-day';

/**
 * Things a player may only do so many of per day.
 *
 * One jsonb map keyed by counter name, stamped with the game-day it belongs to, rather
 * than a column per allowance. Multi-battle needs one today and the quest layer will need
 * eight; a column each would be a migration per feature, and the whole point of a daily
 * counter is that adding one should cost nothing.
 *
 * There is no reset *job*. A counter whose stamp is not today reads as zero and is
 * overwritten on the next write, so an account that was away for a month is current the
 * moment it comes back — no cron, no backlog, nothing to miss (docs/ARCHITECTURE.md §5.1).
 */

type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface DailyCounters {
  /** Uses recorded today, by counter name. */
  used: Readonly<Record<string, number>>;
  /** The game-day these belong to. */
  day: string;
}

/** What a player has used today. Counters stamped with an older day read as zero. */
export function countersFor(
  player: { dailyCounters: Record<string, number>; dailyCountersDay: string | null },
  config: Readonly<Record<string, unknown>>,
  now: Date,
): DailyCounters {
  const day = gameDayFrom(config, now).date;
  return {
    used: player.dailyCountersDay === day ? player.dailyCounters : {},
    day,
  };
}

/** How many of an allowance are left. */
export function remaining(counters: DailyCounters, name: string, cap: number): number {
  return Math.max(0, cap - (counters.used[name] ?? 0));
}

/**
 * Records uses against a counter.
 *
 * Writes the whole map back with today's stamp, which is what rolls a stale day over
 * without a reset job. Callers hold the player-row lock, so the read-modify-write is safe.
 */
export async function record(
  tx: Executor,
  playerId: string,
  counters: DailyCounters,
  name: string,
  uses: number,
): Promise<void> {
  if (uses <= 0) return;
  const next = { ...counters.used, [name]: (counters.used[name] ?? 0) + uses };
  await tx
    .update(players)
    .set({ dailyCounters: next, dailyCountersDay: counters.day, updatedAt: new Date() })
    .where(eq(players.id, playerId));
}
