import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ADMIN_API_PREFIX, ROUTES, apiPath } from '@mistvale/shared';
import { accounts, contentEntries, contentRevisions } from '../db/schema/index';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../test/harness';

/**
 * Content export and import (ADMIN_SUITE_DESIGN §2.16).
 *
 * The rules being pinned here are the ones that make an import safe to offer at all, and
 * every one of them is invisible when it breaks: an import writes drafts and never live,
 * an entity identical to live writes nothing, a type this build does not know is named
 * rather than dropped, and a bundle past the ceiling is refused whole.
 */

const dbUp = await isDatabaseAvailable();

const adminPath = (route: string): string => `${ADMIN_API_PREFIX}${route}`;

const FACTION = { key: 'testers', name: 'Testers', lore: '', icon: '', sortOrder: 0 };
const OTHER = { key: 'others', name: 'Others', lore: '', icon: '', sortOrder: 1 };

describe.skipIf(!dbUp)('content export and import', () => {
  let app: FastifyInstance;
  let adminCookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
    await app.db.delete(contentEntries);
    await app.db.delete(contentRevisions);
    await app.content.load();
    app.setContentRevision(app.content.rev);

    const accountName = uniqueAccountName('admin');
    const response = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: { accountName, profileName: uniqueProfileName(), password: 'a-good-long-password' },
    });
    adminCookie = extractSessionCookie(response.headers['set-cookie']) as string;
    await app.db
      .update(accounts)
      .set({ rank: 'admin' })
      .where(eq(accounts.accountName, accountName));
  });

  const asAdmin = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: adminCookie } });

  /** Publishes one faction so there is live content to export and to compare against. */
  async function publishFaction(data: Record<string, unknown>): Promise<void> {
    const draft = await asAdmin({
      method: 'PUT',
      url: adminPath(`/content/factions/${String(data.key)}`),
      payload: { data },
    });
    expect(draft.statusCode, 'drafting the faction').toBe(200);

    const publish = await asAdmin({
      method: 'POST',
      url: adminPath('/content/publish'),
      payload: { note: 'fixture' },
    });
    expect(publish.statusCode, publish.body.slice(0, 300)).toBe(200);
  }

  const importBundle = (payload: Record<string, unknown>) =>
    asAdmin({ method: 'POST', url: adminPath('/content/import'), payload });

  const drafts = async () =>
    (await app.db.select().from(contentEntries).where(eq(contentEntries.state, 'draft'))).map(
      (row) => `${row.contentType}:${row.key}`,
    );

  describe('export', () => {
    it('returns the live content in load order, key-stable', async () => {
      await publishFaction(FACTION);

      const response = await asAdmin({ method: 'GET', url: adminPath('/content/export') });
      expect(response.statusCode).toBe(200);

      const { data } = response.json() as {
        data: {
          summary: { rev: number; total: number; types: { type: string; count: number }[] };
          files: { type: string; entities: { key: string; data: Record<string, unknown> }[] }[];
        };
      };

      expect(data.summary.total).toBe(1);
      expect(data.summary.types).toEqual([{ type: 'faction', count: 1 }]);
      expect(data.files[0]?.type).toBe('faction');
      expect(data.files[0]?.entities[0]?.data).toEqual(FACTION);
      // Sorted keys, so a diff of two exports means somebody changed something rather
      // than that a row came back with its fields in another order.
      expect(Object.keys(data.files[0]!.entities[0]!.data)).toEqual(
        [...Object.keys(FACTION)].sort(),
      );
    });

    it('does not carry drafts — it is the *live* content', async () => {
      await publishFaction(FACTION);
      await asAdmin({
        method: 'PUT',
        url: adminPath('/content/factions/testers'),
        payload: { data: { ...FACTION, name: 'Renamed in a draft' } },
      });

      const response = await asAdmin({ method: 'GET', url: adminPath('/content/export') });
      const { data } = response.json() as {
        data: { files: { entities: { data: { name: string } }[] }[] };
      };
      expect(data.files[0]?.entities[0]?.data.name).toBe('Testers');
    });
  });

  describe('import', () => {
    it('writes drafts and never live', async () => {
      await publishFaction(FACTION);

      const response = await importBundle({
        files: [{ type: 'faction', entities: [{ key: 'others', data: OTHER }] }],
      });
      expect(response.statusCode, response.body.slice(0, 300)).toBe(200);

      const { data } = response.json() as {
        data: { total: number; drafted: { type: string; count: number }[]; unchanged: number };
      };
      expect(data.total).toBe(1);
      expect(data.drafted).toEqual([{ type: 'faction', count: 1 }]);

      expect(await drafts()).toEqual(['faction:others']);
      // The live bundle the game serves has not moved: nothing reaches a player until an
      // operator publishes, which is the whole safety story.
      expect(app.content.current().bundle.factions.map((entry) => entry.key)).toEqual(['testers']);
    });

    it('writes no draft for an entity already identical to live', async () => {
      await publishFaction(FACTION);

      const response = await importBundle({
        files: [
          {
            type: 'faction',
            // Deliberately in a different key order: the comparison is by shape, the way
            // the publish diff compares, so a re-serialised snapshot is not twenty-six
            // types of noise in the diff an operator has to read.
            entities: [
              {
                key: 'testers',
                data: { sortOrder: 0, icon: '', lore: '', name: 'Testers', key: 'testers' },
              },
            ],
          },
        ],
      });

      const { data } = response.json() as { data: { total: number; unchanged: number } };
      expect(data.total).toBe(0);
      expect(data.unchanged).toBe(1);
      expect(await drafts()).toEqual([]);
    });

    it('names a content type it does not know rather than dropping it', async () => {
      const response = await importBundle({
        files: [
          { type: 'faction', entities: [{ key: 'others', data: OTHER }] },
          { type: 'warband', entities: [{ key: 'w1', data: { key: 'w1' } }] },
        ],
      });
      expect(response.statusCode).toBe(200);

      const { data } = response.json() as {
        data: { total: number; unknownTypes: string[] };
      };
      // The one it knows is still imported: a snapshot from a newer build must not lose
      // the twenty-five types it *could* have restored over the one it could not.
      expect(data.total).toBe(1);
      expect(data.unknownTypes).toEqual(['warband']);
    });

    it('imports only the types asked for', async () => {
      const response = await importBundle({
        files: [
          { type: 'faction', entities: [{ key: 'others', data: OTHER }] },
          {
            type: 'asset',
            entities: [{ key: 'test_asset', data: { key: 'test_asset', kind: 'unit' } }],
          },
        ],
        only: ['faction'],
      });

      const { data } = response.json() as { data: { total: number } };
      expect(data.total).toBe(1);
      expect(await drafts()).toEqual(['faction:others']);
    });

    it('refuses a bundle past the ceiling, before writing anything', async () => {
      const entities = Array.from({ length: 5_001 }, (_, index) => ({
        key: `f${index}`,
        data: { key: `f${index}`, name: 'x', lore: '', icon: '', sortOrder: index },
      }));

      const response = await importBundle({ files: [{ type: 'faction', entities }] });
      expect(response.statusCode).toBe(400);
      expect(await drafts()).toEqual([]);
    });

    it('refuses an empty bundle', async () => {
      expect((await importBundle({ files: [] })).statusCode).toBe(400);
    });

    it('records who imported what', async () => {
      await importBundle({
        files: [{ type: 'faction', entities: [{ key: 'others', data: OTHER }] }],
      });

      const log = await asAdmin({ method: 'GET', url: adminPath('/audit?action=content.import') });
      const { data } = log.json() as {
        data: { total: number; entries: { action: string; after: unknown }[] };
      };
      expect(data.total).toBe(1);
      expect(data.entries[0]?.after).toMatchObject({ drafted: 1, unchanged: 0 });
    });

    it('round-trips: an export imported back writes nothing at all', async () => {
      await publishFaction(FACTION);

      const exported = await asAdmin({ method: 'GET', url: adminPath('/content/export') });
      const { data: snapshot } = exported.json() as { data: { files: unknown[] } };

      const response = await importBundle({ files: snapshot.files });
      const { data } = response.json() as { data: { total: number; unchanged: number } };
      expect(data.total).toBe(0);
      expect(data.unchanged).toBe(1);
    });
  });
});
