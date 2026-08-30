import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ADMIN_API_PREFIX, ADMIN_ROUTES, ROUTES, apiPath } from '@mistvale/shared';
import { accounts, auditLog } from '../db/schema/index';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../test/harness';

/**
 * Reading the audit log (gap G1).
 *
 * The writing half has been covered since P1 by every mutation's own test. What is pinned
 * here is the reading: that it is admin-only, that each filter actually narrows, that the
 * total is a count of *matches* rather than of the page, and that the filter's own
 * vocabularies do not narrow as it is used — which is the mistake that makes a filter
 * one-shot, since picking an action would put every other action out of reach.
 */

const dbUp = await isDatabaseAvailable();
const password = 'a-good-long-password';

describe.skipIf(!dbUp)('the audit log', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let playerCookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  async function register(prefix: string) {
    const response = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName(prefix),
        profileName: uniqueProfileName(),
        password,
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    return {
      accountId: (response.json().data as { account: { id: string } }).account.id,
      cookie: extractSessionCookie(response.headers['set-cookie']) as string,
    };
  }

  beforeEach(async () => {
    await truncateAll(app);
    const admin = await register('auditor');
    await app.db.update(accounts).set({ rank: 'admin' }).where(eq(accounts.id, admin.accountId));
    adminCookie = admin.cookie;
    playerCookie = (await register('warden')).cookie;

    // Three entries, deliberately spread across two actors, two actions and two entities,
    // and back-dated so a date filter has something to exclude.
    await app.db.insert(auditLog).values([
      {
        actor: 'admin:marvin',
        action: 'player.ban',
        entity: 'account',
        entityId: 'acct-1',
        before: { banned: false },
        after: { banned: true },
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
      {
        actor: 'admin:marvin',
        action: 'content.publish',
        entity: 'content',
        entityId: 'rev-7',
        createdAt: new Date('2026-06-01T00:00:00Z'),
      },
      {
        actor: 'admin:someone-else',
        action: 'player.ban',
        entity: 'account',
        entityId: 'acct-2',
        createdAt: new Date('2026-12-01T00:00:00Z'),
      },
    ]);
  });

  const url = `${ADMIN_API_PREFIX}${ADMIN_ROUTES.audit.list}`;
  const asAdmin = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: adminCookie } });
  const page = async (query = '') => {
    const response = await asAdmin({ method: 'GET', url: `${url}${query}` });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data as {
      entries: { actor: string; action: string; entityId: string | null; after: unknown }[];
      total: number;
      actions: string[];
      entities: string[];
    };
  };

  it('is closed to a player, like every other admin route', async () => {
    const response = await app.inject({
      method: 'GET',
      url,
      cookies: { mv_session: playerCookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('returns the whole log newest first', async () => {
    const data = await page();
    expect(data.total).toBe(3);
    expect(data.entries.map((entry) => entry.entityId)).toEqual(['acct-2', 'rev-7', 'acct-1']);
  });

  it('carries both sides of a change, not just the action name', async () => {
    // "vale-warden was banned" is a fact somebody can act on a year later; "ban" is not.
    const data = await page('?entityId=acct-1');
    expect(data.entries[0]?.after).toEqual({ banned: true });
  });

  it('narrows by actor on a substring, since the label carries an admin: prefix', async () => {
    const data = await page('?actor=marvin');
    expect(data.total).toBe(2);
    expect(data.entries.every((entry) => entry.actor === 'admin:marvin')).toBe(true);
  });

  it('narrows by action, by entity and by entity id', async () => {
    expect((await page('?action=player.ban')).total).toBe(2);
    expect((await page('?entity=content')).total).toBe(1);
    expect((await page('?entityId=acct-2')).total).toBe(1);
  });

  it('combines filters rather than picking one of them', async () => {
    // The way an operator actually arrives: a name they are suspicious of *and* a thing
    // that went wrong.
    const data = await page('?actor=marvin&action=player.ban');
    expect(data.total).toBe(1);
    expect(data.entries[0]?.entityId).toBe('acct-1');
  });

  it('narrows by date at both ends, inclusively', async () => {
    expect((await page('?from=2026-05-01T00:00:00Z')).total).toBe(2);
    expect((await page('?to=2026-05-01T00:00:00Z')).total).toBe(1);
    expect((await page('?from=2026-01-01T00:00:00Z&to=2026-01-01T00:00:00Z')).total).toBe(1);
  });

  it('counts the matches rather than the page', async () => {
    // The difference between "3 changes to this stage" and "3 of 400" is the whole
    // question, and a page of one cannot say which it is.
    const data = await page('?limit=1');
    expect(data.entries).toHaveLength(1);
    expect(data.total).toBe(3);
  });

  it('pages without repeating or skipping a row', async () => {
    const first = await page('?limit=2&offset=0');
    const second = await page('?limit=2&offset=2');
    expect(first.entries).toHaveLength(2);
    expect(second.entries).toHaveLength(1);
    expect(new Set([...first.entries, ...second.entries].map((e) => e.entityId)).size).toBe(3);
  });

  it('offers every action and entity in the log, whatever the filter is set to', async () => {
    // A filter whose own options narrow as it is used is a filter you can only use once.
    const data = await page('?action=player.ban');
    expect(data.actions).toEqual(['content.publish', 'player.ban']);
    expect(data.entities).toEqual(['account', 'content']);
  });

  it('refuses a limit past the ceiling rather than serving the whole table', async () => {
    const response = await asAdmin({ method: 'GET', url: `${url}?limit=5000` });
    expect(response.statusCode).toBe(400);
  });

  it('does not audit the reading of the audit log', async () => {
    // The log is a record of what an operator *changed*. "Somebody opened the audit log"
    // would bury the entries that matter under entries about looking at them.
    await page();
    const rows = await app.db.select().from(auditLog);
    expect(rows).toHaveLength(3);
  });
});
