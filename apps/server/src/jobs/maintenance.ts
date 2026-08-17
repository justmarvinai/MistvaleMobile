import cron from 'node-cron';
import type { FastifyInstance } from 'fastify';
import { deleteExpiredSessions } from '../modules/auth/repo';
import { refreshLadder, yieldTopTen } from '../modules/arena/bots';
import { weeklyReset } from '../modules/arena/ladder';
import { pruneOldRows, pruneWindowsFrom, type PruneReport } from './prune';

/**
 * Scheduled maintenance.
 *
 * Runs in-process — a separate scheduler would be another thing to install and monitor
 * on a one-core box (docs/ARCHITECTURE.md §5.1). Two schedules: a nightly pass at the
 * configured reset hour, and a weekly one at the same hour on Monday. The daily reset's
 * remaining work (quests, event windows) attaches to the nightly pass in later phases.
 *
 * Almost nothing a player can see is *derived* from this job running. Energy, arena
 * tokens, quest periods, event windows, mail expiry, the login calendar and every daily
 * allowance are computed against the clock on read, so an hour of downtime at the reset
 * hour costs a bot refresh and some disk, and nothing else. The arena's weekly close is
 * the one exception — it seals a chest and decays ratings, a genuine state change — and it
 * is written to be safe to run late or twice.
 *
 * That property is the design, not an accident of it: "the daily reset job" resets nothing.
 * It prunes what has gone stale and rebuilds the bot ladder. Anything that ever *needs* it
 * to have run belongs on the read path instead.
 */
export function startMaintenanceJobs(app: FastifyInstance): () => void {
  const { RESET_HOUR, RESET_TIMEZONE } = app.config;

  const dailyReset = cron.schedule(
    `0 ${RESET_HOUR} * * *`,
    () => {
      void runDailyMaintenance(app);
    },
    { timezone: RESET_TIMEZONE },
  );

  // Monday, at the same hour. Fires a minute after the nightly pass so the two never
  // contend for the one core, and so the bot ladder is current before the ladder closes.
  const weeklyClose = cron.schedule(
    `1 ${RESET_HOUR} * * 1`,
    () => {
      void runWeeklyMaintenance(app);
    },
    { timezone: RESET_TIMEZONE },
  );

  app.log.info({ hour: RESET_HOUR, timezone: RESET_TIMEZONE }, 'maintenance jobs scheduled');

  return () => {
    dailyReset.stop();
    weeklyClose.stop();
  };
}

/**
 * The nightly pass.
 *
 * Three independent pieces, each in its own `try`: a failure in one must not cost the other
 * two a night. Exported so the Admin API can run it on demand — an operator who has just
 * changed a retention window should not have to wait until 04:00 to see it take effect.
 */
export async function runDailyMaintenance(app: FastifyInstance): Promise<{
  removedSessions: number;
  ladder: { created: number; refreshed: number; removed: number };
  pruned: PruneReport | null;
}> {
  const startedAt = Date.now();
  let removedSessions = 0;
  try {
    removedSessions = await deleteExpiredSessions(app.db, new Date());
  } catch (error) {
    // A failed maintenance run must never take the server down with it.
    app.log.error({ err: error }, 'session pruning failed');
  }

  let pruned: PruneReport | null = null;
  try {
    // Disk, never correctness — see `prune.ts`. The windows come from `game_config`, so an
    // operator on a filling box can shorten them without a deploy.
    pruned = await pruneOldRows(app.db, pruneWindowsFrom(app.content.current().bundle.config));
  } catch (error) {
    app.log.error({ err: error }, 'row pruning failed');
  }

  let ladder = { created: 0, refreshed: 0, removed: 0 };
  try {
    // Rebuilt from live content every night, so a ladder nobody has beaten in a week is a
    // different ladder by morning, and a content change reaches the bots without a deploy.
    // Reported separately from session pruning because either can fail on its own.
    ladder = await refreshLadder({ db: app.db, content: app.content });
  } catch (error) {
    app.log.error({ err: error }, 'arena bot refresh failed');
  }

  app.log.info(
    {
      removedSessions,
      pruned,
      botsRefreshed: ladder.refreshed,
      botsCreated: ladder.created,
      botsRemoved: ladder.removed,
      durationMs: Date.now() - startedAt,
    },
    'daily maintenance complete',
  );

  return { removedSessions, ladder, pruned };
}

/**
 * Closes the arena week.
 *
 * The auto-yield runs *first*, so the standing a player wakes up to on Monday is the one
 * their chest was sealed against — the owner's fairness rule is that the visible top ten
 * belongs to people (GAME_DESIGN §13), and a board that only becomes fair after the
 * rewards are worked out would satisfy the letter of it and not the point.
 */
export async function runWeeklyMaintenance(app: FastifyInstance): Promise<void> {
  const startedAt = Date.now();
  const ctx = { db: app.db, content: app.content };

  let yielded = 0;
  try {
    yielded = await yieldTopTen(ctx);
  } catch (error) {
    app.log.error({ err: error }, 'arena top-ten yield failed');
  }

  try {
    const report = await weeklyReset(ctx, new Date());
    app.log.info(
      {
        week: report.week,
        chestsSealed: report.sealed,
        ratingsDecayed: report.decayed,
        botsYielded: yielded,
        durationMs: Date.now() - startedAt,
      },
      'arena week closed',
    );
  } catch (error) {
    // Left for next Monday rather than retried: the reset names the week it is closing,
    // so a missed run is a week without decay, not a corrupted ladder.
    app.log.error({ err: error }, 'arena weekly reset failed');
  }
}
