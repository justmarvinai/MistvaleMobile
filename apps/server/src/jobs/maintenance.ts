import cron from 'node-cron';
import type { FastifyInstance } from 'fastify';
import { deleteExpiredSessions } from '../modules/auth/repo';
import { refreshLadder } from '../modules/arena/bots';

/**
 * Scheduled maintenance.
 *
 * Runs in-process — a separate scheduler would be another thing to install and monitor
 * on a one-core box (docs/ARCHITECTURE.md §5.1). Prunes expired sessions and refreshes the
 * arena's bot ladder; the daily reset (quests, event windows) attaches here in later
 * phases.
 *
 * Nothing a player can see is *derived* from this job running. Energy, arena tokens, the
 * shop's window and every daily allowance are computed against the clock on read, so an
 * hour of downtime at the reset hour costs a bot refresh and nothing else — which is the
 * only reason a single in-process cron is a safe place to put any of this.
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

  app.log.info({ hour: RESET_HOUR, timezone: RESET_TIMEZONE }, 'daily maintenance job scheduled');

  return () => {
    dailyReset.stop();
  };
}

async function runDailyMaintenance(app: FastifyInstance): Promise<void> {
  const startedAt = Date.now();
  let removedSessions = 0;
  try {
    removedSessions = await deleteExpiredSessions(app.db, new Date());
  } catch (error) {
    // A failed maintenance run must never take the server down with it.
    app.log.error({ err: error }, 'session pruning failed');
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
      botsRefreshed: ladder.refreshed,
      botsCreated: ladder.created,
      botsRemoved: ladder.removed,
      durationMs: Date.now() - startedAt,
    },
    'daily maintenance complete',
  );
}
