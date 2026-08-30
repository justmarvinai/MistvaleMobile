import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  ROUTES,
  apiPath,
  type GoalEvent,
  type ValePassDef,
  type ValePassStanding,
  type ValePassView,
} from '@mistvale/shared';
import { contentEntries, contentRevisions, playerPasses, players } from '../../db/schema/index';
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
import { track } from './progress';
import * as pass from './pass';

/**
 * The Vale Pass.
 *
 * The season's *pacing* is pinned pure next door (`db/seed/data/vale-pass.test.ts`), against
 * the tiers that actually ship. What is pinned here is everything that touches a player: the
 * day's ceiling really stops the points, the ceiling really rolls over, a tier pays once per
 * column, the premium column is refused until the track is taken up, and taking it up costs
 * exactly the crystals it says.
 */

const dbUp = await isDatabaseAvailable();

const PASS_KEY = 'pass_first_light';

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
      note: 'pass fixture',
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

describe.skipIf(!dbUp)('the Vale Pass', () => {
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
        accountName: uniqueAccountName('season'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
    // Past the season's unlock level, so the gate is not what any of these are measuring.
    await app.db.update(players).set({ level: 20 }).where(eq(players.id, playerId));
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  const ctx = () => ({ db: app.db, content: app.content });
  const def = (): ValePassDef =>
    app.content.current().bundle.valePasses.find((entry) => entry.key === PASS_KEY)!;

  const report = (reports: readonly GoalEvent[], now: Date) =>
    app.db.transaction((tx) => track(tx, { content: app.content }, playerId, reports, { now }));

  const read = async (now?: Date): Promise<ValePassStanding> => {
    const view: ValePassView = await pass.overview(ctx(), playerId, now);
    const found = view.passes.find((entry) => entry.passKey === PASS_KEY);
    expect(found, 'the season should be running — it is monthly').toBeDefined();
    return found!;
  };

  /**
   * Enough of one report to earn `points`, at the season's own rate for that rule.
   *
   * Derived from content rather than written out, so a retune in Admin moves this test's
   * inputs with it instead of leaving it asserting against numbers nobody publishes.
   */
  const worth = (points: number): GoalEvent[] => {
    const rule = def().pointRules.find((entry) => entry.type === 'battleWin')!;
    return [{ type: 'battleWin', amount: Math.ceil(points / rule.points) }];
  };

  /**
   * Two consecutive days **inside the month the suite is running in**.
   *
   * Not a fixed date, and that is the point: the season is monthly, so its anchor is the
   * month `now` falls in — and a test that scored on a fixed March day and then claimed
   * through a route using the real clock would be writing to one season and reading another.
   * The 10th and 11th, because every month has both.
   */
  const monthDay = (day: number): Date => {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 12));
  };
  const MONDAY = monthDay(10);
  const TUESDAY = monthDay(11);

  describe('scoring', () => {
    it('pays points at the rule’s rate', async () => {
      const rule = def().pointRules.find((entry) => entry.type === 'battleWin')!;
      await report([{ type: 'battleWin', amount: 3 }], MONDAY);
      expect((await read(MONDAY)).points).toBe(3 * rule.points);
    });

    it('stops at the day’s ceiling, however much more is played', async () => {
      const cap = def().dailyPointCap;
      // Ten times the ceiling in one go, then ten times again — neither may get past it.
      await report(worth(cap * 10), MONDAY);
      await report(worth(cap * 10), MONDAY);

      const standing = await read(MONDAY);
      expect(standing.points).toBe(cap);
      expect(standing.pointsToday).toBe(cap);
    });

    it('rolls the ceiling over with the game-day, and never the total', async () => {
      const cap = def().dailyPointCap;
      await report(worth(cap * 10), MONDAY);
      await report(worth(cap * 10), TUESDAY);

      const standing = await read(TUESDAY);
      // Two days at the ceiling: the season's total is both of them, and today is one.
      expect(standing.points).toBe(cap * 2);
      expect(standing.pointsToday).toBe(cap);
    });

    it('reads yesterday’s ceiling as spent rather than as today’s', async () => {
      const cap = def().dailyPointCap;
      await report(worth(cap), MONDAY);
      // Nothing played today: the row still carries Monday's stamp, and reading it as
      // today's would tell a player their allowance was gone before they started.
      expect((await read(TUESDAY)).pointsToday).toBe(0);
    });
  });

  describe('the ladder', () => {
    /** Puts the account past tier `n` by writing the score, which is what days of play do. */
    async function reach(tier: number, now = MONDAY): Promise<void> {
      await report(worth(1), now);
      await app.db
        .update(playerPasses)
        .set({ points: def().tiers[tier]!.points })
        .where(eq(playerPasses.playerId, playerId));
    }

    it('marks a tier reached and pays its free column once', async () => {
      await reach(0);
      const before = await read(MONDAY);
      expect(before.tiers[0]?.reached).toBe(true);
      expect(before.tiers[0]?.freeClaimed).toBe(false);

      const claim = await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.claim(PASS_KEY)),
        payload: { tier: 0, track: 'free', actionId: crypto.randomUUID() },
      });
      expect(claim.statusCode, claim.body).toBe(200);
      expect(Object.keys(claim.json().data.paid as Record<string, number>)).not.toHaveLength(0);

      const again = await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.claim(PASS_KEY)),
        payload: { tier: 0, track: 'free', actionId: crypto.randomUUID() },
      });
      expect(again.statusCode).toBe(409);
    });

    it('replays a retried claim rather than paying twice', async () => {
      await reach(0);
      const actionId = crypto.randomUUID();
      const first = await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.claim(PASS_KEY)),
        payload: { tier: 0, track: 'free', actionId },
      });
      const second = await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.claim(PASS_KEY)),
        payload: { tier: 0, track: 'free', actionId },
      });
      expect(first.statusCode).toBe(200);
      expect(second.statusCode).toBe(200);

      const [wallet] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));
      // Whatever tier one pays, it was paid once — measured as the balance being the same
      // after the replay as it was after the original.
      expect(second.json().data.paid).toEqual(first.json().data.paid);
      expect(wallet).toBeDefined();
    });

    it('refuses a tier the points have not reached', async () => {
      await report(worth(1), MONDAY);
      const refused = await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.claim(PASS_KEY)),
        payload: { tier: 29, track: 'free', actionId: crypto.randomUUID() },
      });
      expect(refused.statusCode).toBe(400);
    });

    it('refuses the season’s own column until it is taken up', async () => {
      await reach(1);
      // Tier 2 pays on both columns in the shipped season; the free half is collectable
      // and the premium half is not.
      const standing = await read(MONDAY);
      expect(standing.unlocked).toBe(false);
      expect(standing.tiers[1]?.premiumLocked).toBe(true);

      const refused = await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.claim(PASS_KEY)),
        payload: { tier: 1, track: 'premium', actionId: crypto.randomUUID() },
      });
      expect(refused.statusCode).toBe(403);
    });
  });

  describe('taking up the track', () => {
    it('costs exactly what the season says, and opens the column', async () => {
      const cost = def().unlockCost;
      await app.db
        .update(players)
        .set({ crystals: cost + 25 })
        .where(eq(players.id, playerId));

      const bought = await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.unlock(PASS_KEY)),
        payload: { actionId: crypto.randomUUID() },
      });
      expect(bought.statusCode, bought.body).toBe(200);

      const [wallet] = await app.db
        .select({ crystals: players.crystals })
        .from(players)
        .where(eq(players.id, playerId));
      expect(wallet?.crystals).toBe(25);
      expect((bought.json().data.pass as ValePassView).passes[0]?.unlocked).toBe(true);
    });

    it('refuses an empty purse without opening anything', async () => {
      await app.db.update(players).set({ crystals: 5 }).where(eq(players.id, playerId));
      const refused = await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.unlock(PASS_KEY)),
        payload: { actionId: crypto.randomUUID() },
      });
      // INSUFFICIENT_FUNDS is a 409 in this API's map, not a 402 — the wallet is a
      // conflict with the world rather than a payment the caller can retry with a card.
      expect(refused.statusCode).toBe(409);
      expect((await read()).unlocked).toBe(false);
    });

    it('charges once for a retried purchase', async () => {
      const cost = def().unlockCost;
      await app.db
        .update(players)
        .set({ crystals: cost + 100 })
        .where(eq(players.id, playerId));

      const actionId = crypto.randomUUID();
      await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.unlock(PASS_KEY)),
        payload: { actionId },
      });
      const replay = await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.unlock(PASS_KEY)),
        payload: { actionId },
      });
      expect(replay.statusCode).toBe(200);

      const [wallet] = await app.db
        .select({ crystals: players.crystals })
        .from(players)
        .where(eq(players.id, playerId));
      expect(wallet?.crystals).toBe(100);
    });

    it('refuses a second purchase under a different action', async () => {
      const cost = def().unlockCost;
      await app.db
        .update(players)
        .set({ crystals: cost * 2 })
        .where(eq(players.id, playerId));

      await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.unlock(PASS_KEY)),
        payload: { actionId: crypto.randomUUID() },
      });
      const again = await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.unlock(PASS_KEY)),
        payload: { actionId: crypto.randomUUID() },
      });
      expect(again.statusCode).toBe(409);

      const [wallet] = await app.db
        .select({ crystals: players.crystals })
        .from(players)
        .where(eq(players.id, playerId));
      expect(wallet?.crystals).toBe(cost);
    });

    it('pays out nothing on the purchase itself', async () => {
      // The tiers already reached become claimable and are collected one at a time. A
      // purchase that also paid a backlog would be one transaction spending crystals and
      // granting twenty different things, which is the worst kind to unpick on failure.
      const cost = def().unlockCost;
      await app.db.update(players).set({ crystals: cost }).where(eq(players.id, playerId));
      await report(worth(def().tiers[2]!.points), MONDAY);
      await app.db
        .update(playerPasses)
        .set({ points: def().tiers[2]!.points })
        .where(eq(playerPasses.playerId, playerId));

      const [before] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));
      await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.unlock(PASS_KEY)),
        payload: { actionId: crypto.randomUUID() },
      });
      const [after] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, playerId));
      expect(after?.silver).toBe(before?.silver);

      // But the premium column is open now, and the tiers already passed are collectable.
      const standing = await read(MONDAY);
      expect(standing.unlocked).toBe(true);
      expect(standing.tiers[0]?.premiumLocked).toBe(false);
      expect(standing.claimable).toBeGreaterThan(0);
    });
  });

  describe('the endpoint', () => {
    it('turns an anonymous caller away', async () => {
      for (const options of [
        { method: 'GET' as const, url: apiPath(ROUTES.valePass.state) },
        {
          method: 'POST' as const,
          url: apiPath(ROUTES.valePass.claim(PASS_KEY)),
          payload: { tier: 0, track: 'free', actionId: crypto.randomUUID() },
        },
        {
          method: 'POST' as const,
          url: apiPath(ROUTES.valePass.unlock(PASS_KEY)),
          payload: { actionId: crypto.randomUUID() },
        },
      ]) {
        expect((await app.inject(options)).statusCode, options.url).toBe(401);
      }
    });

    it('says a season it has never heard of is not there', async () => {
      const missing = await as({
        method: 'POST',
        url: apiPath(ROUTES.valePass.unlock('pass_nobody_wrote')),
        payload: { actionId: crypto.randomUUID() },
      });
      expect(missing.statusCode).toBe(404);
    });
  });
});
