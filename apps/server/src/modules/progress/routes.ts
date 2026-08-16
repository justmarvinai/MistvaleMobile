import type { FastifyPluginAsync } from 'fastify';
import { ROUTES, apiSuccess, type Progress, type StageStanding } from '@mistvale/shared';
import { eq } from 'drizzle-orm';
import { chapterRewards, players } from '../../db/schema/index';
import { AppError } from '../../lib/errors';
import * as progress from './service';

/**
 * What the maps read.
 *
 * One endpoint for every mode, answering the three questions a map asks of each stage:
 * how many stars it has given up, how often it has been cleared, and whether it is open —
 * computed with the same rule the battle route enforces, so the greyed-out stage and the
 * refused request are always the same stage.
 */

export const progressRoutes: FastifyPluginAsync = async (app) => {
  const requirePlayer = (request: { player?: { id: string } | null }): string => {
    const id = request.player?.id;
    if (!id) throw AppError.authRequired();
    return id;
  };

  app.addHook('preHandler', app.requireAuth);

  app.get(ROUTES.progress.stages, async (request, reply) => {
    const playerId = requirePlayer(request);
    const bundle = app.content.current().bundle;

    const [player] = await app.db
      .select({ level: players.level })
      .from(players)
      .where(eq(players.id, playerId));
    if (!player) throw AppError.notFound('No such player.');

    const standings = await progress.standings(app.db, playerId);
    const stagesByKey = new Map(bundle.stages.map((stage) => [stage.key, stage]));
    const chapterNumbers = new Map(
      bundle.campaignChapters.map((chapter) => [chapter.key, chapter.number]),
    );

    const cleared = (stageKey: string): boolean => standings.get(stageKey)?.cleared === true;
    const label = (stageKey: string): string =>
      progress.stageLabel(
        stagesByKey.get(stageKey),
        chapterNumbers.get(stagesByKey.get(stageKey)?.parentKey ?? ''),
      );

    const stages: StageStanding[] = bundle.stages.map((stage) => {
      const standing = standings.get(stage.key);
      const check = progress.checkUnlock(stage, player.level, cleared, label);
      return {
        stageKey: stage.key,
        stars: standing?.stars ?? 0,
        clears: standing?.clears ?? 0,
        bestTurns: standing?.bestTurns ?? null,
        open: check.open,
        lockedReason: check.reason,
      };
    });

    const claims = await app.db
      .select()
      .from(chapterRewards)
      .where(eq(chapterRewards.playerId, playerId));

    const payload: Progress = {
      stages,
      parentStars: Object.fromEntries(await progress.chapterStars(app.db, playerId)),
      claimedChests: Object.fromEntries(
        claims.map((row) => [row.chapterKey, row.claimedTiers ?? []]),
      ),
    };
    return reply.send(apiSuccess({ progress: payload }, app.content.rev));
  });
};
