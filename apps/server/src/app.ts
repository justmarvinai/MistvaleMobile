import Fastify, { LogController, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { ADMIN_API_PREFIX, API_PREFIX } from '@mistvale/shared';
import { loadConfig, type AppConfig } from './lib/config';
import { createLoggerOptions } from './lib/logger';
import { databasePlugin } from './plugins/database';
import { authPlugin } from './plugins/auth';
import { contentPlugin } from './plugins/content';
import { errorHandlerPlugin } from './plugins/error-handler';
import { generateRequestId, requestContextPlugin } from './plugins/request-context';
import { authRoutes } from './modules/auth/routes';
import { playerRoutes } from './modules/player/routes';
import { healthRoutes } from './modules/health/routes';
import { contentRoutes } from './modules/content/routes';
import { gameRoutes } from './modules/battle/routes';
import { inventoryRoutes } from './modules/gear/routes';
import { arenaRoutes } from './modules/arena/routes';
import { depthsRoutes } from './modules/depths/routes';
import { titanRoutes } from './modules/titan/routes';
import { worldBossRoutes } from './modules/worldboss/routes';
import { deepRunRoutes } from './modules/deeprun/routes';
import { questRoutes } from './modules/meta/routes';
import { mailRoutes } from './modules/mail/routes';
import { profileRoutes } from './modules/profile/routes';
import { masteryRoutes } from './modules/mastery/routes';
import { progressRoutes } from './modules/progress/routes';
import { shopRoutes } from './modules/shop/routes';
import { summonRoutes } from './modules/summon/routes';
import { adminApi } from './admin/index';

declare module 'fastify' {
  interface FastifyInstance {
    config: AppConfig;
  }
}

export interface BuildAppOptions {
  config?: AppConfig;
  /** Overrides the logger configuration; tests pass `false` to silence output. */
  logger?: FastifyServerOptions['logger'];
}

/**
 * Composes the server.
 *
 * Plugin order matters: context and error handling first so everything after them is
 * observable, then the database, then auth (which needs the database), then routes.
 * Exported separately from `index.ts` so tests can build an app without binding a port.
 */
export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadConfig();

  const app: FastifyInstance = Fastify({
    logger: options.logger ?? createLoggerOptions(config),
    genReqId: generateRequestId,
    trustProxy: true, // nginx sits in front; we want the real client IP for rate limits.
    bodyLimit: 256 * 1024,
    // Fastify's built-in per-request logging is off: our own hook samples successes and
    // always logs failures (plugins/request-context).
    logController: new LogController({ disableRequestLogging: true }),
  });

  app.decorate('config', config);

  await app.register(requestContextPlugin);
  await app.register(errorHandlerPlugin);

  await app.register(helmet, {
    // The API serves JSON only; nginx sets the page-level policy for the SPA.
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-site' },
  });

  if (config.RATE_LIMIT_ENABLED) {
    await app.register(rateLimit, {
      global: true,
      max: 300,
      timeWindow: '1 minute',
      // Counted at `preHandler`, after `requireAuth` has run, so `request.account` is
      // actually populated. At the default `onRequest` it never is — the account is
      // resolved by a route's own preHandler — so every player quietly shared one
      // per-IP bucket and the line below was decoration. Body parsing before the
      // count is an acceptable trade here: nginx caps the same client at 30 r/s
      // (scripts/deploy-assets/nginx-mistvale.conf) well before this window matters.
      hook: 'preHandler',
      // Authenticated players share a bucket per account; anonymous traffic per IP.
      keyGenerator: (request) => request.account?.id ?? request.ip,
      // No errorResponseBuilder on purpose: the plugin's own error carries statusCode
      // 429, and the global error handler turns that into the standard envelope. A
      // custom builder here would return a plain object that Fastify treats as an
      // unhandled error, answering 500 instead of 429.
    });
  }

  await app.register(databasePlugin);
  await app.register(authPlugin);
  await app.register(contentPlugin);

  await app.register(
    async (api) => {
      await api.register(healthRoutes);
      await api.register(authRoutes);
      await api.register(playerRoutes);
      await api.register(contentRoutes);
      await api.register(gameRoutes);
      await api.register(inventoryRoutes);
      await api.register(progressRoutes);
      await api.register(depthsRoutes);
      await api.register(titanRoutes);
      await api.register(worldBossRoutes);
      await api.register(deepRunRoutes);
      await api.register(arenaRoutes);
      await api.register(questRoutes);
      await api.register(mailRoutes);
      await api.register(profileRoutes);
      await api.register(masteryRoutes);
      await api.register(shopRoutes);
      await api.register(summonRoutes);
    },
    { prefix: API_PREFIX },
  );

  await app.register(adminApi, { prefix: ADMIN_API_PREFIX });

  await app.ready();
  return app;
}
