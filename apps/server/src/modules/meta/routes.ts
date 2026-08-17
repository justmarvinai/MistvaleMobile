import type { FastifyPluginAsync } from 'fastify';
import {
  ROUTES,
  apiSuccess,
  missionClaimRequestSchema,
  questChestClaimRequestSchema,
  questClaimRequestSchema,
  routePattern,
} from '@mistvale/shared';
import { AppError } from '../../lib/errors';
import * as missions from './missions';
import * as quests from './quests';

/**
 * The checklist.
 *
 * `GET /quests` answers the whole screen — every period, its chest, and the first-win
 * bonuses — because they all hang off the same daily boundary and three requests would be
 * three chances to straddle it.
 *
 * Both claims return the whole screen again rather than just what they paid. A claim
 * changes the chest meter, the badge count and sometimes the account level, so the
 * alternative is a follow-up read that renders a screen one claim out of date.
 */
export const questRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  const requirePlayer = (request: { player?: { id: string } | null }): string => {
    const id = request.player?.id;
    if (!id) throw AppError.authRequired();
    return id;
  };

  const ctx = (): quests.QuestContext => ({ db: app.db, content: app.content });

  app.get(ROUTES.quests.state, async (request, reply) => {
    const view = await quests.overview(ctx(), requirePlayer(request));
    return reply.send(apiSuccess({ quests: view }, app.content.rev));
  });

  app.post(routePattern(ROUTES.quests.claim, 'key'), async (request, reply) => {
    const { key } = request.params as { key: string };
    const body = questClaimRequestSchema.parse(request.body);
    const result = await quests.claim(ctx(), requirePlayer(request), key, body.actionId);
    return reply.send(apiSuccess(result, app.content.rev));
  });

  app.post(ROUTES.quests.claimChest, async (request, reply) => {
    const body = questChestClaimRequestSchema.parse(request.body);
    const result = await quests.claimChest(
      ctx(),
      requirePlayer(request),
      body.period,
      body.actionId,
    );
    return reply.send(apiSuccess(result, app.content.rev));
  });

  // ── The Valewarden's Path ─────────────────────────────────────────────────

  app.get(ROUTES.missions.state, async (request, reply) => {
    const view = await missions.overview(ctx(), requirePlayer(request));
    return reply.send(apiSuccess({ missions: view }, app.content.rev));
  });

  app.post(routePattern(ROUTES.missions.claim, 'key'), async (request, reply) => {
    const { key } = request.params as { key: string };
    const body = missionClaimRequestSchema.parse(request.body);
    const result = await missions.claim(ctx(), requirePlayer(request), key, body.actionId);
    request.log.info(
      { playerId: requirePlayer(request), missionKey: key, champions: result.champions },
      'mission claimed',
    );
    return reply.send(apiSuccess(result, app.content.rev));
  });
};
