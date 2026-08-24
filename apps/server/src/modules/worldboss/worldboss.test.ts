import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { ROUTES, apiPath, type WorldBossView } from '@mistvale/shared';
import {
  contentEntries,
  contentRevisions,
  playerWorldBoss,
  players,
  worldBossWakes,
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
import * as worldboss from './service';

/**
 * The Wurm Wakes, against a real database.
 *
 * The interesting half is not the fight — a strike is an ordinary battle, pinned everywhere
 * else — it is the **shared row**, which is the only piece of state in Mistvale two accounts
 * can touch at once. So what is proven here is that two wardens' damage lands on the same
 * bar, that felling it is decided once and credited once, that the contribution ladder pays
 * each rung a single time, and that the spoils are for everybody who struck it.
 *
 * The schedule is driven by feeding the service an explicit `now`, which is the whole reason
 * `wakeAt` takes one: a test that had to wait for Friday would be a test nobody runs.
 */

const dbUp = await isDatabaseAvailable();

/**
 * A Friday inside the seeded wake, and a Thursday clear of every part of one.
 *
 * The Thursday is chosen carefully. The wake runs Friday to Sunday and its claims stay open
 * three days past that, so the whole of Monday to Wednesday still belongs to the wake that
 * just closed — a warden who spent their last strike on Sunday evening can still collect on
 * Wednesday, which is the design. Thursday is the one day of the week that owes nobody
 * anything, and it is the only honest way to test the asleep state.
 */
const DURING_WAKE = new Date('2026-08-21T12:00:00Z');
const BEFORE_WAKE = new Date('2026-08-20T12:00:00Z');

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
      note: 'world boss fixture',
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

describe.skipIf(!dbUp)('the world boss', () => {
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
        accountName: uniqueAccountName('striker'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
    await app.db.update(players).set({ level: 30 }).where(eq(players.id, playerId));
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  /** A second warden, so the shared row has two people on it. */
  async function secondWarden(): Promise<string> {
    const registered = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName('ally'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    const id = registered.json().data.player.id as string;
    await app.db.update(players).set({ level: 30 }).where(eq(players.id, id));
    return id;
  }

  const keep = () => {
    const found = worldboss.keeps(app.content)[0];
    expect(found, 'the seed publishes a world boss').toBeDefined();
    return found!;
  };

  const view = async (): Promise<WorldBossView> => {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.worldBoss.state) });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data.worldBoss as WorldBossView;
  };

  /**
   * A strike of a known size, folded exactly as a finished battle would fold it.
   *
   * Goes through the service rather than writing the rows by hand, because the arithmetic
   * on the shared row is the thing being tested — a hand-written row would prove only that
   * the test can write one.
   */
  async function strike(who: string, damage: number, now = DURING_WAKE) {
    return app.db.transaction((tx) =>
      worldboss.settleStrike(
        tx,
        app.content,
        who,
        keep(),
        [
          {
            type: 'damage',
            source: { side: 'ally', slot: 0 },
            target: { side: 'enemy', slot: 1 },
            amount: damage,
            absorbed: 0,
            quality: 'normal',
            crit: false,
            hitIndex: 0,
            hits: 1,
            remainingHp: 0,
            id: 1,
          },
        ],
        now,
      ),
    );
  }

  it('is asleep outside its window, and says when it next stirs', async () => {
    const state = await worldboss.overview(
      app.db,
      app.content,
      { playerId, level: 30, dailyCounters: {}, dailyCountersDay: null },
      BEFORE_WAKE,
    );
    const boss = state.bosses[0]!;
    expect(boss.awake).toBe(false);
    expect(boss.anchor).toBeNull();
    expect(boss.wakesOn, 'a player who knows when to come back comes back').not.toBeNull();
    expect(boss.blockedReason).toMatch(/not awake/i);
  });

  it('is shut before the account reaches the level it opens at', async () => {
    await app.db.update(players).set({ level: 5 }).where(eq(players.id, playerId));
    const state = await view();
    expect(state.bosses).toEqual([]);
  });

  it('puts two wardens on the same bar', async () => {
    const other = await secondWarden();
    await strike(playerId, 400_000);
    await strike(other, 250_000);

    const [row] = await app.db
      .select()
      .from(worldBossWakes)
      .where(eq(worldBossWakes.dungeonKey, keep().dungeon.key));
    expect(row?.damageTaken, 'both strikes came off the one pool').toBe(650_000);
    expect(row?.wardens).toBe(2);
    expect(row?.strikes).toBe(2);
  });

  it('counts a second strike from the same warden without counting them twice', async () => {
    await strike(playerId, 100_000);
    const second = await strike(playerId, 150_000);

    expect(second?.totalDamage).toBe(250_000);
    const [row] = await app.db
      .select()
      .from(worldBossWakes)
      .where(eq(worldBossWakes.dungeonKey, keep().dungeon.key));
    expect(row?.wardens, 'one warden, two strikes').toBe(1);
    expect(row?.strikes).toBe(2);
  });

  it('credits the fall once, to the strike that emptied the pool', async () => {
    const other = await secondWarden();
    const pool = keep().rules.maxHp;

    const early = await strike(playerId, pool - 1);
    expect(early?.felledIt).toBe(false);

    const killing = await strike(other, 10_000);
    expect(killing?.felledIt, 'the strike that crossed the line takes the credit').toBe(true);

    const after = await strike(playerId, 10_000);
    expect(after?.felledIt, 'and nobody fells it twice').toBe(false);

    const [row] = await app.db
      .select()
      .from(worldBossWakes)
      .where(eq(worldBossWakes.dungeonKey, keep().dungeon.key));
    expect(row?.felledBy).toBe(other);
  });

  it('keeps overkill on the striker rather than throwing it away', async () => {
    const pool = keep().rules.maxHp;
    const result = await strike(playerId, pool + 500_000);
    expect(result?.totalDamage, 'the run that did the most is not the one that is docked').toBe(
      pool + 500_000,
    );
    // The bar itself never draws past full.
    const state = await worldboss.overview(
      app.db,
      app.content,
      { playerId, level: 30, dailyCounters: {}, dailyCountersDay: null },
      DURING_WAKE,
    );
    expect(state.bosses[0]!.damageTaken).toBe(pool);
    expect(state.bosses[0]!.felled).toBe(true);
  });

  it('pays each contribution rung once, and refuses one that was not reached', async () => {
    const rules = keep().rules;
    const first = rules.tiers[0]!;
    const second = rules.tiers[1]!;
    await strike(playerId, first.damage);

    const paid = await app.db.transaction((tx) =>
      worldboss.claimTier(tx, app.content, playerId, keep().dungeon.key, first.key, DURING_WAKE),
    );
    expect(paid).toEqual(first.rewards);

    await expect(
      app.db.transaction((tx) =>
        worldboss.claimTier(tx, app.content, playerId, keep().dungeon.key, first.key, DURING_WAKE),
      ),
    ).rejects.toThrow(/already been collected/i);

    await expect(
      app.db.transaction((tx) =>
        worldboss.claimTier(tx, app.content, playerId, keep().dungeon.key, second.key, DURING_WAKE),
      ),
    ).rejects.toThrow(/wants/i);
  });

  it('gives the spoils to everybody who struck it, once each, and only once it has fallen', async () => {
    const other = await secondWarden();
    const key = keep().dungeon.key;

    await strike(playerId, 1_000);
    await expect(
      app.db.transaction((tx) =>
        worldboss.claimSpoils(tx, app.content, playerId, key, DURING_WAKE),
      ),
    ).rejects.toThrow(/still standing/i);

    await strike(other, keep().rules.maxHp);

    const mine = await app.db.transaction((tx) =>
      worldboss.claimSpoils(tx, app.content, playerId, key, DURING_WAKE),
    );
    expect(mine, 'one strike on Friday is worth the same chest as the last blow').toEqual(
      keep().rules.fellingRewards,
    );

    await expect(
      app.db.transaction((tx) =>
        worldboss.claimSpoils(tx, app.content, playerId, key, DURING_WAKE),
      ),
    ).rejects.toThrow(/already taken/i);
  });

  it('refuses the spoils to somebody who never struck it', async () => {
    const other = await secondWarden();
    await strike(other, keep().rules.maxHp);

    await expect(
      app.db.transaction((tx) =>
        worldboss.claimSpoils(tx, app.content, playerId, keep().dungeon.key, DURING_WAKE),
      ),
    ).rejects.toThrow(/wardens who struck it/i);
  });

  it('ranks the board, and marks the reader on it', async () => {
    const other = await secondWarden();
    await strike(playerId, 100_000);
    await strike(other, 900_000);

    const state = await worldboss.overview(
      app.db,
      app.content,
      { playerId, level: 30, dailyCounters: {}, dailyCountersDay: null },
      DURING_WAKE,
    );
    const boss = state.bosses[0]!;
    expect(boss.board.map((entry) => entry.damage)).toEqual([900_000, 100_000]);
    expect(boss.board[0]!.you).toBe(false);
    expect(boss.board[1]!.you).toBe(true);
    expect(boss.yourRank).toBe(2);
    expect(boss.yourDamage).toBe(100_000);
  });

  it('spends a strike a day and refuses the fourth', async () => {
    const rules = keep().rules;
    const spend = async () =>
      app.db.transaction(async (tx) => {
        const [player] = await tx
          .select({
            level: players.level,
            dailyCounters: players.dailyCounters,
            dailyCountersDay: players.dailyCountersDay,
          })
          .from(players)
          .where(eq(players.id, playerId));
        await worldboss.spendStrike(
          tx,
          app.content,
          {
            playerId,
            level: player!.level,
            dailyCounters: player!.dailyCounters,
            dailyCountersDay: player!.dailyCountersDay,
          },
          keep(),
          DURING_WAKE,
        );
      });

    for (let i = 0; i < rules.attemptsPerDay; i += 1) await spend();
    await expect(spend()).rejects.toThrow(/no strikes left/i);
  });

  it('starts a fresh row when the wake moves on, so last week is not this week', async () => {
    await strike(playerId, 500_000);
    // A week later: the same weekday, a different anchor.
    const nextWeek = new Date(DURING_WAKE.getTime() + 7 * 24 * 60 * 60 * 1000);
    await strike(playerId, 300_000, nextWeek);

    const rows = await app.db
      .select()
      .from(playerWorldBoss)
      .where(
        and(
          eq(playerWorldBoss.playerId, playerId),
          eq(playerWorldBoss.dungeonKey, keep().dungeon.key),
        ),
      );
    expect(rows.length, 'a wake apiece, and no reset job to have missed').toBe(2);
    expect(rows.map((row) => row.damage).sort((a, b) => a - b)).toEqual([300_000, 500_000]);
  });
});
