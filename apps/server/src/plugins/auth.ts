import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import {
  ADMIN_API_PREFIX,
  ADMIN_ROUTES,
  API_PREFIX,
  ROUTES,
  SESSION_COOKIE,
  type AccountRank,
} from '@mistvale/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AccountRow, PlayerRow } from '../db/schema/index';
import { AppError } from '../lib/errors';
import { resolveSession, type AuthContext } from '../modules/auth/service';

declare module 'fastify' {
  interface FastifyInstance {
    authContext: AuthContext;
    /** Rejects the request unless a valid session is present. */
    requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void>;
    /** Requires a session whose account holds at least the given rank. */
    requireRank(
      minimum: AccountRank,
    ): (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void;
    clearSessionCookie(reply: FastifyReply): void;
  }

  interface FastifyRequest {
    /** Populated by `requireAuth`. */
    account?: AccountRow;
    player?: PlayerRow;
    sessionToken?: string;
  }
}

/** Ranks in ascending order of privilege. */
const RANK_ORDER: Record<AccountRank, number> = { player: 0, gamemaster: 1, admin: 2 };

/**
 * The only routes an account with a forced password change may still reach.
 *
 * Changing the password (the way out), reading who you are (so the client can render the
 * prompt), and signing out (the way back). Anything else waits — including the Admin API,
 * so an admin who has been reset cannot administer their way around it.
 */
const PASSWORD_CHANGE_EXEMPT = new Set([
  `${API_PREFIX}${ROUTES.auth.changePassword}`,
  `${API_PREFIX}${ROUTES.auth.me}`,
  `${API_PREFIX}${ROUTES.auth.logout}`,
  `${API_PREFIX}${ROUTES.auth.logoutAll}`,
  `${ADMIN_API_PREFIX}${ADMIN_ROUTES.auth.me}`,
  `${ADMIN_API_PREFIX}${ADMIN_ROUTES.auth.logout}`,
]);

/**
 * Session authentication.
 *
 * The token travels in an httpOnly cookie (so page scripts cannot read it) and is also
 * accepted as a Bearer header, which the installed PWA uses where cookies are awkward.
 */
export const authPlugin = fp(
  async (app) => {
    await app.register(cookie, {
      // Cookies are signed by the session pepper as a cheap tamper check; the real
      // security is that the token is random and stored only as a hash.
      secret: app.config.SESSION_PEPPER,
      parseOptions: {},
    });

    const authContext: AuthContext = {
      db: app.db,
      sessionPepper: app.config.SESSION_PEPPER,
      sessionTtlDays: app.config.SESSION_TTL_DAYS,
    };
    app.decorate('authContext', authContext);

    app.decorate('setSessionCookie', (reply: FastifyReply, token: string, expiresAt: Date) => {
      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: app.config.secureCookies,
        path: '/',
        expires: expiresAt,
      });
    });

    app.decorate('clearSessionCookie', (reply: FastifyReply) => {
      reply.clearCookie(SESSION_COOKIE, { path: '/' });
    });

    app.decorate('requireAuth', async (request: FastifyRequest) => {
      const token = extractToken(request);
      if (!token) throw AppError.authRequired();

      const resolved = await resolveSession(app.authContext, token);
      if (!resolved) throw AppError.authRequired('Your session has expired. Please sign in again.');

      if (resolved.account.status === 'banned') {
        throw new AppError('ACCOUNT_BANNED', resolved.account.banReason ?? undefined);
      }

      // An admin password reset hands out a temporary password, and this is what makes it
      // temporary: until it has been replaced the account can do exactly two things —
      // change the password, or sign out. Without this the flag would be a suggestion, and
      // an operator would keep knowing a working password indefinitely.
      if (
        resolved.account.forcePasswordChange &&
        !PASSWORD_CHANGE_EXEMPT.has(request.routeOptions.url ?? '')
      ) {
        throw new AppError('PASSWORD_CHANGE_REQUIRED', 'Choose a new password before carrying on.');
      }

      request.account = resolved.account;
      request.player = resolved.player;
      request.sessionToken = token;
    });

    app.decorate(
      'requireRank',
      (minimum: AccountRank) => async (request: FastifyRequest, reply: FastifyReply) => {
        await app.requireAuth(request, reply);
        const rank = request.account?.rank ?? 'player';
        if (RANK_ORDER[rank] < RANK_ORDER[minimum]) {
          // Deliberately vague: a player probing the Admin API learns nothing.
          throw AppError.forbidden();
        }
      },
    );
  },
  { name: 'auth', dependencies: ['database'] },
);

function extractToken(request: FastifyRequest): string | undefined {
  const cookieToken = request.cookies[SESSION_COOKIE];
  if (cookieToken) return cookieToken;

  const header = request.headers.authorization;
  if (header?.startsWith('Bearer ')) {
    const value = header.slice('Bearer '.length).trim();
    if (value.length > 0) return value;
  }
  return undefined;
}
