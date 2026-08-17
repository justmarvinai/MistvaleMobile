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
import { multiState } from '../battle/service';
import * as events from '../meta/events';
import * as login from '../meta/login';
import * as mailService from '../mail/service';
import * as missions from '../meta/missions';
import * as quests from '../meta/quests';

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
          // The honorific the Path awarded, shown beside the profile name.
          title: player.title,
          unlocks: computeUnlocks(player.level),
          // Today's farming allowance rides on the snapshot the shell already refetches
          // after every battle, so the team-select screen never has to ask for it.
          multiBattle: multiState(app.content, player, now),
          // Dock pips, computed rather than polled (UI_UX §1.3). One query, on a request
          // the shell already makes after every fight — which is exactly when a quest
          // becomes claimable.
          badges: {
            quests: await quests.claimableCount(
              { db: app.db, content: app.content },
              player.id,
              player,
              now,
            ),
            missions: await missions.claimableCount(
              { db: app.db, content: app.content },
              player.id,
            ),
            events: await events.claimableCount(
              { db: app.db, content: app.content },
              player.id,
              player.level,
              now,
            ),
            calendar: await login.claimableCount(
              { db: app.db, content: app.content },
              player.id,
              player.level,
              now,
            ),
            mail: await mailService.waitingCount(
              { db: app.db, content: app.content },
              player.id,
              now,
            ),
          },
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
