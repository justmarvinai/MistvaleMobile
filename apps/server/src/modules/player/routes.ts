import type { FastifyPluginAsync } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  DEFAULT_PLAYER_SETTINGS,
  ROUTES,
  apiSuccess,
  computeUnlocks,
  updateSettingsRequestSchema,
} from '@mistvale/shared';
import { players } from '../../db/schema/index';
import { AppError } from '../../lib/errors';
import { toPlayerSummary } from '../auth/service';

/**
 * Player snapshot and settings.
 *
 * `GET /api/player` is what the client fetches on boot and when re-entering a screen —
 * it is the authoritative view of everything the shell renders. It grows across phases
 * (roster, inventory, badges); P0 covers profile, wallet, energy and unlock flags.
 */
export const playerRoutes: FastifyPluginAsync = async (app) => {
  app.get(ROUTES.player.self, { preHandler: app.requireAuth }, async (request, reply) => {
    const { account, player } = request;
    if (!account || !player) throw AppError.authRequired();

    const now = new Date();
    return reply.send(
      apiSuccess(
        {
          account: {
            id: account.id,
            accountName: account.accountName,
            rank: account.rank,
            forcePasswordChange: account.forcePasswordChange,
          },
          player: toPlayerSummary(player, now),
          unlocks: computeUnlocks(player.level),
          settings: { ...DEFAULT_PLAYER_SETTINGS, ...player.settings },
          serverTime: now.toISOString(),
        },
        app.contentRevision,
      ),
    );
  });

  app.patch(ROUTES.player.settings, { preHandler: app.requireAuth }, async (request, reply) => {
    const player = request.player;
    if (!player) throw AppError.authRequired();

    const patch = updateSettingsRequestSchema.parse(request.body);
    // Merge over defaults so a settings key added in a later release is never missing.
    const settings = { ...DEFAULT_PLAYER_SETTINGS, ...player.settings, ...patch };

    await app.db
      .update(players)
      .set({ settings, updatedAt: new Date() })
      .where(eq(players.id, player.id));

    return reply.send(apiSuccess({ settings }, app.contentRevision));
  });
};
