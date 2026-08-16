import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import { ROUTES, apiSuccess } from '@mistvale/shared';

/**
 * Health endpoints.
 *
 * `/api/health-lite` is a cheap liveness probe for uptime monitors and the deploy
 * script's post-restart check — no database round-trip, so it answers even while the
 * database is recovering. `/api/health` is the full picture the Admin dashboard and
 * `STATUS.sh` render, and it requires an admin session.
 */

// Sampled continuously; a rising p99 is the first sign the single core is saturated.
const eventLoopHistogram = monitorEventLoopDelay({ resolution: 10 });
eventLoopHistogram.enable();

export const healthRoutes: FastifyPluginAsync = async (app) => {
  app.get(ROUTES.health.lite, async (_request, reply) => {
    return reply.send({ ok: true, status: 'up', uptimeSeconds: process.uptime() });
  });

  app.get(ROUTES.health.full, { preHandler: app.requireRank('admin') }, async (_request, reply) => {
    const memory = process.memoryUsage();

    let databaseOk = true;
    let databaseLatencyMs = 0;
    const started = performance.now();
    try {
      await app.db.execute(sql`select 1`);
      databaseLatencyMs = Math.round(performance.now() - started);
    } catch (error) {
      databaseOk = false;
      app.log.error({ err: error }, 'health check: database probe failed');
    }

    return reply.send(
      apiSuccess(
        {
          status: databaseOk ? 'healthy' : 'degraded',
          uptimeSeconds: Math.round(process.uptime()),
          startedAt: new Date(app.startedAt).toISOString(),
          contentRevision: app.contentRevision,
          nodeVersion: process.version,
          memory: {
            rssMb: round(memory.rss / 1024 / 1024),
            heapUsedMb: round(memory.heapUsed / 1024 / 1024),
            heapTotalMb: round(memory.heapTotal / 1024 / 1024),
          },
          eventLoop: {
            meanMs: round(eventLoopHistogram.mean / 1e6),
            p99Ms: round(eventLoopHistogram.percentile(99) / 1e6),
            maxMs: round(eventLoopHistogram.max / 1e6),
          },
          database: {
            ok: databaseOk,
            latencyMs: databaseLatencyMs,
            pool: app.dbHandle.stats(),
          },
          // Populated once battles exist (Phase P2).
          activeBattles: 0,
        },
        app.contentRevision,
      ),
    );
  });
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
