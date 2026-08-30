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
 * The content pipeline end to end: draft → validate → publish → serve → revert.
 *
 * This is the phase's exit criterion expressed as a test — an edit made through the
 * Admin API must reach the client bundle without a redeploy.
 */

const dbUp = await isDatabaseAvailable();

const adminPath = (route: string): string => `${ADMIN_API_PREFIX}${route}`;

/** A minimal but valid content set: one faction, asset, skill and champion. */
function seedEntities() {
  return [
    {
      contentType: 'faction' as const,
      key: 'testers',
      data: { key: 'testers', name: 'Testers', lore: '', icon: '', sortOrder: 0 },
    },
    {
      contentType: 'asset' as const,
      key: 'test_asset',
      data: {
        key: 'test_asset',
        kind: 'unit',
        source: 'repo',
        basePath: 'test/unit',
        tracks: { idle: { frames: 9, fps: 9, loop: true } },
        stillPath: 'test/unit/still',
        avatarPath: '',
        sortOrder: 0,
      },
    },
    {
      contentType: 'skill' as const,
      key: 'test_a1',
      data: {
        key: 'test_a1',
        name: 'Test Strike',
        description: '',
        slot: 'a1',
        cooldown: 0,
        targeting: { side: 'enemy', mode: 'single' },
        components: [{ type: 'damage', scale: 'atk', mult: 2, hits: 1 }],
        upgrades: [],
        aiHints: {},
        animation: { track: 'attack' },
        sortOrder: 0,
      },
    },
    {
      contentType: 'champion' as const,
      key: 'test_hero',
      data: {
        key: 'test_hero',
        name: 'Test Hero',
        title: '',
        lore: '',
        factionKey: 'testers',
        element: 'ember',
        rarity: 'rare',
        role: 'attack',
        baseStats: {
          hp: 15000,
          atk: 1000,
          def: 900,
          spd: 100,
          critRate: 15,
          critDmg: 50,
          res: 30,
          acc: 0,
        },
        skills: ['test_a1'],
        aura: null,
        assetKey: 'test_asset',
        isFood: false,
        summonable: true,
        starter: false,
        balanceVersion: 1,
        sortOrder: 0,
      },
    },
  ];
}

