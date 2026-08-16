import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath } from '@mistvale/shared';
import {
  battleSessions,
  contentEntries,
  contentRevisions,
  economyLog,
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

/**
 * The game loop, end to end.
 *
 * This is the test that says the game is playable: a fresh account picks a starter, walks
 * into chapter 1-1, fights it, and comes out with silver and XP. It runs against the real
 * seeded content and a real database, because the interesting failures live exactly where
 * the engine, the content and the wallet meet.
 */

const dbUp = await isDatabaseAvailable();

/** Loads the committed seeds into the test database, normalised exactly as a seed run would. */
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
    // Other suites share this database and leave their own fixtures behind; start clean
    // so the revision numbering below is the only one in play.
    await tx.delete(contentEntries);
    await tx.delete(contentRevisions);
    await contentRepo.replaceLiveContent(tx, flattened);
    await contentRepo.insertRevision(tx, {
      rev: 1,
      publishedBy: 'test',
      note: 'battle fixture',
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

describe.skipIf(!dbUp)('the game loop', () => {
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
        accountName: uniqueAccountName('warden'),
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

  /** Picks the first starter and returns the roster it produced. */
  async function chooseStarter(): Promise<{ id: string; championKey: string }[]> {
    const offered = await as({ method: 'GET', url: apiPath(ROUTES.roster.starters) });
    expect(offered.statusCode).toBe(200);
    const starters = offered.json().data.starters as { key: string }[];
    expect(starters.length).toBeGreaterThan(0);

    const granted = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.chooseStarter),
      payload: { championKey: starters[0]!.key },
    });
    expect(granted.statusCode, granted.body).toBe(200);
    return granted.json().data.champions as { id: string; championKey: string }[];
  }

  describe('roster', () => {
    it('offers the starters flagged in content, and only those', async () => {
      const response = await as({ method: 'GET', url: apiPath(ROUTES.roster.starters) });
      const starters = response.json().data.starters as { key: string }[];
      const flagged = app.content
        .current()
        .bundle.champions.filter((champion) => champion.starter && !champion.isFood)
        .map((champion) => champion.key);
      expect(starters.map((entry) => entry.key).sort()).toEqual(flagged.sort());
    });

    it('grants the chosen starter', async () => {
      const champions = await chooseStarter();
      expect(champions).toHaveLength(1);
      expect(champions[0]?.championKey).toBeTruthy();

      const listed = await as({ method: 'GET', url: apiPath(ROUTES.roster.list) });
      expect(listed.json().data.champions).toHaveLength(1);
    });

    it('does not mint a second roster when the grant is retried', async () => {
      await chooseStarter();
      await chooseStarter();
      const listed = await as({ method: 'GET', url: apiPath(ROUTES.roster.list) });
      expect(listed.json().data.champions).toHaveLength(1);
    });

    it('refuses a champion that is not a starter', async () => {
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.chooseStarter),
        payload: { championKey: 'sskarn_skirmisher' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION');
    });
  });

  describe('starting a battle', () => {
    it('spends energy and opens a session', async () => {
      const champions = await chooseStarter();
      const [before] = await app.db
        .select({ energy: players.energy })
        .from(players)
        .where(eq(players.id, playerId));

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'campaign', stageKey: 'c01_s1_normal', team: [champions[0]!.id] },
      });
      expect(response.statusCode, response.body).toBe(200);

      const view = response.json().data;
      expect(view.status).toBe('active');
      expect(view.events[0].type).toBe('battleStart');

      const [after] = await app.db
        .select({ energy: players.energy })
        .from(players)
        .where(eq(players.id, playerId));
      expect(after!.energy).toBeLessThan(before!.energy);
    });

    it('refuses a champion the player does not own', async () => {
      await chooseStarter();
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: {
          mode: 'campaign',
          stageKey: 'c01_s1_normal',
          team: ['00000000-0000-4000-8000-000000000000'],
        },
      });
      expect(response.statusCode).toBe(400);
    });

    it('refuses a second battle while one is running', async () => {
      const champions = await chooseStarter();
      const payload = { mode: 'campaign', stageKey: 'c01_s1_normal', team: [champions[0]!.id] };
      expect(
        (await as({ method: 'POST', url: apiPath(ROUTES.battle.start), payload })).statusCode,
      ).toBe(200);

      const second = await as({ method: 'POST', url: apiPath(ROUTES.battle.start), payload });
      expect(second.statusCode).toBe(409);
      expect(second.json().error.code).toBe('ALREADY_EXISTS');
    });

    it('reports the battle in progress', async () => {
      const champions = await chooseStarter();
      await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'campaign', stageKey: 'c01_s1_normal', team: [champions[0]!.id] },
      });

      const active = await as({ method: 'GET', url: apiPath(ROUTES.battle.active) });
      expect(active.json().data.battle).not.toBeNull();
      expect(active.json().data.battle.stageKey).toBe('c01_s1_normal');
    });

    it('refuses a stage that does not exist', async () => {
      const champions = await chooseStarter();
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'campaign', stageKey: 'not_a_stage', team: [champions[0]!.id] },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('fighting', () => {
    async function startFight(): Promise<string> {
      const champions = await chooseStarter();
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'campaign', stageKey: 'c01_s1_normal', team: [champions[0]!.id] },
      });
      return response.json().data.id as string;
    }

    it('resolves the whole fight on auto and pays out a win', async () => {
      const battleId = await startFight();

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: 'auto-run-0001', auto: true },
      });
      expect(response.statusCode, response.body).toBe(200);

      const view = response.json().data;
      expect(view.status).toBe('finished');
      expect(['victory', 'defeat', 'turnLimit']).toContain(view.outcome);
      expect(view.events.at(-1).type).toBe('battleEnd');

      if (view.outcome === 'victory') {
        expect(view.rewards.silver).toBeGreaterThan(0);
        expect(view.rewards.stars).toBeGreaterThanOrEqual(1);
        expect(view.rewards.stars).toBeLessThanOrEqual(3);

        const [wallet] = await app.db
          .select({ silver: players.silver, xp: players.xp, level: players.level })
          .from(players)
          .where(eq(players.id, playerId));
        expect(wallet!.silver).toBe(view.rewards.silver);

        const ledger = await app.db
          .select()
          .from(economyLog)
          .where(eq(economyLog.playerId, playerId));
        expect(ledger).toHaveLength(1);
        expect(ledger[0]?.source).toContain('c01_s1_normal');
      }
    });

    it('treats a retried action as the same turn, not a second one', async () => {
      const battleId = await startFight();

      const first = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: 'repeat-me-0001', auto: true },
      });
      const replay = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: 'repeat-me-0001', auto: true },
      });

      expect(replay.statusCode).toBe(200);
      expect(replay.json().data.events).toHaveLength(first.json().data.events.length);
      expect(replay.json().data.outcome).toBe(first.json().data.outcome);

      // And crucially, it did not pay twice.
      const ledger = await app.db
        .select()
        .from(economyLog)
        .where(eq(economyLog.playerId, playerId));
      expect(ledger.length).toBeLessThanOrEqual(1);
    });

    it('pauses for input in manual mode, then acts on the chosen skill', async () => {
      const battleId = await startFight();

      const paused = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: 'manual-0001' },
      });
      expect(paused.statusCode, paused.body).toBe(200);
      expect(paused.json().data.state.awaiting).not.toBeNull();

      const roster = await as({ method: 'GET', url: apiPath(ROUTES.roster.list) });
      const key = (roster.json().data.champions as { championKey: string }[])[0]!.championKey;
      const champion = app.content.current().bundle.champions.find((entry) => entry.key === key)!;

      const acted = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: 'manual-0002', skill: champion.skills[0] },
      });
      expect(acted.statusCode, acted.body).toBe(200);
      const used = (acted.json().data.events as { type: string; skill?: string }[]).filter(
        (event) => event.type === 'skillUsed',
      );
      expect(used.some((event) => event.skill === champion.skills[0])).toBe(true);
    });

    it('ends the fight on retreat and keeps the energy spent', async () => {
      const battleId = await startFight();
      const [spent] = await app.db
        .select({ energy: players.energy })
        .from(players)
        .where(eq(players.id, playerId));

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.retreat(battleId)),
        payload: {},
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().data.outcome).toBe('retreat');
      expect(response.json().data.rewards).toBeNull();

      const [after] = await app.db
        .select({ energy: players.energy })
        .from(players)
        .where(eq(players.id, playerId));
      expect(after!.energy).toBe(spent!.energy);
    });

    it('refuses to act on a finished battle', async () => {
      const battleId = await startFight();
      await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.retreat(battleId)),
        payload: {},
      });

      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: 'too-late-0001', auto: true },
      });
      expect(response.statusCode).toBe(400);
    });

    it('frees the player to start another battle once one ends', async () => {
      const battleId = await startFight();
      await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: 'finish-0001', auto: true },
      });

      const [champion] = await app.db
        .select({ id: playerChampions.id })
        .from(playerChampions)
        .where(eq(playerChampions.playerId, playerId));

      const again = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'campaign', stageKey: 'c01_s1_normal', team: [champion!.id] },
      });
      expect(again.statusCode, again.body).toBe(200);
    });

    it('keeps one session row per fight, with its full log', async () => {
      const battleId = await startFight();
      await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: 'log-0001', auto: true },
      });

      const [row] = await app.db
        .select()
        .from(battleSessions)
        .where(eq(battleSessions.id, battleId));
      expect(row?.status).toBe('finished');
      expect((row?.events as unknown[]).length).toBeGreaterThan(5);
      expect((row?.teamIds as string[]).length).toBe(1);
      expect(row?.finishedAt).not.toBeNull();
    });

    it('cannot be read by another player', async () => {
      const battleId = await startFight();

      const other = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.register),
        payload: {
          accountName: uniqueAccountName('nosy'),
          profileName: uniqueProfileName(),
          password: 'a-good-long-password',
        },
      });
      const otherCookie = extractSessionCookie(other.headers['set-cookie']) as string;

      const response = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.battle.byId(battleId)),
        cookies: { mv_session: otherCookie },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  it('requires a session for every game endpoint', async () => {
    for (const url of [
      apiPath(ROUTES.roster.list),
      apiPath(ROUTES.roster.starters),
      apiPath(ROUTES.battle.active),
    ]) {
      expect((await app.inject({ method: 'GET', url })).statusCode).toBe(401);
    }
  });
});
