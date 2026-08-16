import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath, type GearInstance } from '@mistvale/shared';
import {
  contentEntries,
  contentRevisions,
  gearInstances,
  playerChampions,
  players,
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
import * as gear from './service';

/**
 * The management loop, end to end.
 *
 * Farming is proven by the battle suite; this proves what a player does with what they
 * farmed — equip it, upgrade it, level a champion on food, rank it up, ascend it, and buy
 * from the Bazaar. Against real seeded content and a real database, because the
 * interesting failures live where the gear maths, the wallet and the guards meet.
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
      note: 'inventory fixture',
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

describe.skipIf(!dbUp)('the management loop', () => {
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
        accountName: uniqueAccountName('keeper'),
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

  async function chooseStarter(): Promise<{ id: string; championKey: string }> {
    const offered = await as({ method: 'GET', url: apiPath(ROUTES.roster.starters) });
    const starters = offered.json().data.starters as { key: string }[];
    const granted = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.chooseStarter),
      payload: { championKey: starters[0]!.key },
    });
    expect(granted.statusCode, granted.body).toBe(200);
    return (granted.json().data.champions as { id: string; championKey: string }[])[0]!;
  }

  /** Puts a relic straight into the player's inventory, bypassing the farm. */
  async function giveGear(
    overrides: Partial<Parameters<typeof gear.createGear>[2]> = {},
  ): Promise<GearInstance> {
    const context = gear.gearContextFrom(app.content.current().bundle);
    const { createRng } = await import('@mistvale/engine');
    const row = await gear.createGear(
      app.db,
      playerId,
      {
        setKey: 'ironroot',
        slot: 'weapon',
        rank: 5,
        rarity: 'epic',
        source: 'test',
        ...overrides,
      },
      createRng(1234),
      context,
    );
    return gear.toDto(row, context);
  }

  async function setSilver(amount: number): Promise<void> {
    await app.db.update(players).set({ silver: amount }).where(eq(players.id, playerId));
  }

  // ── Relics ───────────────────────────────────────────────────────────────

  describe('equipping', () => {
    it('puts a relic on a champion and reports the assembled stats', async () => {
      const champion = await chooseStarter();
      const relic = await giveGear();

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.equip(relic.id)),
        payload: { championId: champion.id },
      });
      expect(response.statusCode, response.body).toBe(200);

      const detail = response.json().data.champion;
      expect(detail.gear).toHaveLength(1);
      expect(detail.stats.total.atk).toBeGreaterThan(detail.stats.base.atk);
      expect(detail.stats.gear.atk).toBeGreaterThan(0);
    });

    it('swaps rather than stacking when the slot is taken', async () => {
      const champion = await chooseStarter();
      const first = await giveGear();
      const second = await giveGear();

      for (const relic of [first, second]) {
        const response = await as({
          method: 'POST',
          url: apiPath(ROUTES.gear.equip(relic.id)),
          payload: { championId: champion.id },
        });
        expect(response.statusCode, response.body).toBe(200);
      }

      const detail = await as({ method: 'GET', url: apiPath(ROUTES.roster.detail(champion.id)) });
      const worn = detail.json().data.champion.gear as GearInstance[];
      expect(worn).toHaveLength(1);
      expect(worn[0]?.id).toBe(second.id);
    });

    it('refuses an accessory the champion has not ascended into', async () => {
      const champion = await chooseStarter();
      const ring = await giveGear({ slot: 'ring' });

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.equip(ring.id)),
        payload: { championId: champion.id },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toMatch(/ascension/i);
    });

    it('takes a relic off for free', async () => {
      const champion = await chooseStarter();
      const relic = await giveGear();
      await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.equip(relic.id)),
        payload: { championId: champion.id },
      });

      const [before] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));

      const response = await as({ method: 'POST', url: apiPath(ROUTES.gear.unequip(relic.id)) });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.gear.equippedChampionId).toBeNull();

      const [after] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));
      expect(after?.silver).toBe(before?.silver);
    });

    it('will not equip a relic belonging to somebody else', async () => {
      const champion = await chooseStarter();
      const relic = await giveGear();
      await app.db
        .update(gearInstances)
        .set({ playerId: await otherPlayer() })
        .where(eq(gearInstances.id, relic.id));

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.equip(relic.id)),
        payload: { championId: champion.id },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('the forge', () => {
    it('charges silver and moves the relic up on a guaranteed level', async () => {
      const relic = await giveGear();
      await setSilver(1_000_000);

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.upgrade(relic.id)),
        payload: { times: 1, actionId: actionId('up') },
      });
      expect(response.statusCode, response.body).toBe(200);

      const data = response.json().data;
      expect(data.attempts).toHaveLength(1);
      // +1 through +4 are certain, so this cannot be a flaky assertion.
      expect(data.attempts[0].success).toBe(true);
      expect(data.gear.level).toBe(1);
      expect(data.silverSpent).toBeGreaterThan(0);
      expect(data.gear.main.value).toBeGreaterThan(relic.main.value);
    });

    it('rolls a substat at +4 and reports which one', async () => {
      const relic = await giveGear({ rarity: 'rare' });
      await setSilver(1_000_000);

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.upgrade(relic.id)),
        payload: { times: 4, actionId: actionId('up') },
      });
      const data = response.json().data;
      expect(data.gear.level).toBe(4);

      const rollLevel = data.attempts.find((attempt: { toLevel: number }) => attempt.toLevel === 4);
      expect(rollLevel.rolled).not.toBeNull();
      expect(data.gear.substats.length).toBe(relic.substats.length + 1);
    });

    it('stops the run when the silver runs out rather than part-charging', async () => {
      const relic = await giveGear();
      const cost = relic.upgradeCost;
      await setSilver(cost + 1);

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.upgrade(relic.id)),
        payload: { times: 5, actionId: actionId('up') },
      });
      const data = response.json().data;
      expect(data.attempts).toHaveLength(1);
      expect(data.silver).toBe(1);
    });

    it('refuses when the player cannot afford a single attempt', async () => {
      const relic = await giveGear();
      await setSilver(0);

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.upgrade(relic.id)),
        payload: { times: 1, actionId: actionId('up') },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('INSUFFICIENT_FUNDS');
    });
  });

  describe('selling', () => {
    it('pays silver and removes the relic', async () => {
      const relic = await giveGear();
      await setSilver(0);

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.sell),
        payload: { ids: [relic.id], actionId: actionId('sell') },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.paid).toBe(relic.sellValue);
      expect(response.json().data.silver).toBe(relic.sellValue);

      const remaining = await app.db
        .select()
        .from(gearInstances)
        .where(eq(gearInstances.playerId, playerId));
      expect(remaining).toHaveLength(0);
    });

    it('refuses the whole selection when one relic is locked', async () => {
      const keep = await giveGear();
      const spare = await giveGear();
      await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.lock(keep.id)),
        payload: { locked: true },
      });

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.sell),
        payload: { ids: [keep.id, spare.id], actionId: actionId('sell') },
      });
      expect(response.statusCode).toBe(400);

      const remaining = await app.db
        .select()
        .from(gearInstances)
        .where(eq(gearInstances.playerId, playerId));
      expect(remaining).toHaveLength(2);
    });

    it('refuses to sell something that is being worn', async () => {
      const champion = await chooseStarter();
      const relic = await giveGear();
      await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.equip(relic.id)),
        payload: { championId: champion.id },
      });

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.sell),
        payload: { ids: [relic.id], actionId: actionId('sell') },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toMatch(/equipped/i);
    });
  });

  describe('the equip preview', () => {
    it('reports the real before and after, set bonus included', async () => {
      const champion = await chooseStarter();
      const worn = await giveGear();
      await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.equip(worn.id)),
        payload: { championId: champion.id },
      });
      const candidate = await giveGear({ rank: 6, rarity: 'legendary' });

      const response = await as({
        method: 'GET',
        url: `${apiPath(ROUTES.gear.preview(candidate.id))}?championId=${champion.id}`,
      });
      expect(response.statusCode, response.body).toBe(200);

      const preview = response.json().data.preview;
      expect(preview.replaces.id).toBe(worn.id);
      expect(preview.after.total.atk).toBeGreaterThan(preview.before.total.atk);
    });
  });

  // ── Champions ────────────────────────────────────────────────────────────

  describe('levelling', () => {
    it('consumes food and raises the level', async () => {
      const champion = await chooseStarter();
      const food = await giveFood(3);

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.levelUp(champion.id)),
        payload: { foodIds: food, actionId: actionId('level') },
      });
      expect(response.statusCode, response.body).toBe(200);

      const data = response.json().data;
      expect(data.consumed).toHaveLength(3);
      expect(data.champion.champion.level).toBeGreaterThan(1);

      const roster = await app.db
        .select()
        .from(playerChampions)
        .where(eq(playerChampions.playerId, playerId));
      expect(roster).toHaveLength(1);
    });

    it('refuses to eat a locked champion, and eats nothing at all', async () => {
      const champion = await chooseStarter();
      const food = await giveFood(2);
      await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.flags(food[0]!)),
        payload: { locked: true },
      });

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.levelUp(champion.id)),
        payload: { foodIds: food, actionId: actionId('level') },
      });
      expect(response.statusCode).toBe(400);

      const roster = await app.db
        .select()
        .from(playerChampions)
        .where(eq(playerChampions.playerId, playerId));
      expect(roster).toHaveLength(3);
    });

    it('refuses to feed a champion to itself', async () => {
      const champion = await chooseStarter();
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.levelUp(champion.id)),
        payload: { foodIds: [champion.id], actionId: actionId('level') },
      });
      expect(response.statusCode).toBe(400);
    });

    it('will not eat a champion that is still wearing relics', async () => {
      const champion = await chooseStarter();
      const [foodId] = await giveFood(1);
      const relic = await giveGear();
      await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.equip(relic.id)),
        payload: { championId: foodId },
      });

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.levelUp(champion.id)),
        payload: { foodIds: [foodId!], actionId: actionId('level') },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toMatch(/relics/i);
    });
  });

  describe('rank-up', () => {
    it('needs the champion at its level cap', async () => {
      const champion = await chooseStarter();
      const food = await giveFood(1);

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.rankUp(champion.id)),
        payload: { foodIds: food, actionId: actionId('rank') },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toMatch(/level cap/i);
    });

    it('spends silver and food, adds a star and resets the level', async () => {
      const champion = await chooseStarter();
      await app.db
        .update(playerChampions)
        .set({ level: 10 })
        .where(eq(playerChampions.id, champion.id));
      await setSilver(50_000);
      const food = await giveFood(1);

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.rankUp(champion.id)),
        payload: { foodIds: food, actionId: actionId('rank') },
      });
      expect(response.statusCode, response.body).toBe(200);

      const detail = response.json().data.champion.champion;
      expect(detail.rank).toBe(2);
      expect(detail.level).toBe(1);
      expect(detail.levelCap).toBe(20);
      expect(response.json().data.silver).toBe(50_000 - 2_000);
    });

    it('refuses food of the wrong rank', async () => {
      const champion = await chooseStarter();
      await app.db
        .update(playerChampions)
        .set({ level: 10 })
        .where(eq(playerChampions.id, champion.id));
      await setSilver(50_000);
      const food = await giveFood(1);
      await app.db.update(playerChampions).set({ rank: 3 }).where(eq(playerChampions.id, food[0]!));

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.rankUp(champion.id)),
        payload: { foodIds: food, actionId: actionId('rank') },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toMatch(/★1/);
    });
  });

  describe('ascension', () => {
    it('spends the essences its element and rarity call for', async () => {
      const champion = await chooseStarter();
      await app.db
        .update(playerChampions)
        .set({ rank: 3 })
        .where(eq(playerChampions.id, champion.id));

      const detail = await as({ method: 'GET', url: apiPath(ROUTES.roster.detail(champion.id)) });
      const cost = detail.json().data.champion.costs.ascend.items as Record<string, number>;
      expect(Object.keys(cost).length).toBeGreaterThan(0);

      await app.db.transaction((tx) =>
        grantItems(
          tx,
          playerId,
          Object.fromEntries(Object.entries(cost).map(([key, value]) => [key, value * 2])),
          'test',
        ),
      );

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.ascend(champion.id)),
        payload: { actionId: actionId('asc') },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.champion.champion.ascension).toBe(1);

      const held = await as({ method: 'GET', url: apiPath(ROUTES.inventory.items) });
      const items = held.json().data.items as { itemKey: string; quantity: number }[];
      for (const [key, amount] of Object.entries(cost)) {
        expect(items.find((entry) => entry.itemKey === key)?.quantity).toBe(amount);
      }
    });

    it('refuses without the essences, and spends nothing', async () => {
      const champion = await chooseStarter();
      await app.db
        .update(playerChampions)
        .set({ rank: 3 })
        .where(eq(playerChampions.id, champion.id));

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.ascend(champion.id)),
        payload: { actionId: actionId('asc') },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('will not let a ★1 champion ascend at all', async () => {
      const champion = await chooseStarter();
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.ascend(champion.id)),
        payload: { actionId: actionId('asc') },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toMatch(/★1|rank/i);
    });
  });

  describe('skill upgrades', () => {
    it('spends a tome of the champion’s own rarity', async () => {
      const champion = await chooseStarter();
      const def = app.content
        .current()
        .bundle.champions.find((entry) => entry.key === champion.championKey)!;
      const tomeKey = def.rarity === 'legendary' ? 'tome_legendary' : 'tome_epic';
      await app.db.transaction((tx) => grantItems(tx, playerId, { [tomeKey]: 1 }, 'test'));

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.skillUpgrade(champion.id)),
        payload: { skillKey: def.skills[0], source: { kind: 'tome' }, actionId: actionId('tome') },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.champion.skillUpgrades[def.skills[0]!]).toBe(1);
    });

    it('accepts a duplicate instead, and consumes it', async () => {
      const champion = await chooseStarter();
      const def = app.content
        .current()
        .bundle.champions.find((entry) => entry.key === champion.championKey)!;

      const [duplicate] = await app.db
        .insert(playerChampions)
        .values({ playerId, championKey: champion.championKey })
        .returning();

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.skillUpgrade(champion.id)),
        payload: {
          skillKey: def.skills[0],
          source: { kind: 'duplicate', championId: duplicate!.id },
          actionId: actionId('dupe'),
        },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.consumed).toEqual([duplicate!.id]);
    });

    it('refuses a different champion as a duplicate', async () => {
      const champion = await chooseStarter();
      const def = app.content
        .current()
        .bundle.champions.find((entry) => entry.key === champion.championKey)!;
      const [other] = await app.db
        .insert(playerChampions)
        .values({ playerId, championKey: 'sskarn_broodling_ember' })
        .returning();

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.skillUpgrade(champion.id)),
        payload: {
          skillKey: def.skills[0],
          source: { kind: 'duplicate', championId: other!.id },
          actionId: actionId('dupe'),
        },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  // ── The Bazaar ───────────────────────────────────────────────────────────

  describe('the Bazaar', () => {
    it('stocks slots and gives them a restock time', async () => {
      const response = await as({ method: 'GET', url: apiPath(ROUTES.shop.stock('bazaar')) });
      expect(response.statusCode, response.body).toBe(200);

      const stock = response.json().data.stock;
      expect(stock.slots.length).toBeGreaterThan(0);
      expect(new Date(stock.restocksAt).getTime()).toBeGreaterThan(Date.now());
      // The four free slots must all be usable; the crystal ones start closed.
      expect(stock.slots.filter((slot: { slotLocked: boolean }) => !slot.slotLocked)).toHaveLength(
        stock.slots.length,
      );
    });

    it('returns the same window on a second read rather than re-rolling', async () => {
      const first = await as({ method: 'GET', url: apiPath(ROUTES.shop.stock('bazaar')) });
      const second = await as({ method: 'GET', url: apiPath(ROUTES.shop.stock('bazaar')) });
      expect(second.json().data.stock.slots).toEqual(first.json().data.stock.slots);
    });

    it('charges for a purchase and hands the thing over', async () => {
      await setSilver(2_000_000);
      const listed = await as({ method: 'GET', url: apiPath(ROUTES.shop.stock('bazaar')) });
      const slots = listed.json().data.stock.slots as {
        index: number;
        currency: string;
        price: number;
        kind: string;
      }[];
      const target = slots.find((slot) => slot.currency === 'silver' && slot.price <= 2_000_000);
      expect(target).toBeDefined();

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.shop.buy('bazaar')),
        payload: { slotIndex: target!.index, actionId: actionId('buy') },
      });
      expect(response.statusCode, response.body).toBe(200);

      const data = response.json().data;
      expect(data.silver).toBe(2_000_000 - target!.price);
      expect(
        data.stock.slots.find((slot: { index: number }) => slot.index === target!.index).purchased,
      ).toBe(true);
      if (target!.kind === 'gear') expect(data.granted.gear).not.toBeNull();
      if (target!.kind === 'item') expect(data.granted.itemKey).toBeTruthy();
      if (target!.kind === 'champion') expect(data.granted.championKey).toBeTruthy();
    });

    it('refuses to sell the same slot twice', async () => {
      await setSilver(2_000_000);
      const listed = await as({ method: 'GET', url: apiPath(ROUTES.shop.stock('bazaar')) });
      const slots = listed.json().data.stock.slots as {
        index: number;
        currency: string;
        price: number;
      }[];
      const target = slots.find((slot) => slot.currency === 'silver')!;

      await as({
        method: 'POST',
        url: apiPath(ROUTES.shop.buy('bazaar')),
        payload: { slotIndex: target.index, actionId: actionId('buy') },
      });
      const again = await as({
        method: 'POST',
        url: apiPath(ROUTES.shop.buy('bazaar')),
        payload: { slotIndex: target.index, actionId: actionId('buy') },
      });
      expect(again.statusCode).toBe(409);
    });

    it('refuses a purchase the player cannot afford', async () => {
      await setSilver(0);
      const listed = await as({ method: 'GET', url: apiPath(ROUTES.shop.stock('bazaar')) });
      const slots = listed.json().data.stock.slots as {
        index: number;
        currency: string;
        price: number;
      }[];
      const target = slots.find((slot) => slot.currency === 'silver' && slot.price > 0)!;

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.shop.buy('bazaar')),
        payload: { slotIndex: target.index, actionId: actionId('buy') },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('re-rolls the window for crystals, and the old relics stop being for sale', async () => {
      await app.db.update(players).set({ crystals: 1_000 }).where(eq(players.id, playerId));
      const before = await as({ method: 'GET', url: apiPath(ROUTES.shop.stock('bazaar')) });
      const beforeGear = (before.json().data.stock.slots as { gear: GearInstance | null }[])
        .map((slot) => slot.gear?.id)
        .filter(Boolean);

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.shop.refresh('bazaar')),
        payload: { actionId: actionId('refresh') },
      });
      expect(response.statusCode, response.body).toBe(200);

      // An unsold relic from the previous window must not linger in the inventory: it was
      // never bought, and leaving it there would be a free relic every hour.
      const owned = await app.db
        .select({ id: gearInstances.id })
        .from(gearInstances)
        .where(eq(gearInstances.playerId, playerId));
      const ownedIds = new Set(owned.map((row) => row.id));
      for (const id of beforeGear) expect(ownedIds.has(id as string)).toBe(false);
    });
  });

  // ── Helpers ──────────────────────────────────────────────────────────────

  /** Adds ★1 food champions directly, since farming them is the battle suite's job. */
  async function giveFood(count: number): Promise<string[]> {
    const rows = await app.db
      .insert(playerChampions)
      .values(
        Array.from({ length: count }, () => ({
          playerId,
          championKey: 'sskarn_broodling_ember',
          level: 5,
        })),
      )
      .returning({ id: playerChampions.id });
    return rows.map((row) => row.id);
  }

  /** A second player, for the "not yours" guards. */
  async function otherPlayer(): Promise<string> {
    const registered = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName('other'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    return registered.json().data.player.id as string;
  }
});
