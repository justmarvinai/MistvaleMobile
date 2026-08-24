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

    // Titans and world bosses are not keeps in the Depths sense — no floors, no rotation,
    // no clears — and each has its own screen. Filtered here rather than at the seed so both
    // can go on using the `dungeon` content type, which is where every other thing about
    // them fits. A kind added without a home here would quietly appear on the hub with a
    // floor count of one and nothing behind it, so the list is a *deny*-list on purpose.
    const keeps = bundle.dungeons.filter(
      (dungeon) => dungeon.kind !== 'titan' && dungeon.kind !== 'worldBoss',
    );

    const dungeons: DungeonStanding[] = keeps.map((dungeon) => {
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
