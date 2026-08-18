import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ROUTES, SESSION_COOKIE, apiPath } from '@mistvale/shared';
import { buildApp } from '../app';
import {
  isDatabaseAvailable,
  extractSessionCookie,
  testConfig,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../test/harness';

/**
 * Rate limiting must answer with the standard error envelope.
 *
 * Regression guard: a custom `errorResponseBuilder` used to return a plain object,
 * which Fastify treated as an unhandled error — throttled players received a 500 with
 * "Something went wrong on our end" instead of a clear "too many attempts". Formatting
 * now happens in the global error handler, and this pins that behaviour.
 */

const dbUp = await isDatabaseAvailable();

describe.skipIf(!dbUp)('rate limiting', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = testConfig();
    // The harness disables limits by default; this suite needs them on.
    app = await buildApp({
      config: { ...config, RATE_LIMIT_ENABLED: true },
      logger: false,
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
  });

  it('answers throttled registrations with a 429 RATE_LIMITED envelope', async () => {
    const attempt = () =>
      app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.register),
        payload: {
          accountName: uniqueAccountName(),
          profileName: uniqueProfileName(),
          password: 'a-good-long-password',
        },
        remoteAddress: '203.0.113.7',
      });

    // The registration limit is 5 per hour per IP.
    const allowed = [];
    for (let i = 0; i < 5; i += 1) {
      allowed.push(await attempt());
    }
    expect(allowed.every((response) => response.statusCode === 201)).toBe(true);

    const throttled = await attempt();

    expect(throttled.statusCode).toBe(429);
    const body = throttled.json();
    expect(body.ok).toBe(false);
    expect(body.error.code).toBe('RATE_LIMITED');
    // The message must be player-readable, never a stack or a raw object.
    expect(body.error.message).toMatch(/too many/i);
    expect(body.error.requestId).toBeTypeOf('string');
    expect(body).toHaveProperty('rev');
  });

  /**
   * Two wardens on one connection must not throttle each other.
   *
   * The global limiter claims to bucket authenticated traffic per account. It did not:
   * at the default `onRequest` hook `request.account` has not been resolved yet — a
   * route's own `preHandler` does that — so the key fell through to the IP and every
   * player behind one address shared a single 300/minute allowance. A household, a
   * student flat, or anyone testing two accounts side by side would have throttled a
   * stranger.
   */
  it('counts an authenticated player against their account, not their address', async () => {
    const signUp = async () => {
      const response = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.register),
        payload: {
          accountName: uniqueAccountName(),
          profileName: uniqueProfileName(),
          password: 'a-good-long-password',
        },
        remoteAddress: '198.51.100.4',
      });
      expect(response.statusCode).toBe(201);
      const cookie = extractSessionCookie(response.headers['set-cookie']);
      expect(cookie).toBeTypeOf('string');
      return cookie as string;
    };

    // Both accounts register from the same address, and both then read from it.
    const first = await signUp();
    const second = await signUp();

    const read = (cookie: string) =>
      app.inject({
        method: 'GET',
        url: apiPath(ROUTES.player.self),
        cookies: { [SESSION_COOKIE]: cookie },
        remoteAddress: '198.51.100.4',
      });

    // 300 a minute is the shared allowance; spend well past it on one account.
    for (let i = 0; i < 320; i += 1) {
      await read(first);
    }

    const throttled = await read(first);
    expect(throttled.statusCode, 'the busy account should be throttled').toBe(429);

    const neighbour = await read(second);
    expect(neighbour.statusCode, 'the quiet account shares only an address').toBe(200);
  });
});
