import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ADMIN_API_PREFIX, ADMIN_ROUTES, ROUTES, apiPath } from '@mistvale/shared';
import { accounts, battleSessions } from '../db/schema/index';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../test/harness';

/**
 * The battle inspector (ADMIN_SUITE_DESIGN §2.18).
 *
 * What is worth pinning is that it hands back what the player actually saw: the event log
 * **verbatim** and the seed that produced it. A summarised log would be a second account
 * of the fight, and it could differ from the first in exactly the case an operator is
 * looking into — which is the only case anybody opens this for.
 */

const dbUp = await isDatabaseAvailable();
const password = 'a-good-long-password';

describe.skipIf(!dbUp)('the battle inspector', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let playerCookie: string;
  let playerId: string;
  let profileName: string;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function register(prefix: string) {
    const name = uniqueProfileName();
    const response = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: { accountName: uniqueAccountName(prefix), profileName: name, password },
    });
    expect(response.statusCode, response.body).toBe(201);
    const data = response.json().data as {
      account: { id: string };
      player: { id: string };
    };
    return {
      accountId: data.account.id,
      playerId: data.player.id,
      profileName: name,
      cookie: extractSessionCookie(response.headers['set-cookie']) as string,
    };
  }

  const OPENING = {
    type: 'battleStart',
    allies: [{ ref: { side: 'ally', slot: 0 }, defKey: 'anuria', name: 'Anuria' }],
    enemies: [{ ref: { side: 'enemy', slot: 0 }, defKey: 'sskarn_skirmisher', name: 'Skirmisher' }],
  };

  beforeEach(async () => {
    await truncateAll(app);
    const admin = await register('inspector');
    await app.db.update(accounts).set({ rank: 'admin' }).where(eq(accounts.id, admin.accountId));
    adminCookie = admin.cookie;
    const warden = await register('warden');
    playerCookie = warden.cookie;
    playerId = warden.playerId;
    profileName = warden.profileName;
  });

  const asAdmin = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: adminCookie } });

  const insert = async (over: Partial<typeof battleSessions.$inferInsert> = {}) => {
    const [row] = await app.db
      .insert(battleSessions)
      .values({
        playerId,
        mode: 'campaign',
        stageKey: 'c01_s1_normal',
        contentRev: 3,
        seed: 4242,
        energySpent: 6,
        state: { turn: 17 },
        events: [OPENING, { type: 'damage', amount: 120 }],
        status: 'finished',
        outcome: 'victory',
        rewards: { silver: 900 },
        ...over,
      })
      .returning({ id: battleSessions.id });
    return row!.id;
  };

  it('is closed to a player', async () => {
    const id = await insert();
    const response = await app.inject({
      method: 'GET',
      url: `${ADMIN_API_PREFIX}${ADMIN_ROUTES.battles.detail(id)}`,
      cookies: { mv_session: playerCookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('hands back the event log verbatim, with the seed that produced it', async () => {
    const id = await insert();
    const response = await asAdmin({
      method: 'GET',
      url: `${ADMIN_API_PREFIX}${ADMIN_ROUTES.battles.detail(id)}`,
    });
    expect(response.statusCode, response.body).toBe(200);
    const data = response.json().data;
    // Verbatim: the same array, in the same order, unsummarised. Anything else would be a
    // second account of the fight.
    expect(data.events).toEqual([OPENING, { type: 'damage', amount: 120 }]);
    expect(data.seed).toBe(4242);
    expect(data.contentRev).toBe(3);
    expect(data.turns).toBe(17);
    expect(data.rewards).toEqual({ silver: 900 });
  });

  it('reads both sides off the log opening rather than off the final board', async () => {
    // A champion who died on wave two was still in the fight, and the board at the end
    // does not say so.
    const id = await insert();
    const data = (
      await asAdmin({
        method: 'GET',
        url: `${ADMIN_API_PREFIX}${ADMIN_ROUTES.battles.detail(id)}`,
      })
    ).json().data;
    expect(data.allies).toEqual([{ side: 'ally', slot: 0, defKey: 'anuria', name: 'Anuria' }]);
    expect(data.enemies[0].defKey).toBe('sskarn_skirmisher');
  });

  it('survives a battle whose log never opened', async () => {
    // A row written before the opening event, or one whose log was pruned by the nightly
    // pass. An inspector that throws here is one that cannot look at the broken fight.
    const id = await insert({ events: [] });
    const response = await asAdmin({
      method: 'GET',
      url: `${ADMIN_API_PREFIX}${ADMIN_ROUTES.battles.detail(id)}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.allies).toEqual([]);
  });

  it('answers NOT_FOUND for a battle that is not there', async () => {
    const response = await asAdmin({
      method: 'GET',
      url: `${ADMIN_API_PREFIX}${ADMIN_ROUTES.battles.detail('11111111-1111-1111-1111-111111111111')}`,
    });
    expect(response.statusCode).toBe(404);
  });

  it('lists newest first, with the warden it belonged to', async () => {
    await insert({ stageKey: 'c01_s1_normal' });
    await insert({ stageKey: 'c01_s2_normal' });
    const data = (
      await asAdmin({
        method: 'GET',
        url: `${ADMIN_API_PREFIX}${ADMIN_ROUTES.battles.list}`,
      })
    ).json().data;
    expect(data.total).toBe(2);
    expect(data.battles[0].stageKey).toBe('c01_s2_normal');
    expect(data.battles[0].profileName).toBe(profileName);
  });

  it('narrows to one player and to one mode', async () => {
    await insert({ mode: 'campaign' });
    await insert({ mode: 'arena' });
    const byMode = (
      await asAdmin({
        method: 'GET',
        url: `${ADMIN_API_PREFIX}${ADMIN_ROUTES.battles.list}?mode=arena`,
      })
    ).json().data;
    expect(byMode.total).toBe(1);

    const byPlayer = (
      await asAdmin({
        method: 'GET',
        url: `${ADMIN_API_PREFIX}${ADMIN_ROUTES.battles.list}?playerId=${playerId}`,
      })
    ).json().data;
    expect(byPlayer.total).toBe(2);
  });

  it('does not carry the event log in the list', async () => {
    // A hundred fights each with three hundred turns of log is a response nobody wants and
    // a list nobody can render. The log is what the detail view is for.
    await insert();
    const row = (
      await asAdmin({
        method: 'GET',
        url: `${ADMIN_API_PREFIX}${ADMIN_ROUTES.battles.list}`,
      })
    ).json().data.battles[0];
    expect(row.events).toBeUndefined();
  });
});
