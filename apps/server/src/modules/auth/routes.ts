import type { FastifyPluginAsync } from 'fastify';
import {
  ROUTES,
  SESSION_COOKIE,
  apiSuccess,
  changePasswordRequestSchema,
  loginRequestSchema,
  registerRequestSchema,
} from '@mistvale/shared';
import { AppError } from '../../lib/errors';
import * as service from './service';

/**
 * Auth endpoints.
 *
 * Registration and login are rate limited per IP: they are the only unauthenticated
 * write paths in the game (docs/ARCHITECTURE.md §5.2).
 */
export const authRoutes: FastifyPluginAsync = async (app) => {
  /**
   * Per-route rate limits, disabled wholesale in tests. Typed as the plugin's own
   * config shape so an omitted limit stays assignable.
   */
  const rateLimited = (
    max: number,
    timeWindow: string,
  ): { rateLimit?: { max: number; timeWindow: string } } =>
    app.config.RATE_LIMIT_ENABLED ? { rateLimit: { max, timeWindow } } : {};

  app.post(ROUTES.auth.register, { config: rateLimited(5, '1 hour') }, async (request, reply) => {
    const input = registerRequestSchema.parse(request.body);

    const issued = await service.register(app.authContext, {
      ...input,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });

    app.setSessionCookie(reply, issued.token, issued.expiresAt);
    request.log.info({ accountName: input.accountName }, 'account registered');

    return reply
      .code(201)
      .send(apiSuccess({ account: issued.account, player: issued.player }, app.contentRevision));
  });

  app.post(ROUTES.auth.login, { config: rateLimited(10, '1 minute') }, async (request, reply) => {
    const input = loginRequestSchema.parse(request.body);

    const issued = await service.login(app.authContext, {
      ...input,
      ip: request.ip,
      userAgent: request.headers['user-agent'] ?? null,
    });

    app.setSessionCookie(reply, issued.token, issued.expiresAt);
    return reply.send(
      apiSuccess({ account: issued.account, player: issued.player }, app.contentRevision),
    );
  });

  app.post(ROUTES.auth.logout, async (request, reply) => {
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      await service.logout(app.authContext, token);
    }
    app.clearSessionCookie(reply);
    return reply.send(apiSuccess({ loggedOut: true }, app.contentRevision));
  });

  app.post(ROUTES.auth.logoutAll, { preHandler: app.requireAuth }, async (request, reply) => {
    const account = request.account;
    if (!account) throw AppError.authRequired();

    const revoked = await service.logoutAll(app.authContext, account.id);
    app.clearSessionCookie(reply);
    return reply.send(apiSuccess({ revoked }, app.contentRevision));
  });

  app.get(ROUTES.auth.me, { preHandler: app.requireAuth }, async (request, reply) => {
    const { account, player } = request;
    if (!account || !player) throw AppError.authRequired();

    return reply.send(
      apiSuccess(service.buildSessionResponse(account, player, new Date()), app.contentRevision),
    );
  });

  app.post(
    ROUTES.auth.changePassword,
    { preHandler: app.requireAuth, config: rateLimited(5, '15 minutes') },
    async (request, reply) => {
      const account = request.account;
      if (!account) throw AppError.authRequired();

      const input = changePasswordRequestSchema.parse(request.body);
      await service.changePassword(app.authContext, {
        accountId: account.id,
        currentPassword: input.currentPassword,
        newPassword: input.newPassword,
      });

      // Every session was revoked, including this one — the client must sign in again.
      app.clearSessionCookie(reply);
      request.log.info({ accountId: account.id }, 'password changed');
      return reply.send(apiSuccess({ changed: true }, app.contentRevision));
    },
  );
};
