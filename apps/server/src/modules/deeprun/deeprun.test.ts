import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath, type DeepRunView } from '@mistvale/shared';
import { contentEntries, contentRevisions, playerDeepRuns, players } from '../../db/schema/index';
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
import * as roster from '../roster/service';
import { drawBoons, drawDoors } from './draw';
import * as deeprun from './service';

/**
 * The Deep Run, against a real database and the real seed.
 *
 * The mode is a state machine spanning battles, so what is proven here is the machine: that
 * a descent is spent when it begins, that the doors and the boon offers cannot be re-rolled
 * by asking twice, that damage and casualties carry between floors, that a wipe closes the
 * run and pays the depth it reached, and that a champion who is away on an expedition
 * cannot be sent down.
 *
 * The *fight* is not here, because it is an ordinary battle and pinned everywhere else.
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
      note: 'deep run fixture',
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

describe.skipIf(!dbUp)('the deep run', () => {
  let app: FastifyInstance;
  let cookie: string;
  let playerId: string;
  let party: string[];

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
        accountName: uniqueAccountName('delver'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
    await app.db.update(players).set({ level: 30 }).where(eq(players.id, playerId));

    const defs = app.content.current().bundle.champions.filter((champion) => !champion.isFood);
    party = [];
    for (const def of defs.slice(0, 4)) {
      const entry = await app.db.transaction((tx) =>
        roster.grantChampion(tx, playerId, def.key, {}, defs),
      );
      party.push(entry.id);
    }
  });

  const as = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: cookie } });

  const runKey = () => {
    const def = deeprun.published(app.content)[0];
    expect(def, 'the seed publishes a deep run').toBeDefined();
    return def!.key;
  };

  const warden = async () => {
    const [player] = await app.db
      .select({
        level: players.level,
        dailyCounters: players.dailyCounters,
        dailyCountersDay: players.dailyCountersDay,
      })
      .from(players)
      .where(eq(players.id, playerId));
    return {
      playerId,
      level: player!.level,
      dailyCounters: player!.dailyCounters,
      dailyCountersDay: player!.dailyCountersDay,
    };
  };

  const begin = async (ids = party) =>
    app.db.transaction(async (tx) =>
      deeprun.begin(tx, app.content, await warden(), runKey(), ids, new Date()),
    );

  const view = async (): Promise<DeepRunView> => {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.deepRun.state) });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data.deepRun as DeepRunView;
  };

  it('is shut before the account reaches the level it opens at', async () => {
    await app.db.update(players).set({ level: 5 }).where(eq(players.id, playerId));
    const state = await view();
    expect(state.runs).toEqual([]);
  });

  it('opens a descent with doors on the first floor, and spends one for it', async () => {
    const before = await view();
    expect(before.runs[0]!.phase).toBeNull();
    const allowance = before.runs[0]!.runsLeft;

    await begin();

    const after = await view();
    const run = after.runs[0]!;
    expect(run.phase).toBe('choosingDoor');
    expect(run.floor).toBe(1);
    expect(run.party).toHaveLength(4);
    expect(run.party.every((member) => member.alive && member.hpPct === 100)).toBe(true);
    expect(run.doors.length).toBeGreaterThan(1);
    expect(run.runsLeft, 'a descent is spent when it begins').toBe(allowance - 1);
  });

  it('refuses a second descent while one is under way', async () => {
    await begin();
    await expect(begin()).rejects.toThrow(/already down there/i);
  });

  it('refuses to send a champion who is away on an expedition', async () => {
    const { playerExpeditions } = await import('../../db/schema/index');
    await app.db.insert(playerExpeditions).values({
      playerId,
      expeditionKey: 'exp_mist_patrol',
      championIds: [party[0]!],
      rewards: {},
      favours: [],
      readyAt: new Date(Date.now() + 3_600_000),
    });
    await expect(begin()).rejects.toThrow(/away on an expedition/i);
  });

  it('draws the same doors when asked twice, so an offer cannot be re-rolled', async () => {
    const def = deeprun.published(app.content)[0]!;
    const first = drawDoors(def, 12_345, 3, 4);
    const second = drawDoors(def, 12_345, 3, 4);
    expect(second).toEqual(first);
    expect(new Set(first).size, 'and no door is the same room twice').toBe(first.length);

    const nudged = drawDoors(def, 12_345, 4, 4);
    expect(nudged, 'but the next draw is a different one').not.toEqual(first);
  });

  it('never offers a boon that is already held and does not stack', async () => {
    const def = deeprun.published(app.content)[0]!;
    const once = def.boons.find((boon) => !boon.stacks && boon.minFloor <= 1)!;
    const offer = drawBoons(def, 999, 1, 1, [once.key], 3);
    expect(offer).not.toContain(once.key);
    expect(new Set(offer).size).toBe(offer.length);
  });

  it('mends the party in a rest and moves on without offering a boon', async () => {
    const row = await begin();
    // Wound everybody, then walk into the rest that is always in band.
    await app.db
      .update(playerDeepRuns)
      .set({
        party: (row.party as { championId: string }[]).map((member) => ({
          championId: member.championId,
          hpPct: 40,
          alive: true,
        })),
        doors: ['stair_r_rest_low'],
      })
      .where(eq(playerDeepRuns.id, row.id));

    await app.db.transaction((tx) =>
      deeprun.enterRoom(tx, app.content, playerId, runKey(), 'stair_r_rest_low'),
    );

    const after = await view();
    const run = after.runs[0]!;
    expect(run.party[0]!.hpPct, 'mended by the room’s own healPct').toBe(75);
    expect(run.phase, 'a rest offers nothing, so the next floor is straight ahead').toBe(
      'choosingDoor',
    );
    expect(run.floor).toBe(2);
  });

  it('carries damage and casualties from one floor to the next', async () => {
    const row = await begin();
    await app.db
      .update(playerDeepRuns)
      .set({ phase: 'inBattle', currentRoom: 'stair_r_brood', doors: [] })
      .where(eq(playerDeepRuns.id, row.id));

    // The fight ended with the first champion down and the second badly hurt.
    const outcome = await app.db.transaction((tx) =>
      deeprun.settleFloor(tx, app.content, playerId, runKey(), {
        allies: [
          { hp: 0, maxHp: 10_000, alive: false },
          { hp: 3_000, maxHp: 10_000, alive: true },
          { hp: 9_000, maxHp: 10_000, alive: true },
          { hp: 10_000, maxHp: 10_000, alive: true },
        ],
      }),
    );
    expect(outcome?.wiped).toBe(false);

    const after = await view();
    const run = after.runs[0]!;
    expect(run.party[0]!.alive, 'a fallen champion stays fallen').toBe(false);
    expect(run.party[1]!.hpPct).toBe(30);
    expect(run.deepest).toBe(1);
  });

  it('ends the descent when nobody is left standing, and remembers the floor', async () => {
    const row = await begin();
    await app.db
      .update(playerDeepRuns)
      .set({ phase: 'inBattle', currentRoom: 'stair_r_brood', floor: 5, deepest: 4 })
      .where(eq(playerDeepRuns.id, row.id));

    const outcome = await app.db.transaction((tx) =>
      deeprun.settleFloor(tx, app.content, playerId, runKey(), {
        allies: party.map(() => ({ hp: 0, maxHp: 10_000, alive: false })),
      }),
    );
    expect(outcome?.wiped).toBe(true);

    const ended = await app.db.transaction((tx) =>
      deeprun.endRun(tx, app.content, playerId, runKey(), 'wiped', new Date()),
    );
    expect(ended.floor, 'a party that dies on floor five reached floor five').toBe(5);
    expect(ended.tierName).toBe('The Third Landing');
    expect(ended.completed).toBe(false);

    const after = await view();
    expect(after.runs[0]!.phase, 'and the descent is over').toBeNull();
    expect(after.runs[0]!.lastRunFloor).toBe(5);
  });

  it('takes a boon, keeps it, and moves a floor deeper', async () => {
    const row = await begin();
    await app.db
      .update(playerDeepRuns)
      .set({ phase: 'choosingBoon', boonOffer: ['boon_stoneblood', 'boon_whetstone'], doors: [] })
      .where(eq(playerDeepRuns.id, row.id));

    await app.db.transaction((tx) =>
      deeprun.takeBoon(tx, app.content, playerId, runKey(), 'boon_stoneblood'),
    );

    const after = await view();
    const run = after.runs[0]!;
    expect(run.boons.map((boon) => boon.key)).toEqual(['boon_stoneblood']);
    expect(run.floor).toBe(2);
    expect(run.phase).toBe('choosingDoor');
    expect(run.doors.length).toBeGreaterThan(1);
  });

  it('refuses a boon that was not offered', async () => {
    const row = await begin();
    await app.db
      .update(playerDeepRuns)
      .set({ phase: 'choosingBoon', boonOffer: ['boon_stoneblood'] })
      .where(eq(playerDeepRuns.id, row.id));

    await expect(
      app.db.transaction((tx) =>
        deeprun.takeBoon(tx, app.content, playerId, runKey(), 'boon_the_stair_remembers'),
      ),
    ).rejects.toThrow(/not on offer/i);
  });

  it('walks out with what the depth was worth', async () => {
    const row = await begin();
    await app.db
      .update(playerDeepRuns)
      .set({ floor: 7, deepest: 6 })
      .where(eq(playerDeepRuns.id, row.id));

    const response = await as({
      method: 'POST',
      url: apiPath(ROUTES.deepRun.retire(runKey())),
      payload: { actionId: 'deeprun-retire-1' },
    });
    expect(response.statusCode, response.body).toBe(200);
    const outcome = response.json().data.outcome;
    expect(outcome.floor).toBe(6);
    expect(outcome.tierName).toBe('Halfway Down');
    expect(outcome.rewards.silver).toBeGreaterThan(0);
  });

  it('strips the relics: a descent assembles champions with no gear at all', async () => {
    await begin();
    const entries = [
      {
        def: { key: 'x' },
        level: 1,
        rank: 1,
        ascension: 0,
        bonuses: { atk: 100 },
        masteries: [],
      },
    ] as never;
    // `dressForTheDescent` only *adds* — the stripping happens because `assembleEntries` is
    // told to skip gear. What is checked here is that the boons it adds are the run's.
    await app.db.transaction(async (tx) => {
      const row = await deeprun.activeRun(tx, playerId, runKey());
      await tx
        .update(playerDeepRuns)
        .set({ boons: ['boon_stoneblood'] })
        .where(eq(playerDeepRuns.id, row!.id));
      await deeprun.dressForTheDescent(tx, app.content, playerId, runKey(), entries);
    });
    expect((entries as { bonuses: Record<string, number> }[])[0]!.bonuses.hp).toBe(2_500);
    expect((entries as { bonuses: Record<string, number> }[])[0]!.bonuses.atk).toBe(100);
  });
});
