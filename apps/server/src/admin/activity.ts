import { sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { battleSessions, economyLog, summonHistory } from '../db/schema/index';

/**
 * What the game has actually been doing (gap G3).
 *
 * ADMIN_SUITE_DESIGN §2.1 asked for battle, summon and economy figures from the start,
 * and the dashboard could only ever say how many rows each content table held — which
 * describes the content rather than the game. When P6 shipped, the note said "no longer
 * *those systems do not exist*"; this is the follow-through.
 *
 * **Two windows on everything.** A day says whether something is happening now and a week
 * is what a day is read against — one number alone cannot tell a quiet Tuesday from a
 * broken endpoint, which is precisely the failure a dashboard exists to catch.
 *
 * All four queries are `created_at`-ranged and every table involved carries a `created_at`
 * index, so this is four bounded scans rather than four table sweeps. On the target box
 * that matters: the dashboard is the first thing an operator opens and it must not be the
 * most expensive thing they do.
 */

/** Signed deltas, as `economy_log` stores them: `{ "silver": -1200, "crystals": 10 }`. */
type Deltas = Record<string, number>;

export interface Activity {
  battles: {
    day: number;
    week: number;
    wonDay: number;
    byMode: { mode: string; day: number; week: number }[];
  };
  summons: {
    day: number;
    week: number;
    byRarity: { rarity: string; week: number }[];
    mercyWeek: number;
  };
  economy: { currency: string; faucet: number; sink: number }[];
}

export async function readActivity(db: Database): Promise<Activity> {
  const [battleRows, summonRows, economyRows] = await Promise.all([
    // Grouped in one pass rather than one query per mode: the set of modes is content, so
    // a query per mode would grow with the game.
    db
      .select({
        mode: battleSessions.mode,
        day: sql<number>`count(*) filter (where ${battleSessions.createdAt} > now() - interval '1 day')::int`,
        week: sql<number>`count(*)::int`,
        wonDay: sql<number>`count(*) filter (where ${battleSessions.createdAt} > now() - interval '1 day' and ${battleSessions.outcome} = 'victory')::int`,
      })
      .from(battleSessions)
      .where(sql`${battleSessions.createdAt} > now() - interval '7 days'`)
      .groupBy(battleSessions.mode),

    db
      .select({
        rarity: summonHistory.rarity,
        day: sql<number>`count(*) filter (where ${summonHistory.createdAt} > now() - interval '1 day')::int`,
        week: sql<number>`count(*)::int`,
        mercyWeek: sql<number>`count(*) filter (where ${summonHistory.fromMercy})::int`,
      })
      .from(summonHistory)
      .where(sql`${summonHistory.createdAt} > now() - interval '7 days'`)
      .groupBy(summonHistory.rarity),

    // The deltas are a JSON object per row rather than a column per currency, so the split
    // happens here. Currencies are few and a day's rows are bounded; folding in SQL would
    // mean naming every currency in the query, which is exactly the coupling `deltas`
    // exists to avoid.
    db
      .select({ deltas: economyLog.deltas })
      .from(economyLog)
      .where(sql`${economyLog.createdAt} > now() - interval '1 day'`),
  ]);

  const faucets = new Map<string, { faucet: number; sink: number }>();
  for (const row of economyRows) {
    for (const [currency, amount] of Object.entries((row.deltas ?? {}) as Deltas)) {
      if (typeof amount !== 'number' || amount === 0) continue;
      const entry = faucets.get(currency) ?? { faucet: 0, sink: 0 };
      // Both halves rather than the net: a net of zero is produced both by a healthy
      // economy and by nothing happening at all, and those want different responses. The
      // sink is kept positive, since "spent 4,000" reads better than "spent -4,000".
      if (amount > 0) entry.faucet += amount;
      else entry.sink += -amount;
      faucets.set(currency, entry);
    }
  }

  const sum = <T>(rows: readonly T[], pick: (row: T) => number): number =>
    rows.reduce((total, row) => total + pick(row), 0);

  return {
    battles: {
      day: sum(battleRows, (row) => row.day),
      week: sum(battleRows, (row) => row.week),
      wonDay: sum(battleRows, (row) => row.wonDay),
      byMode: battleRows
        .map((row) => ({ mode: row.mode, day: row.day, week: row.week }))
        // Busiest first, over the week: the day alone would reorder the list every time
        // somebody plays, and which modes nobody plays is the more interesting half.
        .sort((a, b) => b.week - a.week || a.mode.localeCompare(b.mode)),
    },
    summons: {
      day: sum(summonRows, (row) => row.day),
      week: sum(summonRows, (row) => row.week),
      byRarity: summonRows
        .map((row) => ({ rarity: row.rarity, week: row.week }))
        .sort((a, b) => b.week - a.week || a.rarity.localeCompare(b.rarity)),
      mercyWeek: sum(summonRows, (row) => row.mercyWeek),
    },
    economy: [...faucets.entries()]
      .map(([currency, entry]) => ({ currency, ...entry }))
      .sort(
        (a, b) => b.faucet + b.sink - (a.faucet + a.sink) || a.currency.localeCompare(b.currency),
      ),
  };
}
