import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiSuccess } from '@mistvale/shared';
import { players } from '../../db/schema/index';
import { AppError } from '../../lib/errors';
import * as titan from './service';

/**
 * What the Titan screen reads.
 *
 * One route, and deliberately only one: a run is an ordinary battle through the battle
 * routes (`mode: 'titan'`), so the playback, Auto, the speed ladder, Skip and resuming
 * after a reload are all the code that already exists rather than a second copy of it.
 * What is here is the standing — keys, the ladder, and this account's own record.
 */
export const titanRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get(ROUTES.titan.overview, async (request, reply) => {
    const playerId = request.player?.id;
    if (!playerId) throw AppError.authRequired();

    const [player] = await app.db
      .select({
        level: players.level,
        dailyCounters: players.dailyCounters,
        dailyCountersDay: players.dailyCountersDay,
      })
      .from(players)
      .where(eq(players.id, playerId));
    if (!player) throw AppError.notFound('No such player.');

    const payload = await titan.overview(
      app.db,
      app.content,
      {
        playerId,
        level: player.level,
        dailyCounters: player.dailyCounters,
        dailyCountersDay: player.dailyCountersDay,
      },
      new Date(),
    );
    return reply.send(apiSuccess({ titan: payload }, app.content.rev));
  });
};
