import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  ROUTES,
  apiSuccess,
  routePattern,
  worldBossClaimRequestSchema,
  worldBossSpoilsRequestSchema,
} from '@mistvale/shared';
import { players } from '../../db/schema/index';
import { AppError } from '../../lib/errors';
import { keyParam } from '../../lib/params';
import * as rewards from '../rewards/service';
import * as worldboss from './service';

/**
 * The Wurm Wakes: one read and two claims.
 *
 * Striking it is an ordinary battle through the battle routes (`mode: 'worldBoss'`), so
 * playback, Auto, the speed ladder and resuming after a reload are all the code that
 * already exists. What is here is the wake — the shared pool, the board, this account's
 * contribution — and the two things it can pay out.
 *
 * Both claims answer with the **whole view** again rather than only what they paid. A claim
 * moves the ladder, the badge and sometimes the account level, and the alternative is a
 * follow-up read that renders a screen one claim out of date.
 */
export const worldBossRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  const requireWarden = async (request: { player?: { id: string } | null }) => {
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
    return {
      playerId,
      level: player.level,
      dailyCounters: player.dailyCounters,
      dailyCountersDay: player.dailyCountersDay,
    };
  };

  app.get(ROUTES.worldBoss.state, async (request, reply) => {
    const warden = await requireWarden(request);
    const view = await worldboss.overview(app.db, app.content, warden, new Date());
    return reply.send(apiSuccess({ worldBoss: view }, app.content.rev));
  });

  app.post(routePattern(ROUTES.worldBoss.claim, 'key'), async (request, reply) => {
    const warden = await requireWarden(request);
    const dungeonKey = keyParam(request);
    const body = worldBossClaimRequestSchema.parse(request.body);
    const now = new Date();

    const paid = await app.db.transaction(async (tx) => {
      const bundle = await worldboss.claimTier(
        tx,
        app.content,
        warden.playerId,
        dungeonKey,
        body.tierKey,
        now,
      );
      // Through `RewardService` like every other payout in the game, so a rung lands in
      // `economy_log` beside a stage clear and an operator's grant.
      if (Object.keys(bundle).length > 0) {
        await rewards.grant(tx, warden.playerId, bundle, `worldBoss:${dungeonKey}:${body.tierKey}`);
      }
      return bundle;
    });

    const view = await worldboss.overview(app.db, app.content, await requireWarden(request), now);
    return reply.send(apiSuccess({ rewards: paid, worldBoss: view }, app.content.rev));
  });

  app.post(routePattern(ROUTES.worldBoss.spoils, 'key'), async (request, reply) => {
    const warden = await requireWarden(request);
    const dungeonKey = keyParam(request);
    worldBossSpoilsRequestSchema.parse(request.body);
    const now = new Date();

    const paid = await app.db.transaction(async (tx) => {
      const bundle = await worldboss.claimSpoils(tx, app.content, warden.playerId, dungeonKey, now);
      if (Object.keys(bundle).length > 0) {
        await rewards.grant(tx, warden.playerId, bundle, `worldBoss:${dungeonKey}:spoils`);
      }
      return bundle;
    });
    request.log.info({ playerId: warden.playerId, dungeonKey }, 'world boss spoils claimed');

    const view = await worldboss.overview(app.db, app.content, await requireWarden(request), now);
    return reply.send(apiSuccess({ rewards: paid, worldBoss: view }, app.content.rev));
  });
};
