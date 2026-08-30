import type { FastifyPluginAsync } from 'fastify';
import { ADMIN_ROUTES, adminBattleQuerySchema, apiSuccess, routePattern } from '@mistvale/shared';
import { battleDetail, listBattles } from './battles';
import { idParam } from '../lib/params';

/**
 * The battle inspector (ADMIN_SUITE_DESIGN §2.18).
 *
 * Two reads and no writes. Nothing here is audited, for the same reason the balance
 * sandbox is not: the audit log records what an operator *changed*, and looking at a
 * fight changes nothing.
 */
export const adminBattleRoutes: FastifyPluginAsync = async (app) => {
  app.get(ADMIN_ROUTES.battles.list, async (request, reply) => {
    const query = adminBattleQuerySchema.parse(request.query ?? {});
    return reply.send(apiSuccess(await listBattles(app.db, query), app.content.rev));
  });

  app.get(routePattern(ADMIN_ROUTES.battles.detail), async (request, reply) => {
    return reply.send(apiSuccess(await battleDetail(app.db, idParam(request)), app.content.rev));
  });
};
