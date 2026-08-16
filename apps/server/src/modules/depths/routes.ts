import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiSuccess, type Depths, type DungeonStanding } from '@mistvale/shared';
import { players } from '../../db/schema/index';
import { AppError } from '../../lib/errors';
import * as depths from './service';

/**
 * What the Depths hub reads.
 *
 * Only two facts here are the server's to know — which keeps are open today, and how deep
 * this player has been. Names, floor counts and what a dungeon drops all come from the
 * content bundle the client already holds, so a fifth dungeon published in Admin appears
 * on the hub with no client change (CLAUDE.md — content is data).
 */
export const depthsRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('preHandler', app.requireAuth);

  app.get(ROUTES.depths.overview, async (request, reply) => {
    const playerId = request.player?.id;
    if (!playerId) throw AppError.authRequired();

    const [player] = await app.db
      .select({ level: players.level, createdAt: players.createdAt })
      .from(players)
      .where(eq(players.id, playerId));
    if (!player) throw AppError.notFound('No such player.');

    const bundle = app.content.current().bundle;
    const context = depths.contextFor(player, bundle.config, new Date());

    // Floor numbers come from the published stages, so "deepest floor" means what the
    // hub's floor picker means by it.
    const floorNumbers = new Map(bundle.stages.map((stage) => [stage.key, stage.number]));
    const reached = await depths.standings(app.db, playerId, floorNumbers);

    const dungeons: DungeonStanding[] = bundle.dungeons.map((dungeon) => {
      const gate = depths.gateFor(dungeon, player.level, context.rotation);
      const standing = reached.get(dungeon.key);
      return {
        dungeonKey: dungeon.key,
        open: gate.open,
        lockedReason: gate.reason,
        highestFloor: standing?.highestFloor ?? 0,
        clears: standing?.clears ?? 0,
        nextOpenDay: depths.nextOpenDay(dungeon, context.rotation),
      };
    });

    const payload: Depths = {
      today: context.day.date,
      weekday: context.day.weekday,
      graceUntil: context.graceUntil?.toISOString() ?? null,
      dungeons,
    };
    return reply.send(apiSuccess({ depths: payload }, app.content.rev));
  });
};
