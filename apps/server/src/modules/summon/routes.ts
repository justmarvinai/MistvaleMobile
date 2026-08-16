import type { FastifyPluginAsync } from 'fastify';
import { ROUTES, apiSuccess, routePattern, summonRequestSchema } from '@mistvale/shared';
import { AppError } from '../../lib/errors';
import * as summon from './service';

/**
 * The Mistgate and the Chronicle.
 *
 * Reads are cheap and honest: the banner endpoint returns the exact rate table the next
 * pull will roll against, mercy included, so the Odds & Mercy panel cannot show a number
 * the server does not believe.
 */

export const summonRoutes: FastifyPluginAsync = async (app) => {
  const requirePlayer = (request: { player?: { id: string } | null }): string => {
    const id = request.player?.id;
    if (!id) throw AppError.authRequired();
    return id;
  };

  app.addHook('preHandler', app.requireAuth);

  app.get(ROUTES.summon.banners, async (request, reply) => {
    const playerId = requirePlayer(request);
    const banners = await summon.banners(app.db, playerId, app.content);
    return reply.send(apiSuccess({ banners }, app.content.rev));
  });

  app.post(routePattern(ROUTES.summon.pull, 'key'), async (request, reply) => {
    const playerId = requirePlayer(request);
    const { key } = request.params as { key: string };
    const body = summonRequestSchema.parse(request.body);

    const result = await summon.pull(app.db, playerId, key, body.count, body.actionId, app.content);
    request.log.info(
      {
        playerId,
        poolKey: key,
        count: body.count,
        rarities: result.results.map((entry) => entry.rarity),
      },
      'summon',
    );
    return reply.send(apiSuccess(result, app.content.rev));
  });

  app.get(ROUTES.summon.history, async (request, reply) => {
    const playerId = requirePlayer(request);
    const { limit } = request.query as { limit?: string };
    const entries = await summon.history(app.db, playerId, Number(limit) || 50);
    return reply.send(apiSuccess({ entries }, app.content.rev));
  });

  app.get(ROUTES.summon.chronicle, async (request, reply) => {
    const playerId = requirePlayer(request);
    const chronicle = await summon.chronicle(app.db, playerId, app.content);
    return reply.send(apiSuccess({ chronicle }, app.content.rev));
  });
};
