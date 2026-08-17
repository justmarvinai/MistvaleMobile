import type { FastifyPluginAsync } from 'fastify';
import { ADMIN_ROUTES, apiSuccess, routePattern } from '@mistvale/shared';
import { AppError } from '../lib/errors';
import { runDailyMaintenance, runWeeklyMaintenance } from '../jobs/maintenance';
import { recordAudit } from './audit';

/**
 * Scheduled work, on demand.
 *
 * Both jobs run themselves nightly and weekly; this is the operator who has just shortened
 * a retention window, or published content the bot ladder should pick up, and does not want
 * to wait until 04:00. Every job here is written to be safe to run late or twice — which is
 * exactly what makes offering a button safe.
 *
 * The closed list is deliberate. A generic "run this name" that reached anything callable
 * would be a remote-execution surface with an admin cookie in front of it; a map with two
 * entries is a feature.
 */
const JOBS = {
  daily: {
    label: 'Nightly maintenance',
    description:
      'Prunes expired sessions and rows past their retention window, then rebuilds the ' +
      'Arena bot ladder from live content. Nothing a player sees depends on it.',
    run: runDailyMaintenance,
  },
  weekly: {
    label: 'Arena weekly close',
    description:
      'Yields the visible top ten to human accounts, seals the week’s chests against the ' +
      'best rating each player held, and decays ratings towards the floor. Names the week ' +
      'it closes, so running it twice closes it once.',
    run: runWeeklyMaintenance,
  },
} as const;

type JobName = keyof typeof JOBS;

function isJobName(value: string): value is JobName {
  return Object.hasOwn(JOBS, value);
}

export const adminJobRoutes: FastifyPluginAsync = async (app) => {
  app.get(ADMIN_ROUTES.jobs.list, async (_request, reply) => {
    return reply.send(
      apiSuccess(
        {
          jobs: Object.entries(JOBS).map(([name, job]) => ({
            name,
            label: job.label,
            description: job.description,
          })),
        },
        app.content.rev,
      ),
    );
  });

  app.post(routePattern(ADMIN_ROUTES.jobs.run, 'name'), async (request, reply) => {
    const { name } = request.params as { name: string };
    if (!isJobName(name)) throw AppError.notFound('No such job.');

    const startedAt = Date.now();
    // Runs inline rather than being queued: both jobs are seconds of work on the target
    // box, and an operator pressing a button wants the answer, not a ticket.
    const result = await JOBS[name].run(app);
    const durationMs = Date.now() - startedAt;

    await recordAudit(app.db, request, {
      action: 'jobs.run',
      entity: 'job',
      entityId: name,
      after: { durationMs, result: result ?? null },
    });
    request.log.info({ job: name, durationMs }, 'job run by hand');

    return reply.send(
      apiSuccess({ job: name, durationMs, result: result ?? null }, app.content.rev),
    );
  });
};
