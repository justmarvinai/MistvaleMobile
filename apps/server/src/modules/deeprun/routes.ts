import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  ROUTES,
  apiSuccess,
  beginDeepRunRequestSchema,
  enterDeepRunRoomRequestSchema,
  retireDeepRunRequestSchema,
  routePattern,
  takeDeepRunBoonRequestSchema,
} from '@mistvale/shared';
import { players } from '../../db/schema/index';
import { AppError } from '../../lib/errors';
import { keyParam } from '../../lib/params';
import * as battle from '../battle/service';
import * as meta from '../meta/progress';
import * as rewards from '../rewards/service';
import * as deeprun from './service';

/**
 * The Deep Run: one read and four presses.
 *
 * The fight inside a descent is an ordinary battle, so nothing here re-implements playback,
 * Auto, the speed ladder or resuming after a reload. What is here is the *machine*: begin a
 * descent, open a door, take a boon, walk out.
 *
 * **Opening a fighting door starts the battle in the same request.** Two calls would leave a
 * window where the run says it is in a battle and no battle exists — and a player who closed
 * the tab in that window would be stuck on a floor with nothing to press.
 */
export const deepRunRoutes: FastifyPluginAsync = async (app) => {
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

  const view = async (request: { player?: { id: string } | null }, now: Date) =>
    deeprun.overview(app.db, app.content, await requireWarden(request), now);

  app.get(ROUTES.deepRun.state, async (request, reply) => {
    return reply.send(apiSuccess({ deepRun: await view(request, new Date()) }, app.content.rev));
  });

  app.post(routePattern(ROUTES.deepRun.begin, 'key'), async (request, reply) => {
    const warden = await requireWarden(request);
    const runKey = keyParam(request);
    const body = beginDeepRunRequestSchema.parse(request.body);
    const now = new Date();

    await app.db.transaction((tx) =>
      deeprun.begin(tx, app.content, warden, runKey, body.championIds, now),
    );
    request.log.info(
      { playerId: warden.playerId, runKey, party: body.championIds.length },
      'deep run begun',
    );
    return reply.send(apiSuccess({ deepRun: await view(request, now) }, app.content.rev));
  });

  app.post(routePattern(ROUTES.deepRun.enter, 'key'), async (request, reply) => {
    const warden = await requireWarden(request);
    const runKey = keyParam(request);
    const body = enterDeepRunRoomRequestSchema.parse(request.body);
    const now = new Date();

    // The door is opened and, when it is a fight, the battle started — in one request, so
    // there is no window where the run says `inBattle` and no battle exists.
    const outcome = await app.db.transaction(async (tx) => {
      const door = await deeprun.enterRoom(tx, app.content, warden.playerId, runKey, body.roomKey);
      if (Object.keys(door.paid).length > 0) {
        await rewards.grant(tx, warden.playerId, door.paid, `deepRun:${runKey}:${body.roomKey}`);
      }
      return door;
    });

    if (outcome.room.kind !== 'fight' && outcome.room.kind !== 'elite') {
      return reply.send(
        apiSuccess(
          { deepRun: await view(request, now), paid: outcome.paid, battle: null },
          app.content.rev,
        ),
      );
    }

    // The party as it stands: the fallen do not come to the next fight, which is the rule
    // the whole mode turns on.
    const run = await deeprun.activeRun(app.db, warden.playerId, runKey);
    const team = deeprun
      .standing((run?.party ?? []) as deeprun.PartyMember[])
      .map((member) => member.championId);
    if (team.length === 0) throw new AppError('VALIDATION', 'Nobody is left standing.');

    const opened = await battle.start(
      { db: app.db, content: app.content },
      {
        playerId: warden.playerId,
        mode: 'deepRun',
        stageKey: body.roomKey,
        team,
        actionId: body.actionId,
      },
    );
    await app.db.transaction((tx) => deeprun.noteBattle(tx, warden.playerId, runKey, opened.id));

    return reply.send(
      apiSuccess({ deepRun: await view(request, now), paid: {}, battle: opened }, app.content.rev),
    );
  });

  app.post(routePattern(ROUTES.deepRun.boon, 'key'), async (request, reply) => {
    const warden = await requireWarden(request);
    const runKey = keyParam(request);
    const body = takeDeepRunBoonRequestSchema.parse(request.body);

    await app.db.transaction((tx) =>
      deeprun.takeBoon(tx, app.content, warden.playerId, runKey, body.boonKey),
    );
    return reply.send(apiSuccess({ deepRun: await view(request, new Date()) }, app.content.rev));
  });

  app.post(routePattern(ROUTES.deepRun.retire, 'key'), async (request, reply) => {
    const warden = await requireWarden(request);
    const runKey = keyParam(request);
    retireDeepRunRequestSchema.parse(request.body);
    const now = new Date();

    const outcome = await app.db.transaction(async (tx) => {
      const ended = await deeprun.endRun(tx, app.content, warden.playerId, runKey, 'retired', now);
      if (Object.keys(ended.rewards).length > 0) {
        await rewards.grant(tx, warden.playerId, ended.rewards, `deepRun:${runKey}`);
      }
      // Walking out is still finishing: a descent that reached floor nine reached floor
      // nine, and a mission asking for it should not care how the party left.
      await meta.track(tx, { content: app.content }, warden.playerId, [
        { type: 'deepRunFinished', facts: { runKey } },
        { type: 'deepRunDepth', amount: ended.floor, facts: { runKey } },
      ]);
      return ended;
    });
    request.log.info({ playerId: warden.playerId, runKey, floor: outcome.floor }, 'deep run ended');

    return reply.send(apiSuccess({ deepRun: await view(request, now), outcome }, app.content.rev));
  });
};
