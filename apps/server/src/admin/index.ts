import type { FastifyPluginAsync } from 'fastify';
import { sql } from 'drizzle-orm';
import { ADMIN_ROUTES, apiSuccess, loginRequestSchema } from '@mistvale/shared';
import { accounts, auditLog, players } from '../db/schema/index';
import { AppError } from '../lib/errors';
import * as authService from '../modules/auth/service';
import { adminContentRoutes } from './content-routes';
import { adminPlayerRoutes } from './player-routes';
import { adminBotRoutes } from './bot-routes';
import { adminMailRoutes } from './mail-routes';
import { adminJobRoutes } from './job-routes';
import { adminSimulateRoutes } from './simulate-routes';
import { adminAuditRoutes } from './audit-routes';
import { readActivity } from './activity';

/**
 * The Admin API.
 *
 * Mounted under `/admin/api` and gated on the `admin` account rank — the same account
 * system as the game, so there is no second set of credentials to manage
 * (docs/ARCHITECTURE.md §5.6).
 */
export const adminApi: FastifyPluginAsync = async (app) => {
  // Login is the one route that cannot require an existing admin session.
  app.post(ADMIN_ROUTES.auth.login, async (request, reply) => {
    const input = loginRequestSchema.parse(request.body);

    const issued = await authService.login(app.authContext, {
      ...input,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });

    if (issued.account.rank !== 'admin') {
      // Deliberately the same message a wrong password gets: probing the Admin API
      // should not reveal which accounts hold which rank.
      throw AppError.invalidCredentials();
    }

    app.setSessionCookie(reply, issued.token, issued.expiresAt);
    request.log.info({ accountName: issued.account.accountName }, 'admin signed in');

    return reply.send(apiSuccess({ account: issued.account }, app.content.rev));
  });

  // Everything below requires an admin session.
  await app.register(async (guarded) => {
    guarded.addHook('preHandler', guarded.requireRank('admin'));

    guarded.get(ADMIN_ROUTES.auth.me, async (request, reply) => {
      const account = request.account;
      if (!account) throw AppError.authRequired();
      return reply.send(
        apiSuccess({ account: authService.toAccountSummary(account) }, app.content.rev),
      );
    });

    guarded.post(ADMIN_ROUTES.auth.logout, async (request, reply) => {
      if (request.sessionToken) {
        await authService.logout(app.authContext, request.sessionToken);
      }
      app.clearSessionCookie(reply);
      return reply.send(apiSuccess({ loggedOut: true }, app.content.rev));
    });

    guarded.get(ADMIN_ROUTES.stats.overview, async (_request, reply) => {
      const [[playerStats], [accountStats], recentAudit, activity] = await Promise.all([
        app.db
          .select({
            total: sql<number>`count(*)::int`,
            bots: sql<number>`count(*) filter (where ${players.isBot})::int`,
            activeToday: sql<number>`count(*) filter (where ${players.updatedAt} > now() - interval '1 day')::int`,
          })
          .from(players),
        app.db
          .select({
            total: sql<number>`count(*)::int`,
            admins: sql<number>`count(*) filter (where ${accounts.rank} = 'admin')::int`,
            banned: sql<number>`count(*) filter (where ${accounts.status} = 'banned')::int`,
          })
          .from(accounts),
        app.db
          .select({
            actor: auditLog.actor,
            action: auditLog.action,
            entity: auditLog.entity,
            entityId: auditLog.entityId,
            createdAt: auditLog.createdAt,
          })
          .from(auditLog)
          .orderBy(sql`${auditLog.createdAt} desc`)
          .limit(10),
        readActivity(app.db),
      ]);

      const snapshot = app.content.current();

      return reply.send(
        apiSuccess(
          {
            players: playerStats ?? { total: 0, bots: 0, activeToday: 0 },
            accounts: accountStats ?? { total: 0, admins: 0, banned: 0 },
            content: {
              rev: snapshot.rev,
              publishedAt: snapshot.publishedAt,
              champions: snapshot.bundle.champions.length,
              skills: snapshot.bundle.skills.length,
              enemies: snapshot.bundle.enemies.length,
              stages: snapshot.bundle.stages.length,
            },
            activity,
            recentAudit: recentAudit.map((row) => ({
              ...row,
              createdAt: row.createdAt.toISOString(),
            })),
          },
          snapshot.rev,
        ),
      );
    });

    await guarded.register(adminContentRoutes);
    await guarded.register(adminPlayerRoutes);
    await guarded.register(adminBotRoutes);
    await guarded.register(adminMailRoutes);
    await guarded.register(adminJobRoutes);
    await guarded.register(adminSimulateRoutes);
    await guarded.register(adminAuditRoutes);
  });
};
