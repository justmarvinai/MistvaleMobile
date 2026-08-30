import type { FastifyPluginAsync } from 'fastify';
import {
  ROUTES,
  apiSuccess,
  followRequestSchema,
  routePattern,
  standardBearerRequestSchema,
} from '@mistvale/shared';
import { AppError } from '../../lib/errors';
import { idParam } from '../../lib/params';
import * as warband from './service';

/**
 * Wardens (C37).
 *
 * Thin, like every other module's routes: the rules live in `service.ts`. Nothing here is
 * audited and nothing goes through `RewardService`, because keeping a warden pays nobody
 * anything — a lend's only return is a number on a profile, and a currency for being
 * borrowed would be thirty alts and thirty payouts.
 */
export const warbandRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  const requirePlayer = (request: { player?: { id: string } | null }): string => {
    const id = request.player?.id;
    if (!id) throw AppError.authRequired();
    return id;
  };

  const ctx = (): warband.WarbandContext => ({ db: app.db, content: app.content });

  app.get(ROUTES.warband.list, async (request, reply) => {
    const list = await warband.warband(ctx(), requirePlayer(request));
    return reply.send(apiSuccess(list, app.content.rev));
  });

  app.post(ROUTES.warband.follow, async (request, reply) => {
    const body = followRequestSchema.parse(request.body ?? {});
    const kept = await warband.follow(ctx(), requirePlayer(request), body.profileName);
    return reply.status(201).send(apiSuccess(kept, app.content.rev));
  });

  app.delete(routePattern(ROUTES.warband.unfollow), async (request, reply) => {
    await warband.unfollow(ctx(), requirePlayer(request), idParam(request));
    return reply.send(apiSuccess({ kept: false }, app.content.rev));
  });

  app.put(ROUTES.warband.standardBearer, async (request, reply) => {
    const body = standardBearerRequestSchema.parse(request.body ?? {});
    await warband.setStandardBearer(ctx(), requirePlayer(request), body.championId);
    const list = await warband.warband(ctx(), requirePlayer(request));
    return reply.send(apiSuccess(list, app.content.rev));
  });
};
