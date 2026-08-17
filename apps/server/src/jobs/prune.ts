import { and, lt, ne, sql } from 'drizzle-orm';
import {
  battleSessions,
  economyLog,
  mailbox,
  playerEvents,
  playerQuests,
} from '../db/schema/index';
import type { Database } from '../db/client';

/**
 * The nightly prune.
 *
 * Everything here is about **disk**, never about correctness. Mistvale derives rather than
 * ticks: energy, arena tokens, quest periods, event windows, mail expiry and every daily
 * allowance are worked out against the clock when they are read, so a prune that never runs
 * costs storage and nothing else. That is the property to protect — the moment a player's
 * state depends on this job having run, an hour of downtime becomes a bug report.
 *
 * ## What is never pruned, and why
 *
 * **`login_claims` is the one that would be catastrophic.** A row per claimed day *is* the
 * calendar's state: the track's position is `count(*)` over those rows, so deleting old ones
 * would walk every player backwards through the calendar — somebody on day 28 would wake up
 * on day 3, and the bug would look like a content problem rather than a prune. There is a
 * test that fails if a prune ever touches them.
 *
 * `champion_sightings` and `summon_history` are the Chronicle and a player's own record of
 * their pulls — both are the feature, not its exhaust. `audit_log` answers "who did this to
 * my account", which is a question that gets asked late or never. `arena_battles` outlives
 * the sessions it points at by design (docs/DATA_MODEL.md §arena_battles): the ladder's
 * history is what settles a dispute, and it is small.
 *
 * ## Retention
 *
 * Every window is a `game_config` key, because "how long do we keep battle logs" is an
 * operations decision an operator should be able to change on a box that is filling up,
 * not a number compiled into a release.
 */

export interface PruneWindows {
  /** Resolved battles, with the event log they carry. */
  battleDays: number;
  /** Mail already gone from every inbox — kept a while in case an operator is asked. */
  mailDays: number;
  /** The economy audit trail. */
  economyDays: number;
  /** Quest instances whose period is long past. */
  questDays: number;
  /** Event scores whose occurrence is long past. */
  eventDays: number;
}

const DEFAULTS: PruneWindows = {
  battleDays: 14,
  mailDays: 30,
  economyDays: 90,
  questDays: 90,
  eventDays: 60,
};

/** Reads the retention windows, falling back to the documented defaults. */
export function pruneWindowsFrom(config: Readonly<Record<string, unknown>>): PruneWindows {
  const days = (key: string, fallback: number): number => {
    const value = config[key];
    // Zero is legitimate and means "keep nothing older than today"; negative is not, and a
    // negative window would delete the future.
    return typeof value === 'number' && Number.isFinite(value) && value >= 0
      ? Math.floor(value)
      : fallback;
  };

  return {
    battleDays: days('ops.retainBattleDays', DEFAULTS.battleDays),
    mailDays: days('ops.retainMailDays', DEFAULTS.mailDays),
    economyDays: days('ops.retainEconomyDays', DEFAULTS.economyDays),
    questDays: days('ops.retainQuestDays', DEFAULTS.questDays),
    eventDays: days('ops.retainEventDays', DEFAULTS.eventDays),
  };
}

export interface PruneReport {
  battles: number;
  mail: number;
  economy: number;
  quests: number;
  events: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD`, n days before now — the form the anchor columns are stored in. */
function dayBefore(now: Date, days: number): string {
  return new Date(now.getTime() - days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Deletes what is past its window.
 *
 * Each table is its own statement rather than one transaction over all five: they are
 * independent, none of them is read by the others, and a prune that fails on the fourth
 * should keep the three it already did rather than roll back a night's work. The caller
 * logs the report; a failure of one table is raised to it.
 */
export async function pruneOldRows(
  db: Database,
  windows: PruneWindows,
  now = new Date(),
): Promise<PruneReport> {
  const before = (days: number): Date => new Date(now.getTime() - days * DAY_MS);

  // Resolved battles only. An `active` session is somebody's fight in progress — a player
  // who left the tab open over a long weekend must come back to it, not to nothing.
  const battles = await db
    .delete(battleSessions)
    .where(
      and(
        ne(battleSessions.status, 'active'),
        lt(battleSessions.updatedAt, before(windows.battleDays)),
      ),
    )
    .returning({ id: battleSessions.id });

  // Mail is *already invisible* once it expires — this only reclaims the row. Kept past
  // expiry on purpose: "what did that compensation mail say" is asked after it has gone.
  const mail = await db
    .delete(mailbox)
    .where(
      and(sql`${mailbox.expiresAt} is not null`, lt(mailbox.expiresAt, before(windows.mailDays))),
    )
    .returning({ id: mailbox.id });

  const economy = await db
    .delete(economyLog)
    .where(lt(economyLog.createdAt, before(windows.economyDays)))
    .returning({ id: economyLog.id });

  // Quest instances are the volume: eight dailies a day per active account, forever. The
  // anchor is a game-day string, so this compares dates rather than instants.
  const quests = await db
    .delete(playerQuests)
    .where(lt(playerQuests.periodAnchor, dayBefore(now, windows.questDays)))
    .returning({ id: playerQuests.id });

  const events = await db
    .delete(playerEvents)
    .where(lt(playerEvents.occurrence, dayBefore(now, windows.eventDays)))
    .returning({ id: playerEvents.id });

  return {
    battles: battles.length,
    mail: mail.length,
    economy: economy.length,
    quests: quests.length,
    events: events.length,
  };
}

/** Whether a report found anything at all — worth a log line only when it did. */
export function prunedAnything(report: PruneReport): boolean {
  return Object.values(report).some((count) => count > 0);
}

/**
 * Tables this job must never touch, named so the guard is checkable rather than a comment.
 *
 * `prune.test.ts` walks this list and asserts each one still holds its rows after a prune
 * with every window set to zero — the harshest run the config allows. Adding a table here
 * without teaching the test about it fails the build, which is the point: the list is only
 * worth having if it is enforced.
 */
export const NEVER_PRUNED = Object.freeze([
  'login_claims',
  'champion_sightings',
  'summon_history',
  'audit_log',
  'arena_battles',
  'player_missions',
] as const);
