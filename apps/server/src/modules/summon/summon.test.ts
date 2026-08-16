import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath, type SummonBanner, type SummonResult } from '@mistvale/shared';
import {
  contentEntries,
  contentRevisions,
  playerChampions,
  players,
  summonHistory,
} from '../../db/schema/index';
import { buildSeedContent } from '../../db/seed/seeders';
import * as contentRepo from '../../content/repo';
import { validateAndNormalise, type ContentSet } from '../../content/validate';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../../test/harness';
import { grantItems } from '../rewards/service';

/**
 * The Mistgate, end to end.
 *
 * `roll.test.ts` proves the maths; this proves the *transaction* — that a sigil and a
 * champion move together, that a retry cannot spend twice, and that the counters a player
 * is shown are the ones the next pull will use.
 */

const dbUp = await isDatabaseAvailable();

async function seedContent(app: FastifyInstance): Promise<void> {
  const seeds = buildSeedContent();
  const set: ContentSet = new Map();
  for (const seed of seeds) {
    set.set(seed.contentType, new Map(seed.entities.map((entity) => [entity.key, entity.data])));
  }
  const { result, normalised } = validateAndNormalise(set);
  expect(result.ok, JSON.stringify(result.errors.slice(0, 5))).toBe(true);

  const flattened = seeds.flatMap((seed) =>
    seed.entities.map((entity) => ({
      contentType: seed.contentType,
      key: entity.key,
      data: normalised.get(seed.contentType)?.get(entity.key) ?? entity.data,
    })),
  );

  await app.db.transaction(async (tx) => {
    await tx.delete(contentEntries);
    await tx.delete(contentRevisions);
    await contentRepo.replaceLiveContent(tx, flattened);
    await contentRepo.insertRevision(tx, {
      rev: 1,
      publishedBy: 'test',
      note: 'summon fixture',
      summary: { added: flattened.length, modified: 0, removed: 0 },
      snapshot: Object.fromEntries(
        seeds.map((seed) => [
          seed.contentType,
          Object.fromEntries(normalised.get(seed.contentType) ?? []),
        ]),
      ),
    });
  });

  await app.content.load();
  app.setContentRevision(app.content.rev);
}

