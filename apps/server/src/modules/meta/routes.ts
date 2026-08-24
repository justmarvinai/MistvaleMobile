import type { FastifyPluginAsync } from 'fastify';
import {
  ROUTES,
  apiSuccess,
  claimExpeditionRequestSchema,
  dispatchExpeditionRequestSchema,
  eventClaimRequestSchema,
  loginClaimRequestSchema,
  tutorialAdvanceRequestSchema,
  missionClaimRequestSchema,
  questChestClaimRequestSchema,
  questClaimRequestSchema,
  routePattern,
} from '@mistvale/shared';
import { AppError } from '../../lib/errors';
import * as events from './events';
import * as expeditions from './expeditions';
import * as login from './login';
import * as missions from './missions';
import * as trials from './trials';
import * as tutorial from './tutorial';
import * as quests from './quests';
import { keyParam, idParam } from '../../lib/params';

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
    const key = keyParam(request);
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
    const key = keyParam(request);
    const body = missionClaimRequestSchema.parse(request.body);
    const result = await missions.claim(ctx(), requirePlayer(request), key, body.actionId);
    request.log.info(
      { playerId: requirePlayer(request), missionKey: key, champions: result.champions },
      'mission claimed',
    );
    return reply.send(apiSuccess(result, app.content.rev));
  });

  // ── Timed events ──────────────────────────────────────────────────────────

  app.get(ROUTES.events.state, async (request, reply) => {
    const view = await events.overview(ctx(), requirePlayer(request));
    return reply.send(apiSuccess({ events: view }, app.content.rev));
  });

  app.post(routePattern(ROUTES.events.claim, 'key'), async (request, reply) => {
    const key = keyParam(request);
    const body = eventClaimRequestSchema.parse(request.body);
    const result = await events.claimMilestone(
      ctx(),
      requirePlayer(request),
      key,
      body.milestone,
      body.actionId,
    );
    return reply.send(apiSuccess(result, app.content.rev));
  });

  // ── The login calendar ────────────────────────────────────────────────────

  app.get(ROUTES.login.state, async (request, reply) => {
    const view = await login.overview(ctx(), requirePlayer(request));
    return reply.send(apiSuccess({ login: view }, app.content.rev));
  });

  app.post(ROUTES.login.claim, async (request, reply) => {
    const body = loginClaimRequestSchema.parse(request.body);
    const playerId = requirePlayer(request);
    const result = await login.claim(ctx(), playerId, body.track, body.actionId, body.choice);
    if (result.champions.length > 0) {
      request.log.info(
        { playerId, track: body.track, day: result.day, champions: result.champions },
        'login champion granted',
      );
    }
    return reply.send(apiSuccess(result, app.content.rev));
  });

  // ── Expeditions (C10c) ────────────────────────────────────────────────────

  /**
   * A required player *level* rather than just an id, because expeditions are unlocked
   * content and the offers a screen shows depend on it. Read from the request's own player
   * row, which the auth preHandler has already loaded.
   */
  const requireWarden = (request: {
    player?: { id: string; level: number } | null;
  }): { id: string; level: number } => {
    const player = request.player;
    if (!player) throw AppError.authRequired();
    return player;
  };

  app.get(ROUTES.expeditions.state, async (request, reply) => {
    const warden = requireWarden(request);
    const state = await expeditions.stateFor(ctx(), warden.id, warden.level, new Date());
    return reply.send(apiSuccess({ expeditions: state }, app.content.rev));
  });

  app.post(routePattern(ROUTES.expeditions.dispatch, 'key'), async (request, reply) => {
    const warden = requireWarden(request);
    const key = keyParam(request);
    const body = dispatchExpeditionRequestSchema.parse(request.body);

    const state = await expeditions.dispatch(
      ctx(),
      warden.id,
      warden.level,
      key,
      body.championIds,
      new Date(),
    );
    request.log.info(
      { playerId: warden.id, expeditionKey: key, party: body.championIds.length },
      'expedition dispatched',
    );
    return reply.send(apiSuccess({ expeditions: state }, app.content.rev));
  });

  app.post(routePattern(ROUTES.expeditions.claim), async (request, reply) => {
    const warden = requireWarden(request);
    const id = idParam(request);
    claimExpeditionRequestSchema.parse(request.body);

    const now = new Date();
    const outcome = await expeditions.claim(ctx(), warden.id, id, now);
    const state = await expeditions.stateFor(ctx(), warden.id, warden.level, now);
    return reply.send(apiSuccess({ ...outcome, state }, app.content.rev));
  });

  app.post(routePattern(ROUTES.expeditions.recall), async (request, reply) => {
    const warden = requireWarden(request);
    const id = idParam(request);

    const championIds = await expeditions.recall(ctx(), warden.id, id);
    const state = await expeditions.stateFor(ctx(), warden.id, warden.level, new Date());
    request.log.info({ playerId: warden.id, runId: id }, 'expedition recalled');
    return reply.send(apiSuccess({ championIds, expeditions: state }, app.content.rev));
  });

  // ── Trials (C10d) ─────────────────────────────────────────────────────────

  /**
   * A read and nothing else. A trial is fought through the ordinary battle routes, which
   * is the whole reason it needs no second implementation of playback, Auto, the speed
   * ladder or a reload mid-fight.
   */
  app.get(ROUTES.trials.overview, async (request, reply) => {
    const warden = requireWarden(request);
    const view = await trials.overview(ctx(), warden.id, warden.level);
    return reply.send(apiSuccess({ trials: view }, app.content.rev));
  });

  // ── The tutorial ──────────────────────────────────────────────────────────

  app.get(ROUTES.tutorial.state, async (request, reply) => {
    const view = await tutorial.overview(ctx(), requirePlayer(request));
    return reply.send(apiSuccess({ tutorial: view }, app.content.rev));
  });

  app.post(ROUTES.tutorial.advance, async (request, reply) => {
    const body = tutorialAdvanceRequestSchema.parse(request.body);
    const result = await tutorial.advance(ctx(), requirePlayer(request), body.actionId);
    return reply.send(apiSuccess(result, app.content.rev));
  });

  app.post(ROUTES.tutorial.skip, async (request, reply) => {
    const playerId = requirePlayer(request);
    const view = await tutorial.skip(ctx(), playerId);
    request.log.info({ playerId }, 'tutorial skipped');
    return reply.send(apiSuccess({ tutorial: view }, app.content.rev));
  });
};
