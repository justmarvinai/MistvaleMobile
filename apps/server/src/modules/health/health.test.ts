import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath } from '@mistvale/shared';
import { accounts } from '../../db/schema/index';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../../test/harness';

const dbUp = await isDatabaseAvailable();

describe.skipIf(!dbUp)('health endpoints', () => {
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

  async function registerWithRank(rank: 'player' | 'gamemaster' | 'admin'): Promise<string> {
    const accountName = uniqueAccountName();
    const response = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: { accountName, profileName: uniqueProfileName(), password: 'a-good-long-password' },
    });
    const cookie = extractSessionCookie(response.headers['set-cookie']);
    if (!cookie) throw new Error('no session cookie issued');

    if (rank !== 'player') {
      await app.db.update(accounts).set({ rank }).where(eq(accounts.accountName, accountName));
    }
    return cookie;
  }

  it('answers the liveness probe without authentication', async () => {
    const response = await app.inject({ method: 'GET', url: apiPath(ROUTES.health.lite) });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('up');
  });

  it('gates the full health report behind the admin rank', async () => {
    const anonymous = await app.inject({ method: 'GET', url: apiPath(ROUTES.health.full) });
    expect(anonymous.statusCode).toBe(401);

    const playerCookie = await registerWithRank('player');
    const asPlayer = await app.inject({
      method: 'GET',
      url: apiPath(ROUTES.health.full),
      cookies: { mv_session: playerCookie },
    });
    expect(asPlayer.statusCode).toBe(403);

    // GameMaster is a moderation rank — it must not reach admin surfaces either.
    const gmCookie = await registerWithRank('gamemaster');
    const asGameMaster = await app.inject({
      method: 'GET',
      url: apiPath(ROUTES.health.full),
      cookies: { mv_session: gmCookie },
    });
    expect(asGameMaster.statusCode).toBe(403);
  });

  it('returns the full report for an admin', async () => {
    const adminCookie = await registerWithRank('admin');

    const response = await app.inject({
      method: 'GET',
      url: apiPath(ROUTES.health.full),
      cookies: { mv_session: adminCookie },
    });

    expect(response.statusCode).toBe(200);
    const { data } = response.json();
    expect(data.status).toBe('healthy');
    expect(data.database.ok).toBe(true);
    expect(data.memory.rssMb).toBeGreaterThan(0);
    expect(data.eventLoop.meanMs).toBeGreaterThanOrEqual(0);
    expect(data.database.pool.total).toBeGreaterThanOrEqual(1);
  });

  it('returns a structured 404 envelope for unknown routes', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(response.statusCode).toBe(404);
    expect(response.json().ok).toBe(false);
    expect(response.json().error.code).toBe('NOT_FOUND');
  });
});