describe.skipIf(!dbUp)('the Mistgate', () => {
  let app: FastifyInstance;
  let cookie: string;
  let playerId: string;

  beforeAll(async () => {
    app = await buildTestApp();
    await seedContent(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
    const registered = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName('caller'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  const actionId = (label: string): string => `${label}-${Math.random().toString(36).slice(2, 12)}`;

  async function giveSigils(itemKey: string, quantity: number): Promise<void> {
    await app.db.transaction((tx) => grantItems(tx, playerId, { [itemKey]: quantity }, 'test'));
  }

  async function bannerFor(key: string): Promise<SummonBanner> {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.summon.banners) });
    expect(response.statusCode, response.body).toBe(200);
    const banners = response.json().data.banners as SummonBanner[];
    const banner = banners.find((entry) => entry.key === key);
    expect(banner, `banner ${key} should be published`).toBeDefined();
    return banner!;
  }

  describe('banners', () => {
    it('publishes every pool with its rates and mercy', async () => {
      const response = await as({ method: 'GET', url: apiPath(ROUTES.summon.banners) });
      const banners = response.json().data.banners as SummonBanner[];
      expect(banners.map((entry) => entry.key)).toEqual([
        'faded',
        'gleaming',
        'mistwoven',
        'radiant',
      ]);

      const gleaming = banners.find((entry) => entry.key === 'gleaming')!;
      const total = Object.values(gleaming.rates).reduce((sum, value) => sum + value, 0);
      expect(total).toBeCloseTo(1, 6);
      expect(gleaming.pity.map((state) => state.rarity)).toEqual(['epic', 'legendary']);
      expect(gleaming.contents.epic?.length ?? 0).toBeGreaterThan(0);
    });

    it('reports how many sigils the player actually holds', async () => {
      expect((await bannerFor('gleaming')).sigilsHeld).toBe(0);
      await giveSigils('sigil_gleaming', 3);
      expect((await bannerFor('gleaming')).sigilsHeld).toBe(3);
    });

    it('shows the effective chance, not just the base rate', async () => {
      await app.db
        .update(players)
        .set({ summonPity: { gleaming: { epic: 30, legendary: 0 } } })
        .where(eq(players.id, playerId));

      const banner = await bannerFor('gleaming');
      const epic = banner.pity.find((state) => state.rarity === 'epic')!;
      expect(epic.since).toBe(30);
      expect(epic.currentBonus).toBeCloseTo(0.2, 6);
      // What the player is told must be what the next pull rolls against.
      expect(epic.effectiveChance).toBeCloseTo(0.28, 6);
    });
  });

  describe('pulling', () => {
    it('spends one sigil and grants one champion', async () => {
      await giveSigils('sigil_gleaming', 1);

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.summon.pull('gleaming')),
        payload: { count: 1, actionId: actionId('pull') },
      });
      expect(response.statusCode, response.body).toBe(200);

      const data = response.json().data;
      expect(data.results).toHaveLength(1);
      expect(data.sigilsHeld).toBe(0);

      const result = data.results[0] as SummonResult;
      expect(result.championKey).toBeTruthy();
      expect(['rare', 'epic', 'legendary']).toContain(result.rarity);
      expect(result.isNew).toBe(true);
      expect(result.champion?.championKey).toBe(result.championKey);

      const roster = await app.db
        .select()
        .from(playerChampions)
        .where(eq(playerChampions.playerId, playerId));
      expect(roster).toHaveLength(1);
    });

    it('spends ten and grants ten on a ×10', async () => {
      await giveSigils('sigil_gleaming', 10);
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.summon.pull('gleaming')),
        payload: { count: 10, actionId: actionId('ten') },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.results).toHaveLength(10);
      expect(response.json().data.sigilsHeld).toBe(0);

      const history = await app.db
        .select()
        .from(summonHistory)
        .where(eq(summonHistory.playerId, playerId));
      expect(history).toHaveLength(10);
    });

    it('refuses without enough sigils, and spends nothing', async () => {
      await giveSigils('sigil_gleaming', 3);
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.summon.pull('gleaming')),
        payload: { count: 10, actionId: actionId('greedy') },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('INSUFFICIENT_FUNDS');

      expect((await bannerFor('gleaming')).sigilsHeld).toBe(3);
      const roster = await app.db
        .select()
        .from(playerChampions)
        .where(eq(playerChampions.playerId, playerId));
      expect(roster).toHaveLength(0);
    });

    it('treats a retried pull as the same pull, not a second one', async () => {
      await giveSigils('sigil_gleaming', 10);
      const id = actionId('retry');

      const first = await as({
        method: 'POST',
        url: apiPath(ROUTES.summon.pull('gleaming')),
        payload: { count: 1, actionId: id },
      });
      const replay = await as({
        method: 'POST',
        url: apiPath(ROUTES.summon.pull('gleaming')),
        payload: { count: 1, actionId: id },
      });

      expect(replay.statusCode, replay.body).toBe(200);
      expect(replay.json().data.results[0].championKey).toBe(
        first.json().data.results[0].championKey,
      );
      // Nine left, not eight: the retry cost nothing.
      expect(replay.json().data.sigilsHeld).toBe(9);

      const history = await app.db
        .select()
        .from(summonHistory)
        .where(eq(summonHistory.playerId, playerId));
      expect(history).toHaveLength(1);
    });

    it('moves the mercy counters and records them on the pull', async () => {
      await giveSigils('sigil_gleaming', 1);
      await as({
        method: 'POST',
        url: apiPath(ROUTES.summon.pull('gleaming')),
        payload: { count: 1, actionId: actionId('pity') },
      });

      const [row] = await app.db
        .select({ pity: players.summonPity })
        .from(players)
        .where(eq(players.id, playerId));
      const counters = row!.pity.gleaming ?? {};
      // Either it landed (counter reset to 0) or it did not (counter advanced to 1).
      expect([0, 1]).toContain(counters.epic);
      expect([0, 1]).toContain(counters.legendary);

      const [entry] = await app.db
        .select()
        .from(summonHistory)
        .where(eq(summonHistory.playerId, playerId));
      expect(entry!.pityAfter).toEqual(counters);
    });

    it('honours a pool that only holds one element', async () => {
      await giveSigils('sigil_mistwoven', 10);
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.summon.pull('mistwoven')),
        payload: { count: 10, actionId: actionId('mist') },
      });
      expect(response.statusCode, response.body).toBe(200);

      const keys = (response.json().data.results as SummonResult[]).map(
        (entry) => entry.championKey,
      );
      const byKey = new Map(
        app.content.current().bundle.champions.map((champion) => [champion.key, champion]),
      );
      for (const key of keys) expect(byKey.get(key)?.element).toBe('mist');
    });

    it('never summons a champion outside the pool', async () => {
      await giveSigils('sigil_radiant', 10);
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.summon.pull('radiant')),
        payload: { count: 10, actionId: actionId('radiant') },
      });
      const results = response.json().data.results as SummonResult[];
      // Radiant is Epic-and-above only; a Rare here would be a pool leak.
      for (const result of results) expect(['epic', 'legendary']).toContain(result.rarity);
    });

    it('flags the second copy of a champion as not new', async () => {
      await giveSigils('sigil_mistwoven', 20);
      const first = await as({
        method: 'POST',
        url: apiPath(ROUTES.summon.pull('mistwoven')),
        payload: { count: 10, actionId: actionId('a') },
      });
      const second = await as({
        method: 'POST',
        url: apiPath(ROUTES.summon.pull('mistwoven')),
        payload: { count: 10, actionId: actionId('b') },
      });

      const firstKeys = new Set(
        (first.json().data.results as SummonResult[]).map((entry) => entry.championKey),
      );
      const repeats = (second.json().data.results as SummonResult[]).filter((entry) =>
        firstKeys.has(entry.championKey),
      );
      // Eight champions in the Mistwoven pool and twenty pulls: repeats are certain.
      expect(repeats.length).toBeGreaterThan(0);
      for (const repeat of repeats) expect(repeat.isNew).toBe(false);
    });

    it('404s on a pool that is not published', async () => {
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.summon.pull('not_a_pool')),
        payload: { count: 1, actionId: actionId('nope') },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('history', () => {
    it('records every pull, newest first', async () => {
      await giveSigils('sigil_gleaming', 3);
      for (let index = 0; index < 3; index += 1) {
        await as({
          method: 'POST',
          url: apiPath(ROUTES.summon.pull('gleaming')),
          payload: { count: 1, actionId: actionId(`h${index}`) },
        });
      }

      const response = await as({ method: 'GET', url: apiPath(ROUTES.summon.history) });
      expect(response.statusCode).toBe(200);
      const entries = response.json().data.entries as { poolKey: string; createdAt: string }[];
      expect(entries).toHaveLength(3);
      for (const entry of entries) expect(entry.poolKey).toBe('gleaming');
    });
  });

  describe('the Chronicle', () => {
    it('lists the whole roster and counts only collectable champions', async () => {
      const response = await as({ method: 'GET', url: apiPath(ROUTES.summon.chronicle) });
      expect(response.statusCode, response.body).toBe(200);

      const chronicle = response.json().data.chronicle;
      const champions = app.content.current().bundle.champions;
      expect(chronicle.entries).toHaveLength(champions.length);
      // Food units are excluded from the denominator: "37 of 37" means the roster.
      expect(chronicle.total).toBe(champions.filter((champion) => !champion.isFood).length);
      expect(chronicle.owned).toBe(0);
    });

    it('registers a summoned champion as owned and seen', async () => {
      await giveSigils('sigil_gleaming', 1);
      const pulled = await as({
        method: 'POST',
        url: apiPath(ROUTES.summon.pull('gleaming')),
        payload: { count: 1, actionId: actionId('chron') },
      });
      const key = (pulled.json().data.results[0] as SummonResult).championKey;

      const response = await as({ method: 'GET', url: apiPath(ROUTES.summon.chronicle) });
      const chronicle = response.json().data.chronicle;
      const entry = chronicle.entries.find(
        (candidate: { championKey: string }) => candidate.championKey === key,
      );
      expect(entry).toMatchObject({ owned: true, seen: true, copies: 1, bestRank: 1 });
      expect(chronicle.owned).toBe(1);
    });

    it('counts a second copy without counting a second champion', async () => {
      await giveSigils('sigil_mistwoven', 20);
      for (const label of ['a', 'b']) {
        await as({
          method: 'POST',
          url: apiPath(ROUTES.summon.pull('mistwoven')),
          payload: { count: 10, actionId: actionId(label) },
        });
      }

      const response = await as({ method: 'GET', url: apiPath(ROUTES.summon.chronicle) });
      const chronicle = response.json().data.chronicle;
      const owned = chronicle.entries.filter((entry: { owned: boolean }) => entry.owned);
      const copies = owned.reduce(
        (sum: number, entry: { copies: number }) => sum + entry.copies,
        0,
      );
      expect(copies).toBe(20);
      expect(chronicle.owned).toBe(owned.length);
      expect(chronicle.owned).toBeLessThan(20);
    });
  });
});
