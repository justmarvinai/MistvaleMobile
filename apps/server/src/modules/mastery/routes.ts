import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  ROUTES,
  apiSuccess,
  masteryLearnRequestSchema,
  masteryResetRequestSchema,
  routePattern,
} from '@mistvale/shared';
import { players } from '../../db/schema/index';
import { AppError } from '../../lib/errors';
import * as championView from '../roster/champions';
import * as mastery from './service';
import { idParam } from '../../lib/params';

/**
 * Training a champion.
 *
 * Two endpoints, both transactional under the player-row lock, because both move something
 * a player cares about: emblems they farmed the Proving Grounds for, and crystals. The
 * champion comes back whole in each response, so the tree screen re-renders from the
 * server's numbers rather than patching its own state.
 */
export const masteryRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  const requirePlayer = (request: { player?: { id: string } | null }): string => {
    const id = request.player?.id;
    if (!id) throw AppError.authRequired();
    return id;
  };

  app.post(routePattern(ROUTES.roster.masteries), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    const body = masteryLearnRequestSchema.parse(request.body);
    const context = championView.championContextFrom(app.content);

    const detail = await app.db.transaction(async (tx) => {
      const [player] = await tx
        .select({ level: players.level })
        .from(players)
        .where(eq(players.id, playerId))
        .for('update');
      if (!player) throw AppError.notFound('No such player.');

      await mastery.learn(tx, {
        playerId,
        playerLevel: player.level,
        championId: id,
        nodeKey: body.nodeKey,
        nodes: context.masteryNodes,
        costs: context.masteryCosts,
        content: app.content,
      });

      return championView.loadDetail(tx, playerId, id, context);
    });

    return reply.send(apiSuccess({ champion: detail }, app.content.rev));
  });

  app.post(routePattern(ROUTES.roster.masteryReset), async (request, reply) => {
    const playerId = requirePlayer(request);
    const id = idParam(request);
    masteryResetRequestSchema.parse(request.body);
    const context = championView.championContextFrom(app.content);

    const result = await app.db.transaction(async (tx) => {
      const [player] = await tx
        .select({ level: players.level })
        .from(players)
        .where(eq(players.id, playerId))
        .for('update');
      if (!player) throw AppError.notFound('No such player.');

      const outcome = await mastery.reset(tx, {
        playerId,
        championId: id,
        costs: context.masteryCosts,
      });
      const detail = await championView.loadDetail(tx, playerId, id, context);
      return { champion: detail, crystalsSpent: outcome.crystalsSpent };
    });

    return reply.send(apiSuccess(result, app.content.rev));
  });
};
