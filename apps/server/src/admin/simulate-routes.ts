import type { FastifyPluginAsync } from 'fastify';
import {
  ADMIN_ROUTES,
  adminSimulateRequestSchema,
  apiSuccess,
  BENCH_TIER_KEYS,
} from '@mistvale/shared';
import { simulate } from './simulate';

/**
 * The balance sandbox, over HTTP.
 *
 * One route, no writes, and deliberately **no audit entry**: the audit log is the record of
 * what an operator *changed*, and a simulation changes nothing. Filling it with "somebody
 * pressed Simulate" would bury the entries that matter, which is the same reasoning that
 * keeps reads out of it everywhere else.
 *
 * The tiers are listed on the response of a bad request rather than fetched from a second
 * endpoint: there are three of them, they are a closed set, and a round trip to learn three
 * words is a round trip nobody should pay.
 */
export const adminSimulateRoutes: FastifyPluginAsync = async (app) => {
  app.post(ADMIN_ROUTES.simulate.stage, async (request, reply) => {
    const input = adminSimulateRequestSchema.parse(request.body);
    const result = await simulate({ content: app.content }, input);

    request.log.info(
      { stageKey: input.stageKey, source: input.source, tier: input.tier, runs: result.runs },
      'balance sandbox run',
    );

    return reply.send(apiSuccess({ result, tiers: BENCH_TIER_KEYS }, app.content.rev));
  });
};
