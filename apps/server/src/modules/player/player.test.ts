import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, UNLOCK_LEVELS, apiPath } from '@mistvale/shared';
import { accounts, players } from '../../db/schema/index';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../../test/harness';

const dbUp = await isDatabaseAvailable();

describe.skipIf(!dbUp)('player endpoints', () => {
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

  async function registerPlayer(): Promise<{ cookie: string; accountName: string }> {
    const accountName = uniqueAccountName();
    const response = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: { accountName, profileName: uniqueProfileName(), password: 'a-good-long-password' },
    });
    const cookie = extractSessionCookie(response.headers['set-cookie']);
    if (!cookie) throw new Error('no session cookie issued');
    return { cookie, accountName };
  }

  describe('GET /player', () => {
    it('returns the full snapshot the client boots from', async () => {
      const { cookie } = await registerPlayer();

      const response = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.player.self),
        cookies: { mv_session: cookie },
      });

      expect(response.statusCode).toBe(200);
      const { data } = response.json();
      expect(data.player.level).toBe(1);
      expect(data.player.energy.cap).toBe(20);
      expect(data.player.silver).toBe(0);
      expect(data.settings.musicVolume).toBeTypeOf('number');
      expect(data.serverTime).toBeTypeOf('string');
      expect(data.unlocks.arena).toBe(false);
    });

    it('reflects unlock gating as the account levels up', async () => {
      const { cookie, accountName } = await registerPlayer();
      const account = (
        await app.db.select().from(accounts).where(eq(accounts.accountName, accountName))
      )[0];
      if (!account) throw new Error('account missing');

      await app.db
        .update(players)
        .set({ level: UNLOCK_LEVELS.arena })
        .where(eq(players.accountId, account.id));

      const response = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.player.self),
        cookies: { mv_session: cookie },
      });

      const { data } = response.json();
      expect(data.unlocks.arena).toBe(true);
      expect(data.unlocks.hallOfValor).toBe(true);
      expect(data.unlocks.masteries).toBe(false);
      // The energy cap must follow the new level, not stay at the level-1 value.
      expect(data.player.energy.cap).toBeGreaterThan(20);
    });

    it('requires a session', async () => {
      const response = await app.inject({ method: 'GET', url: apiPath(ROUTES.player.self) });
      expect(response.statusCode).toBe(401);
    });
  });

  describe('PATCH /player/settings', () => {
    it('applies a partial update and persists it', async () => {
      const { cookie } = await registerPlayer();

      const patch = await app.inject({
        method: 'PATCH',
        url: apiPath(ROUTES.player.settings),
        cookies: { mv_session: cookie },
        payload: { musicVolume: 0.1, battleSpeed: 2 },
      });

      expect(patch.statusCode).toBe(200);
      expect(patch.json().data.settings.musicVolume).toBe(0.1);
      expect(patch.json().data.settings.battleSpeed).toBe(2);
      // Untouched keys keep their defaults.
      expect(patch.json().data.settings.sfxVolume).toBe(0.8);

      const snapshot = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.player.self),
        cookies: { mv_session: cookie },
      });
      expect(snapshot.json().data.settings.musicVolume).toBe(0.1);
    });

    it('rejects out-of-range and invalid values', async () => {
      const { cookie } = await registerPlayer();

      for (const payload of [{ musicVolume: 5 }, { musicVolume: -1 }, { battleSpeed: 3 }]) {
        const response = await app.inject({
          method: 'PATCH',
          url: apiPath(ROUTES.player.settings),
          cookies: { mv_session: cookie },
          payload,
        });
        expect(response.statusCode).toBe(400);
        expect(response.json().error.code).toBe('VALIDATION');
      }
    });

    it('requires a session', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: apiPath(ROUTES.player.settings),
        payload: { musicVolume: 0.2 },
      });
      expect(response.statusCode).toBe(401);
    });
  });
});
