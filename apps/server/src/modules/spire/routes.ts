import type { FastifyPluginAsync } from 'fastify';
import { ROUTES, apiSuccess, routePattern, spireClaimRequestSchema } from '@mistvale/shared';
import { AppError } from '../../lib/errors';
import { keyParam } from '../../lib/params';
import * as rewards from '../rewards/service';
import * as spire from './service';

/**
 * The Mistspire: one read and one claim.
 *
 * Climbing a floor is an ordinary battle through the battle routes (`mode: 'spire'`), so
 * playback, Auto, the speed ladder and resuming after a reload are all the code that
 * already exists. What is here is the tower — the floors, their wards, the keys left today
 * and the landings this month's climb has reached.
 *
 * The claim answers with the **whole view** again rather than only what it paid, for the
 * reason every other claim in the game does: collecting moves the ladder and sometimes the
 * account level, and the alternative is a follow-up read that renders a screen one claim
 * out of date.
 */
export const spireRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  const requireClimber = async (request: { player?: { id: string } | null }) => {
    const playerId = request.player?.id;
    if (!playerId) throw AppError.authRequired();
    return spire.contextFor(app.db, playerId);
  };

  app.get(ROUTES.spire.state, async (request, reply) => {
    const climber = await requireClimber(request);
    const view = await spire.overview(app.db, app.content, climber, new Date());
    return reply.send(apiSuccess({ spire: view }, app.content.rev));
  });

  app.post(routePattern(ROUTES.spire.claim, 'key'), async (request, reply) => {
    const climber = await requireClimber(request);
    const dungeonKey = keyParam(request);
    const body = spireClaimRequestSchema.parse(request.body);
    const now = new Date();

    const paid = await app.db.transaction(async (tx) => {
      const claim = await spire.claimLanding(
        tx,
        app.content,
        climber,
        dungeonKey,
        body.landingKey,
        now,
      );
      // Through `RewardService` like every other payout in the game, so a landing lands in
      // `economy_log` beside a stage clear and an operator's grant.
      if (Object.keys(claim.rewards).length > 0) {
        await rewards.grant(
          tx,
          climber.playerId,
          claim.rewards,
          `spire:${dungeonKey}:${body.landingKey}`,
        );
      }
      return claim.rewards;
    });

    const view = await spire.overview(app.db, app.content, await requireClimber(request), now);
    return reply.send(apiSuccess({ rewards: paid, spire: view }, app.content.rev));
  });
};
