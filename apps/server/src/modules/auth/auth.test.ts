import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath } from '@mistvale/shared';
import { accounts, sessions } from '../../db/schema/index';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../../test/harness';

/**
 * End-to-end auth behaviour against a real database and a real Fastify instance —
 * the exact code path a browser takes, minus the network.
 */

const dbUp = await isDatabaseAvailable();

describe.skipIf(!dbUp)('auth endpoints', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
  });

  const validRegistration = () => ({
    accountName: uniqueAccountName(),
    profileName: uniqueProfileName(),
    password: 'a-good-long-password',
  });

  async function register(body: Record<string, unknown>) {
    return app.inject({ method: 'POST', url: apiPath(ROUTES.auth.register), payload: body });
  }

  describe('registration', () => {
    it('creates an account, a player and a session', async () => {
      const payload = validRegistration();
      const response = await register(payload);

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.ok).toBe(true);
      expect(body.data.account.accountName).toBe(payload.accountName);
      expect(body.data.account.rank).toBe('player');
      expect(body.data.player.profileName).toBe(payload.profileName);
      expect(body.data.player.level).toBe(1);
      expect(body.data.player.energy.value).toBe(20);
      expect(body.data.player.energy.cap).toBe(20);
      expect(extractSessionCookie(response.headers['set-cookie'])).toBeTruthy();
    });

    it('never returns the password hash', async () => {
      const response = await register(validRegistration());
      expect(JSON.stringify(response.json())).not.toContain('$argon2');
    });

    it('sets an httpOnly session cookie', async () => {
      const response = await register(validRegistration());
      const header = response.headers['set-cookie'];
      const raw = Array.isArray(header) ? header.join(';') : String(header);
      expect(raw).toContain('HttpOnly');
      expect(raw).toContain('SameSite=Lax');
    });

    it('rejects a duplicate account name regardless of case', async () => {
      const payload = validRegistration();
      await register(payload);

      const response = await register({
        ...payload,
        accountName: payload.accountName.toUpperCase(),
        profileName: uniqueProfileName(),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('ALREADY_EXISTS');
      expect(response.json().error.details).toEqual({ field: 'accountName' });
    });

    it('rejects a duplicate profile name regardless of case', async () => {
      const payload = validRegistration();
      await register(payload);

      const response = await register({
        accountName: uniqueAccountName(),
        profileName: payload.profileName.toLowerCase(),
        password: payload.password,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.details).toEqual({ field: 'profileName' });
    });

    it('leaves no orphaned account when the profile name collides', async () => {
      const first = validRegistration();
      await register(first);
      const orphanName = uniqueAccountName();

      await register({
        accountName: orphanName,
        profileName: first.profileName,
        password: first.password,
      });

      const rows = await app.db.select().from(accounts).where(eq(accounts.accountName, orphanName));
      expect(rows).toHaveLength(0);
    });

    it.each([
      ['short account name', { accountName: 'ab' }],
      ['invalid characters', { accountName: 'bad name!' }],
      ['short password', { password: 'tiny' }],
      ['empty profile name', { profileName: '' }],
    ])('rejects %s with a validation error', async (_label, override) => {
      const response = await register({ ...validRegistration(), ...override });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION');
    });
  });

  describe('login', () => {
    it('accepts correct credentials and is case-insensitive on the account name', async () => {
      const payload = validRegistration();
      await register(payload);

      const response = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: payload.accountName.toUpperCase(), password: payload.password },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.player.profileName).toBe(payload.profileName);
      expect(extractSessionCookie(response.headers['set-cookie'])).toBeTruthy();
    });

    it('records the login timestamp', async () => {
      const payload = validRegistration();
      await register(payload);
      await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: payload.accountName, password: payload.password },
      });

      const rows = await app.db
        .select()
        .from(accounts)
        .where(eq(accounts.accountName, payload.accountName));
      expect(rows[0]?.lastLoginAt).toBeInstanceOf(Date);
    });

    it('gives the same generic error for a wrong password and an unknown account', async () => {
      const payload = validRegistration();
      await register(payload);

      const wrongPassword = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: payload.accountName, password: 'not-the-password' },
      });
      const unknownAccount = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: uniqueAccountName(), password: 'not-the-password' },
      });

      expect(wrongPassword.statusCode).toBe(401);
      expect(unknownAccount.statusCode).toBe(401);
      expect(wrongPassword.json().error.code).toBe('INVALID_CREDENTIALS');
      expect(unknownAccount.json().error.message).toBe(wrongPassword.json().error.message);
    });

    it('refuses a banned account', async () => {
      const payload = validRegistration();
      await register(payload);
      await app.db
        .update(accounts)
        .set({ status: 'banned', banReason: 'testing' })
        .where(eq(accounts.accountName, payload.accountName));

      const response = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: payload.accountName, password: payload.password },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('ACCOUNT_BANNED');
    });
  });

  describe('session lifecycle', () => {
    async function registerAndGetCookie(): Promise<{ cookie: string; accountName: string }> {
      const payload = validRegistration();
      const response = await register(payload);
      const cookie = extractSessionCookie(response.headers['set-cookie']);
      if (!cookie) throw new Error('registration did not set a session cookie');
      return { cookie, accountName: payload.accountName };
    }

    it('returns the current session from /auth/me', async () => {
      const { cookie, accountName } = await registerAndGetCookie();

      const response = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.auth.me),
        cookies: { mv_session: cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.account.accountName).toBe(accountName);
    });

    it('accepts the token as a bearer header as well', async () => {
      const { cookie } = await registerAndGetCookie();

      const response = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.auth.me),
        headers: { authorization: `Bearer ${cookie}` },
      });

      expect(response.statusCode).toBe(200);
    });

    it('rejects missing, malformed and expired sessions', async () => {
      const anonymous = await app.inject({ method: 'GET', url: apiPath(ROUTES.auth.me) });
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json().error.code).toBe('AUTH_REQUIRED');

      const garbage = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.auth.me),
        cookies: { mv_session: 'not-a-real-token' },
      });
      expect(garbage.statusCode).toBe(401);

      const { cookie } = await registerAndGetCookie();
      await app.db.update(sessions).set({ expiresAt: new Date(Date.now() - 1000) });
      const expired = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.auth.me),
        cookies: { mv_session: cookie },
      });
      expect(expired.statusCode).toBe(401);
    });

    it('stores only the hash of the session token', async () => {
      const { cookie } = await registerAndGetCookie();
      const rows = await app.db.select().from(sessions);
      expect(rows).toHaveLength(1);
      expect(rows[0]?.tokenHash).not.toBe(cookie);
      expect(rows[0]?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it('invalidates the token on logout', async () => {
      const { cookie } = await registerAndGetCookie();

      const logout = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.logout),
        cookies: { mv_session: cookie },
      });
      expect(logout.statusCode).toBe(200);

      const after = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.auth.me),
        cookies: { mv_session: cookie },
      });
      expect(after.statusCode).toBe(401);
      expect(await app.db.select().from(sessions)).toHaveLength(0);
    });

    it('logging out without a session succeeds quietly', async () => {
      const response = await app.inject({ method: 'POST', url: apiPath(ROUTES.auth.logout) });
      expect(response.statusCode).toBe(200);
    });

    it('revokes every session with logout-all', async () => {
      const payload = validRegistration();
      const first = await register(payload);
      const firstCookie = extractSessionCookie(first.headers['set-cookie']) as string;

      const second = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: payload.accountName, password: payload.password },
      });
      const secondCookie = extractSessionCookie(second.headers['set-cookie']) as string;
      expect(await app.db.select().from(sessions)).toHaveLength(2);

      const response = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.logoutAll),
        cookies: { mv_session: firstCookie },
      });
      expect(response.json().data.revoked).toBe(2);

      for (const cookie of [firstCookie, secondCookie]) {
        const check = await app.inject({
          method: 'GET',
          url: apiPath(ROUTES.auth.me),
          cookies: { mv_session: cookie },
        });
        expect(check.statusCode).toBe(401);
      }
    });
  });

  describe('change password', () => {
    it('changes the password, revokes sessions, and works with the new one', async () => {
      const payload = validRegistration();
      const registration = await register(payload);
      const cookie = extractSessionCookie(registration.headers['set-cookie']) as string;

      const change = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.changePassword),
        cookies: { mv_session: cookie },
        payload: { currentPassword: payload.password, newPassword: 'an-even-better-password' },
      });
      expect(change.statusCode).toBe(200);

      // The old session is gone …
      const oldSession = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.auth.me),
        cookies: { mv_session: cookie },
      });
      expect(oldSession.statusCode).toBe(401);

      // … the old password no longer works …
      const oldPassword = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: payload.accountName, password: payload.password },
      });
      expect(oldPassword.statusCode).toBe(401);

      // … and the new one does.
      const newPassword = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: payload.accountName, password: 'an-even-better-password' },
      });
      expect(newPassword.statusCode).toBe(200);
    });

    it('requires the correct current password', async () => {
      const payload = validRegistration();
      const registration = await register(payload);
      const cookie = extractSessionCookie(registration.headers['set-cookie']) as string;

      const response = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.changePassword),
        cookies: { mv_session: cookie },
        payload: { currentPassword: 'wrong-one', newPassword: 'another-good-password' },
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    });

    it('rejects reusing the same password', async () => {
      const payload = validRegistration();
      const registration = await register(payload);
      const cookie = extractSessionCookie(registration.headers['set-cookie']) as string;

      const response = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.changePassword),
        cookies: { mv_session: cookie },
        payload: { currentPassword: payload.password, newPassword: payload.password },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION');
    });

    it('requires authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.changePassword),
        payload: { currentPassword: 'x'.repeat(12), newPassword: 'y'.repeat(12) },
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
