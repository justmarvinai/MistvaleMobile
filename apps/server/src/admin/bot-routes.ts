import type { FastifyPluginAsync } from 'fastify';
import { ADMIN_ROUTES, apiSuccess } from '@mistvale/shared';
import * as bots from '../modules/arena/bots';
import type { ArenaContext } from '../modules/arena/ladder';
import { recordAudit } from './audit';

/**
 * The Arena's bot ladder, from the operator's side.
 *
 * Three endpoints, and deliberately no fourth. What each band *is* — how many bots, at
 * what rating, holding what champions in what relics — is `arena.botBands` in the game
 * config editor, because it is content and content is data. What lives here is only the
 * three things a config edit cannot do by itself: see what the ladder currently holds,
 * make it match, and rebuild it now rather than waiting for tonight.
 *
 * An individual bot is an ordinary player and is inspected, renamed or removed through
 * player management like anybody else — which is the point of not giving them a table.
 */
export const adminBotRoutes: FastifyPluginAsync = async (app) => {
  const ctx = (): ArenaContext => ({ db: app.db, content: app.content });

  app.get(ADMIN_ROUTES.bots.census, async (_request, reply) => {
    return reply.send(apiSuccess(await bots.census(ctx()), app.content.rev));
  });

  app.post(ADMIN_ROUTES.bots.seed, async (request, reply) => {
    // Idempotent: it creates only the difference between what a band should hold and what
    // it does, so an operator pressing it twice is an operator pressing it once.
    const report = await bots.seedLadder(ctx());
    await recordAudit(app.db, request, {
      action: 'arena.seedBots',
      entity: 'arena',
      entityId: 'ladder',
      after: { created: report.created, removed: report.removed, byBand: report.byBand },
    });
    return reply.send(apiSuccess({ report, census: await bots.census(ctx()) }, app.content.rev));
  });

  app.post(ADMIN_ROUTES.bots.refresh, async (request, reply) => {
    // The nightly job, on demand — after a balance publish, an operator should not have to
    // wait until 04:00 to see what the ladder now looks like.
    const report = await bots.refreshLadder(ctx());
    await recordAudit(app.db, request, {
      action: 'arena.refreshBots',
      entity: 'arena',
      entityId: 'ladder',
      after: { refreshed: report.refreshed, created: report.created, removed: report.removed },
    });
    return reply.send(apiSuccess({ report, census: await bots.census(ctx()) }, app.content.rev));
  });
};
