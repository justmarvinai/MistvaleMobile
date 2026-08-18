import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { ROUTES, apiPath } from '@mistvale/shared';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../test/harness';

/**
 * No route may answer a mistyped id with 500.
 *
 * A sweep, deliberately, rather than a case per route. The bug this pins was not in any
 * one handler — it was that a path parameter was never anybody's job: every id route read
 * `request.params as { id: string }` and handed whatever arrived to a `uuid` column, where
 * PostgreSQL raised 22P02 and the error handler answered **500 "Something went wrong on
 * our end."** Seven routes did it, on paths reachable from every player name in the game,
 * and each one would have paged whoever was on call to report a typo.
 *
 * The list below is every parameterised player route. Adding one and forgetting the check
 * fails here rather than at three in the morning.
 */

const dbUp = await isDatabaseAvailable();

const ID = 'not-a-uuid';

/** Every route that takes an id, and the method a caller would reach it with. */
const ID_ROUTES: ReadonlyArray<readonly [method: 'GET' | 'POST', path: string]> = [
  ['GET', ROUTES.roster.detail(ID)],
  ['POST', ROUTES.roster.levelUp(ID)],
  ['POST', ROUTES.roster.rankUp(ID)],
  ['POST', ROUTES.roster.ascend(ID)],
  ['POST', ROUTES.roster.skillUpgrade(ID)],
  ['POST', ROUTES.roster.masteries(ID)],
  ['POST', ROUTES.roster.masteryReset(ID)],
  ['POST', ROUTES.roster.flags(ID)],
  ['POST', ROUTES.gear.equip(ID)],
  ['POST', ROUTES.gear.unequip(ID)],
  ['POST', ROUTES.gear.upgrade(ID)],
  ['POST', ROUTES.gear.lock(ID)],
  ['GET', `${ROUTES.gear.preview(ID)}?championId=${ID}`],
  ['POST', ROUTES.mail.read(ID)],
  ['POST', ROUTES.mail.claim(ID)],
  ['POST', ROUTES.mail.discard(ID)],
  ['GET', ROUTES.profile.card(ID)],
  ['GET', ROUTES.battle.byId(ID)],
  ['POST', ROUTES.battle.action(ID)],
  ['POST', ROUTES.battle.retreat(ID)],
];

describe.skipIf(!dbUp)('a mistyped identifier', () => {
  let app: FastifyInstance;
  let cookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
    await truncateAll(app);

    const registered = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName(),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    expect(cookie).toBeTypeOf('string');
  });

  afterAll(async () => {
    await app?.close();
  });

  it.each(ID_ROUTES)('is the caller’s mistake, not ours: %s %s', async (method, path) => {
    const response = await app.inject({
      method,
      url: apiPath(path),
      cookies: { mv_session: cookie },
      ...(method === 'POST' ? { payload: {} } : {}),
    });

    expect(response.statusCode, response.body).toBeLessThan(500);
    expect(response.json().error.code, response.body).not.toBe('INTERNAL');
  });

  /**
   * And the backstop, for a route written after this list.
   *
   * `lib/params.ts` stops these at the edge for everything above; the error handler maps
   * PostgreSQL's 22P02 as well, so a handler added without the helper still cannot claim
   * the server broke. Pinned through a real route rather than by calling the predicate,
   * because the thing worth proving is the status a caller receives.
   */
  it('answers a malformed id with the same code a missing one gets', async () => {
    const malformed = await app.inject({
      method: 'GET',
      url: apiPath(ROUTES.profile.card('not-a-uuid')),
      cookies: { mv_session: cookie },
    });
    const missing = await app.inject({
      method: 'GET',
      url: apiPath(ROUTES.profile.card('00000000-0000-0000-0000-000000000000')),
      cookies: { mv_session: cookie },
    });

    expect(malformed.statusCode).toBe(missing.statusCode);
    expect(malformed.json().error.code).toBe(missing.json().error.code);
    expect(malformed.json().error.code).toBe('NOT_FOUND');
  });
});