describe.skipIf(!dbUp)('content pipeline', () => {
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

  /** Writes the standard fixture as drafts through the Admin API. */
  async function draftFixture(): Promise<void> {
    for (const entity of seedEntities()) {
      const path = { faction: 'factions', asset: 'assets', skill: 'skills', champion: 'champions' }[
        entity.contentType
      ];
      const response = await asAdmin({
        method: 'PUT',
        url: adminPath(`/content/${path}/${entity.key}`),
        payload: { data: entity.data },
      });
      expect(response.statusCode, `drafting ${entity.key}`).toBe(200);
    }
  }

  describe('access control', () => {
    it('refuses the Admin API without an admin session', async () => {
      const anonymous = await app.inject({ method: 'GET', url: adminPath('/content') });
      expect(anonymous.statusCode).toBe(401);

      const playerResponse = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.register),
        payload: {
          accountName: uniqueAccountName('player'),
          profileName: uniqueProfileName(),
          password: 'a-good-long-password',
        },
      });
      const playerCookie = extractSessionCookie(playerResponse.headers['set-cookie']) as string;

      const asPlayer = await app.inject({
        method: 'GET',
        url: adminPath('/content'),
        cookies: { mv_session: playerCookie },
      });
      expect(asPlayer.statusCode).toBe(403);
    });

    it('refuses admin login for a non-admin account', async () => {
      const accountName = uniqueAccountName('plain');
      await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.register),
        payload: {
          accountName,
          profileName: uniqueProfileName(),
          password: 'a-good-long-password',
        },
      });

      const response = await app.inject({
        method: 'POST',
        url: adminPath('/auth/login'),
        payload: { accountName, password: 'a-good-long-password' },
      });

      // Same error a wrong password gives: rank must not be discoverable by probing.
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('INVALID_CREDENTIALS');
    });
  });

  describe('drafting', () => {
    it('keeps drafts out of live content until publish', async () => {
      await draftFixture();

      const bundle = await app.inject({ method: 'GET', url: apiPath(ROUTES.content.bundle) });
      expect(bundle.json().data.champions).toHaveLength(0);
      expect(app.content.rev).toBe(0);

      const diff = await asAdmin({ method: 'GET', url: adminPath('/content/diff') });
      expect(diff.json().data.totals.added).toBe(4);
    });

    it('rejects content that fails its schema', async () => {
      const response = await asAdmin({
        method: 'PUT',
        url: adminPath('/content/champions/broken'),
        payload: { data: { name: 'No stats at all', element: 'ember' } },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION');
      expect(Array.isArray(response.json().error.details)).toBe(true);
    });
  });

  describe('validation', () => {
    it('blocks a publish when a reference does not resolve', async () => {
      await draftFixture();
      // Point the champion at a skill nobody defined.
      const champion = seedEntities()[3]!.data as Record<string, unknown>;
      await asAdmin({
        method: 'PUT',
        url: adminPath('/content/champions/test_hero'),
        payload: { data: { ...champion, skills: ['does_not_exist'] } },
      });

      const validation = await asAdmin({ method: 'POST', url: adminPath('/content/validate') });
      expect(validation.json().data.ok).toBe(false);
      expect(validation.json().data.errors[0].message).toMatch(/does not exist/i);

      const publish = await asAdmin({
        method: 'POST',
        url: adminPath('/content/publish'),
        payload: { note: 'should not go through' },
      });
      expect(publish.statusCode).toBe(400);
      expect(app.content.rev).toBe(0);
    });

    it('rejects a skill component the engine cannot interpret', async () => {
      await draftFixture();
      await app.db.insert(contentEntries).values({
        contentType: 'skill',
        key: 'bogus_skill',
        state: 'draft',
        data: {
          key: 'bogus_skill',
          name: 'Bogus',
          description: '',
          slot: 'a2',
          cooldown: 3,
          targeting: { side: 'enemy', mode: 'single' },
          components: [{ type: 'summonDragon', scale: 'atk', mult: 2 }],
          upgrades: [],
          aiHints: {},
          animation: { track: 'attack' },
          sortOrder: 0,
        },
      });

      const validation = await asAdmin({ method: 'POST', url: adminPath('/content/validate') });
      expect(validation.json().data.ok).toBe(false);
    });

    it('warns without blocking when a skill looks unusual', async () => {
      await draftFixture();
      await asAdmin({
        method: 'PUT',
        url: adminPath('/content/skills/free_nuke'),
        payload: {
          data: {
            key: 'free_nuke',
            name: 'Free Nuke',
            description: '',
            slot: 'a3',
            cooldown: 0,
            targeting: { side: 'enemy', mode: 'all' },
            components: [{ type: 'damage', scale: 'atk', mult: 5, hits: 1 }],
            upgrades: [],
            aiHints: {},
            animation: { track: 'attack' },
            sortOrder: 0,
          },
        },
      });

      const validation = await asAdmin({ method: 'POST', url: adminPath('/content/validate') });
      expect(validation.json().data.ok).toBe(true);
      expect(validation.json().data.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('publish', () => {
    it('makes drafts live, bumps the revision and serves them to the client', async () => {
      await draftFixture();

      const publish = await asAdmin({
        method: 'POST',
        url: adminPath('/content/publish'),
        payload: { note: 'first content' },
      });

      expect(publish.statusCode).toBe(200);
      expect(publish.json().data.rev).toBe(1);
      expect(publish.json().data.summary.added).toBe(4);

      // The client bundle now carries it — no restart, no redeploy.
      const bundle = await app.inject({ method: 'GET', url: apiPath(ROUTES.content.bundle) });
      expect(bundle.json().rev).toBe(1);
      expect(bundle.json().data.champions).toHaveLength(1);
      expect(bundle.json().data.champions[0].name).toBe('Test Hero');

      // Drafts are cleared, so the diff is empty again.
      const diff = await asAdmin({ method: 'GET', url: adminPath('/content/diff') });
      expect(diff.json().data.entries).toHaveLength(0);
    });

    it('refuses to publish nothing', async () => {
      const response = await asAdmin({
        method: 'POST',
        url: adminPath('/content/publish'),
        payload: { note: '' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('serves a 304 while the revision is unchanged', async () => {
      await draftFixture();
      await asAdmin({ method: 'POST', url: adminPath('/content/publish'), payload: { note: '' } });

      const first = await app.inject({ method: 'GET', url: apiPath(ROUTES.content.bundle) });
      const etag = first.headers.etag as string;
      expect(etag).toBeTruthy();

      const second = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.content.bundle),
        headers: { 'if-none-match': etag },
      });
      expect(second.statusCode).toBe(304);
    });

    it('records the change in the audit trail', async () => {
      await draftFixture();
      await asAdmin({
        method: 'POST',
        url: adminPath('/content/publish'),
        payload: { note: 'audited' },
      });

      const revisions = await asAdmin({ method: 'GET', url: adminPath('/content/revisions') });
      expect(revisions.json().data.revisions[0].note).toBe('audited');
      expect(revisions.json().data.revisions[0].publishedBy).toMatch(/^admin/);
    });
  });

  describe('editing published content', () => {
    it('shows a field-level diff and applies the edit on publish', async () => {
      await draftFixture();
      await asAdmin({ method: 'POST', url: adminPath('/content/publish'), payload: { note: '' } });

      const champion = seedEntities()[3]!.data as Record<string, unknown>;
      await asAdmin({
        method: 'PUT',
        url: adminPath('/content/champions/test_hero'),
        payload: { data: { ...champion, name: 'Renamed Hero' } },
      });

      const diff = await asAdmin({ method: 'GET', url: adminPath('/content/diff') });
      const entry = diff.json().data.entries[0];
      expect(entry.change).toBe('modified');
      expect(entry.fields).toContainEqual({
        path: 'name',
        before: 'Test Hero',
        after: 'Renamed Hero',
      });

      await asAdmin({ method: 'POST', url: adminPath('/content/publish'), payload: { note: '' } });

      const bundle = await app.inject({ method: 'GET', url: apiPath(ROUTES.content.bundle) });
      expect(bundle.json().data.champions[0].name).toBe('Renamed Hero');
      expect(bundle.json().rev).toBe(2);
    });

    it('flags a stat change as a balance risk', async () => {
      await draftFixture();
      await asAdmin({ method: 'POST', url: adminPath('/content/publish'), payload: { note: '' } });

      const champion = seedEntities()[3]!.data as Record<string, unknown>;
      const stats = champion.baseStats as Record<string, number>;
      await asAdmin({
        method: 'PUT',
        url: adminPath('/content/champions/test_hero'),
        payload: { data: { ...champion, baseStats: { ...stats, atk: 1500 } } },
      });

      const diff = await asAdmin({ method: 'GET', url: adminPath('/content/diff') });
      expect(diff.json().data.entries[0].risk).toBe('balance');
      // And it names the stat rather than the block holding it (G2). The risk rules read
      // the *root* of a path for exactly this reason — a rule matching the whole path
      // would have gone quiet the moment the diff learned to go deeper than one level,
      // and the assertion above would have been the only thing to notice.
      expect(diff.json().data.entries[0].fields).toEqual([
        { path: 'baseStats.atk', before: stats.atk, after: 1500 },
      ]);
    });
  });

  describe('revert', () => {
    it('restores an earlier revision as a new revision', async () => {
      await draftFixture();
      await asAdmin({
        method: 'POST',
        url: adminPath('/content/publish'),
        payload: { note: 'v1' },
      });

      const champion = seedEntities()[3]!.data as Record<string, unknown>;
      await asAdmin({
        method: 'PUT',
        url: adminPath('/content/champions/test_hero'),
        payload: { data: { ...champion, name: 'Mistake' } },
      });
      await asAdmin({
        method: 'POST',
        url: adminPath('/content/publish'),
        payload: { note: 'v2' },
      });

      const bundleAfterMistake = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.content.bundle),
      });
      expect(bundleAfterMistake.json().data.champions[0].name).toBe('Mistake');

      const revert = await asAdmin({
        method: 'POST',
        url: adminPath('/content/revert'),
        payload: { rev: 1 },
      });
      expect(revert.statusCode).toBe(200);
      // History is append-only: reverting moves forward to revision 3.
      expect(revert.json().data.rev).toBe(3);

      const restored = await app.inject({ method: 'GET', url: apiPath(ROUTES.content.bundle) });
      expect(restored.json().data.champions[0].name).toBe('Test Hero');
    });

    it('reports an unknown revision as not found', async () => {
      const response = await asAdmin({
        method: 'POST',
        url: adminPath('/content/revert'),
        payload: { rev: 99 },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('deletion', () => {
    it('tombstones live content and removes it on publish', async () => {
      await draftFixture();
      await asAdmin({ method: 'POST', url: adminPath('/content/publish'), payload: { note: '' } });

      // The champion references the skill, so deleting the skill must be caught.
      const deleteSkill = await asAdmin({
        method: 'DELETE',
        url: adminPath('/content/skills/test_a1'),
      });
      expect(deleteSkill.json().data.pendingDelete).toBe(true);

      const validation = await asAdmin({ method: 'POST', url: adminPath('/content/validate') });
      expect(validation.json().data.ok).toBe(false);

      // Discarding the draft restores the editor to the live state.
      await asAdmin({ method: 'POST', url: adminPath('/content/discard') });
      const afterDiscard = await asAdmin({ method: 'POST', url: adminPath('/content/validate') });
      expect(afterDiscard.json().data.ok).toBe(true);
    });
  });

  describe('content published before a field existed', () => {
    /**
     * The awkward hour after a deploy.
     *
     * New server code goes live and runs against whatever revision was published last —
     * which was normalised under the *old* schema and is therefore missing every field
     * added since. The snapshot has to fill those in, or the first request that reads one
     * takes a 500 with the operator none the wiser.
     */
    it('reads back complete, with every added field defaulted', async () => {
      // A stage row exactly as an older release would have stored it: no `gearSetKeys`,
      // no `unlock`, no `drops.items` — all fields that carry defaults today.
      await app.db.insert(contentEntries).values({
        contentType: 'stage',
        key: 'legacy_stage',
        state: 'live',
        data: {
          key: 'legacy_stage',
          mode: 'campaign',
          parentKey: 'chapter_01',
          number: 1,
          energyCost: 4,
          waves: [[{ enemyKey: 'test_enemy', level: 1, slot: 0 }]],
          rewards: {
            silverMin: 100,
            silverMax: 200,
            playerXp: 10,
            championXp: 50,
            drops: { gearChance: 0.5, gearRankMin: 1, gearRankMax: 2 },
          },
          starRules: { noDeaths: true, maxTurns: 12 },
        },
      });

      await app.content.load();

      const stage = app.content
        .current()
        .bundle.stages.find((entry) => entry.key === 'legacy_stage');
      expect(stage).toBeDefined();
      expect(stage!.rewards.drops.gearSetKeys).toEqual([]);
      expect(stage!.rewards.drops.gearSlots).toEqual([]);
      expect(stage!.rewards.drops.items).toEqual([]);
      expect(stage!.unlock).toEqual({});
      expect(stage!.difficulty).toBe('normal');
    });

    it('passes an unparseable row through rather than refusing to build at all', async () => {
      await app.db.insert(contentEntries).values({
        contentType: 'item',
        key: 'broken_item',
        state: 'live',
        data: { key: 'broken_item', category: 'not-a-category' },
      });

      // One bad row must not take the snapshot — and with it the whole game — down.
      await expect(app.content.load()).resolves.toBeDefined();
      expect(app.content.current().bundle.items.some((item) => item.key === 'broken_item')).toBe(
        true,
      );
    });
  });
});
