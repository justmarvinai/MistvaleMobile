import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  REFORGE_DUST_ITEM,
  ROUTES,
  apiPath,
  type GearInstance,
  type ReforgeQuote,
  type ReforgeResult,
} from '@mistvale/shared';
import { contentEntries, contentRevisions, gearInstances, players } from '../../db/schema/index';
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
import { grantItems, itemQuantities } from '../rewards/service';
import * as gear from './service';

/**
 * Dismantling and reforging, against a real database and the real seed.
 *
 * The arithmetic is pinned in `stats.test.ts`; what only a database can prove is the part
 * that costs a player something. A reforge spends two currencies and mutates a row the
 * account has farmed for weeks, so the three things worth being certain about are that it
 * cannot be had for free, that a refusal leaves nothing spent, and that the price it
 * charges is the price the quote published.
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
      note: 'reforge fixture',
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

describe.skipIf(!dbUp)('reforging', () => {
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
        accountName: uniqueAccountName('smith'),
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

  /** A relic with substats on it, straight into the vault. */
  async function giveGear(overrides: Record<string, unknown> = {}): Promise<GearInstance> {
    const context = gear.gearContextFrom(app.content.current().bundle);
    const { createRng } = await import('@mistvale/engine');
    const row = await gear.createGear(
      app.db,
      playerId,
      {
        setKey: 'ironroot',
        slot: 'weapon',
        rank: 5,
        rarity: 'legendary',
        source: 'test',
        ...overrides,
      } as Parameters<typeof gear.createGear>[2],
      createRng(4242),
      context,
    );
    return gear.toDto(row, context);
  }

  const dustHeld = async (): Promise<number> =>
    (await itemQuantities(app.db, playerId)).get(REFORGE_DUST_ITEM) ?? 0;

  const silverHeld = async (): Promise<number> => {
    const [row] = await app.db
      .select({ silver: players.silver })
      .from(players)
      .where(eq(players.id, playerId));
    return row?.silver ?? 0;
  };

  async function fund(dust: number, silver: number): Promise<void> {
    await grantItems(app.db, playerId, { [REFORGE_DUST_ITEM]: dust }, 'test:fund');
    await app.db.update(players).set({ silver }).where(eq(players.id, playerId));
  }

  const quoteFor = async (id: string): Promise<ReforgeQuote> => {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.gear.reforge(id)) });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data as ReforgeQuote;
  };

  // ── Dismantling ───────────────────────────────────────────────────────────

  it('turns relics into dust, and the dust is the only thing it pays', () => {
    return (async () => {
      const relic = await giveGear();
      const before = await silverHeld();

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.gear.dismantle),
        payload: { ids: [relic.id], actionId: actionId('grind') },
      });
      expect(response.statusCode, response.body).toBe(200);

      const result = response.json().data as { dust: number; dustHeld: number; removed: string[] };
      expect(result.removed).toEqual([relic.id]);
      expect(result.dust).toBe(relic.dismantleValue);
      expect(result.dustHeld).toBe(relic.dismantleValue);
      // Grinding is the *alternative* to selling, so it must not also pay silver.
      expect(await silverHeld()).toBe(before);

      const [gone] = await app.db
        .select()
        .from(gearInstances)
        .where(eq(gearInstances.id, relic.id));
      expect(gone).toBeUndefined();
    })();
  });

  it('refuses the whole run rather than quietly sparing a locked relic', async () => {
    const keep = await giveGear();
    const grind = await giveGear();
    await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.lock(keep.id)),
      payload: { locked: true },
    });

    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.dismantle),
      payload: { ids: [keep.id, grind.id], actionId: actionId('grind') },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/locked/i);

    // Nothing went, including the one that was eligible.
    expect(await dustHeld()).toBe(0);
    const rows = await app.db.select().from(gearInstances);
    expect(rows).toHaveLength(2);
  });

  // ── The quote ─────────────────────────────────────────────────────────────

  it('publishes the price and the pool before anything is spent', async () => {
    const relic = await giveGear();
    const quote = await quoteFor(relic.id);

    expect(quote.blockedReason).toBeNull();
    expect(quote.dust).toBeGreaterThan(0);
    expect(quote.lines.length).toBe(relic.substats.length);

    for (const line of quote.lines) {
      expect(line.candidates.length).toBeGreaterThan(0);
      // What it says it could become never includes what it already is — the reforge
      // always changes the stat.
      const own = line.candidates.find(
        (candidate) => candidate.stat === line.line.stat && candidate.percent === line.line.percent,
      );
      expect(own).toBeUndefined();
      for (const candidate of line.candidates) {
        expect(candidate.max).toBeGreaterThanOrEqual(candidate.min);
      }
    }
  });

  it('says why it is shut on a relic with nothing to reroll', async () => {
    // A Common rolls no substats at all, so the panel has to say so rather than offering
    // a button that answers with an error.
    const bare = await giveGear({ rarity: 'common' });
    expect(bare.substats).toHaveLength(0);
    const quote = await quoteFor(bare.id);
    expect(quote.blockedReason).toMatch(/no substats/i);
  });

  // ── Reforging ─────────────────────────────────────────────────────────────

  it('charges exactly what it quoted, and changes the stat it was pointed at', async () => {
    const relic = await giveGear();
    const quote = await quoteFor(relic.id);
    await fund(quote.dust, quote.silver);

    const target = relic.substats[0]!;
    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.reforge(relic.id)),
      payload: {
        substatIndex: 0,
        expectStat: target.stat,
        expectPercent: target.percent,
        actionId: actionId('reforge'),
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    const result = response.json().data as ReforgeResult;

    expect(result.before.stat).toBe(target.stat);
    // A different *line*, which is the promise — the same stat in its other form counts,
    // since flat DEF and DEF% are worth wildly different amounts on the same champion.
    expect(`${result.after.stat}:${result.after.percent}`).not.toBe(
      `${target.stat}:${target.percent}`,
    );
    expect(result.dustSpent).toBe(quote.dust);
    expect(result.silverSpent).toBe(quote.silver);
    expect(result.dustHeld).toBe(0);
    expect(result.gear.reforges).toBe(1);
    // The rolls that went into the line survive the change of stat.
    expect(result.after.rolls).toBe(target.rolls ?? 1);
    // And every other line is untouched.
    expect(result.gear.substats.slice(1)).toEqual(relic.substats.slice(1));
  });

  it('gets dearer each time the same relic is rerolled', async () => {
    const relic = await giveGear();
    const first = await quoteFor(relic.id);
    await fund(first.dust * 10, first.silver * 10);

    const target = relic.substats[0]!;
    const done = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.reforge(relic.id)),
      payload: {
        substatIndex: 0,
        expectStat: target.stat,
        expectPercent: target.percent,
        actionId: actionId('reforge'),
      },
    });
    expect(done.statusCode, done.body).toBe(200);

    const second = await quoteFor(relic.id);
    expect(second.reforges).toBe(1);
    expect(second.dust).toBeGreaterThan(first.dust);
  });

  it('refuses an empty purse without touching the relic', async () => {
    const relic = await giveGear();
    const quote = await quoteFor(relic.id);
    await fund(quote.dust - 1, quote.silver);

    const target = relic.substats[0]!;
    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.reforge(relic.id)),
      payload: {
        substatIndex: 0,
        expectStat: target.stat,
        expectPercent: target.percent,
        actionId: actionId('reforge'),
      },
    });
    expect(response.statusCode).toBe(409);

    // The transaction rolled back whole: the dust is still there and so is the line.
    expect(await dustHeld()).toBe(quote.dust - 1);
    const [row] = await app.db.select().from(gearInstances).where(eq(gearInstances.id, relic.id));
    expect(row?.reforges).toBe(0);
    expect(row?.substats[0]?.stat).toBe(target.stat);
  });

  it('refuses a line the screen was wrong about, rather than rerolling another one', async () => {
    // Two tabs, one relic. Without the guard the second tab's tap would spend the price on
    // a line its owner never chose to touch.
    const relic = await giveGear();
    const quote = await quoteFor(relic.id);
    await fund(quote.dust, quote.silver);

    const wrong = relic.substats.find((line) => line.stat !== relic.substats[0]!.stat);
    expect(wrong).toBeDefined();

    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.reforge(relic.id)),
      payload: {
        substatIndex: 0,
        expectStat: wrong!.stat,
        expectPercent: wrong!.percent,
        actionId: actionId('reforge'),
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toMatch(/changed since/i);
    expect(await dustHeld()).toBe(quote.dust);
  });

  it('stops at the ceiling, and says so in the same sentence the quote does', async () => {
    const relic = await giveGear();
    const ceiling = gear.gearContextFrom(app.content.current().bundle).economy.reforgeMaxPerRelic;
    await app.db
      .update(gearInstances)
      .set({ reforges: ceiling })
      .where(eq(gearInstances.id, relic.id));
    await fund(10_000_000, 100_000_000);

    const quote = await quoteFor(relic.id);
    expect(quote.blockedReason).toMatch(new RegExp(`${ceiling} times`));

    const target = relic.substats[0]!;
    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.reforge(relic.id)),
      payload: {
        substatIndex: 0,
        expectStat: target.stat,
        expectPercent: target.percent,
        actionId: actionId('reforge'),
      },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe(quote.blockedReason);
  });

  it('reforges a relic a champion is wearing, which is the one worth reforging', async () => {
    const offered = await as({ method: 'GET', url: apiPath(ROUTES.roster.starters) });
    const starters = offered.json().data.starters as { key: string }[];
    const granted = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.chooseStarter),
      payload: { championKey: starters[0]!.key },
    });
    const champion = (granted.json().data.champions as { id: string }[])[0]!;

    const relic = await giveGear();
    const equipped = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.equip(relic.id)),
      payload: { championId: champion.id },
    });
    expect(equipped.statusCode, equipped.body).toBe(200);

    const quote = await quoteFor(relic.id);
    expect(quote.blockedReason).toBeNull();
    await fund(quote.dust, quote.silver);

    const target = relic.substats[0]!;
    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.gear.reforge(relic.id)),
      payload: {
        substatIndex: 0,
        expectStat: target.stat,
        expectPercent: target.percent,
        actionId: actionId('reforge'),
      },
    });
    expect(response.statusCode, response.body).toBe(200);
    expect((response.json().data as ReforgeResult).gear.equippedChampionId).toBe(champion.id);
  });
});
