import cron from 'node-cron';
import type { FastifyInstance } from 'fastify';
import { deleteExpiredSessions } from '../modules/auth/repo';

/**
 * Scheduled maintenance.
 *
 * Runs in-process — a separate scheduler would be another thing to install and monitor
 * on a one-core box (docs/ARCHITECTURE.md §5.1). Phase P0 prunes expired sessions; the
 * daily reset (quests, shop rotation, event windows) attaches here in later phases.
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
  try {
    const removed = await deleteExpiredSessions(app.db, new Date());
    app.log.info(
      { removedSessions: removed, durationMs: Date.now() - startedAt },
      'daily maintenance complete',
    );
  } catch (error) {
    // A failed maintenance run must never take the server down with it.
    app.log.error({ err: error }, 'daily maintenance failed');
  }
}
