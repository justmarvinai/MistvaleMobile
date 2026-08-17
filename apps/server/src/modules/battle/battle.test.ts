import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { ROUTES, apiPath } from '@mistvale/shared';
import {
  battleSessions,
  contentEntries,
  contentRevisions,
  economyLog,
  playerChampions,
  players,
  stageProgress,
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

  /** Economy rows this battle wrote. The welcome grant and friends are not in scope. */
  const battleLedger = async () => {
    const rows = await app.db.select().from(economyLog).where(eq(economyLog.playerId, playerId));
    return rows.filter((row) => row.source.startsWith('battle:'));
  };

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

        // A first clear pays its bonus on top of the stage payout, and the day's first
        // campaign victory pays a third time. All three are reported separately rather
        // than summed into one number, so a player can see where the silver came from.
        expect(view.rewards.firstClear).toBe(true);
        expect(view.rewards.firstWin.silver).toBeGreaterThan(0);
        const [wallet] = await app.db
          .select({ silver: players.silver, xp: players.xp, level: players.level })
          .from(players)
          .where(eq(players.id, playerId));
        expect(wallet!.silver).toBe(
          view.rewards.silver +
            (view.rewards.bonus.silver ?? 0) +
            (view.rewards.firstWin.silver ?? 0),
        );

        // A clear writes one currency row, and one more for item drops when the stage
        // rolled any. What must never happen is a *second* row from the fight itself:
        // that would be a double payout, which is the thing this assertion exists to
        // catch. The first-win bonus is a separate source on purpose — it is a daily
        // reward that happens to land on a battle, not part of the battle's payout.
        const ledger = await battleLedger();
        const currencyRows = ledger.filter((row) =>
          Object.hasOwn(row.deltas as Record<string, number>, 'silver'),
        );
        expect(currencyRows).toHaveLength(1);
        for (const row of ledger) expect(row.source).toContain('c01_s1_normal');

        const firstWinRows = (
          await app.db.select().from(economyLog).where(eq(economyLog.playerId, playerId))
        ).filter((row) => row.source === 'quest:firstWin:campaign');
        expect(firstWinRows).toHaveLength(1);
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

      // And crucially, it did not pay twice. A win writes at most one currency row and
      // at most one drop row; a replay that settled again would double either.
      const ledger = await battleLedger();
      const currencyRows = ledger.filter((row) =>
        Object.hasOwn(row.deltas as Record<string, number>, 'silver'),
      );
      expect(currencyRows.length).toBeLessThanOrEqual(1);
      expect(ledger.length - currencyRows.length).toBeLessThanOrEqual(1);
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

  /**
   * Farming without watching, and fighting without stakes.
   *
   * The two halves of P6d share a shape — both are ordinary battles the player does not
   * pay full attention to — but they are opposite in what they cost: a batch spends
   * everything at once, and practice spends nothing at all. Both are checked here against
   * the wallet and the progress table, because "pays nothing" and "pays ten times" are
   * only claims until the ledger agrees.
   */
  describe('multi-battle', () => {
    /** A team, a level that clears the unlock, and enough energy for a full batch. */
    async function readyToFarm(energy = 200, level = 10): Promise<string> {
      const champions = await chooseStarter();
      await app.db.update(players).set({ level, energy }).where(eq(players.id, playerId));
      return champions[0]!.id;
    }

    /** What one run of 1-1 costs, read from content rather than assumed. */
    const stageCost = (): number =>
      app.content.current().bundle.stages.find((stage) => stage.key === 'c01_s1_normal')!
        .energyCost;

    const farm = (team: string[], runs: number, actionId: string) =>
      as({
        method: 'POST',
        url: apiPath(ROUTES.battle.multi),
        payload: { mode: 'campaign', stageKey: 'c01_s1_normal', team, runs, actionId },
      });

    it('fights the stage the requested number of times and pays for each', async () => {
      const championId = await readyToFarm();
      const response = await farm([championId], 5, 'batch-00000001');
      expect(response.statusCode, response.body).toBe(200);

      const result = response.json().data;
      expect(result.runs).toHaveLength(5);
      expect(result.stoppedReason).toBeNull();
      expect(result.wins).toBe(5);
      expect(result.energySpent).toBe(5 * stageCost());
      expect(result.silver).toBe(
        result.runs.reduce((total: number, run: { silver: number }) => total + run.silver, 0),
      );

      // The clears are real clears: the same table a manual fight writes, so a batch
      // advances the map rather than quietly farming a stage that stays unbeaten.
      const [standing] = await app.db
        .select()
        .from(stageProgress)
        .where(eq(stageProgress.playerId, playerId));
      expect(standing?.clears).toBe(5);
      expect(standing?.stars).toBeGreaterThanOrEqual(1);
    });

    it('writes no session rows — the summary is the record', async () => {
      const championId = await readyToFarm();
      await farm([championId], 3, 'batch-00000002');

      const sessions = await app.db
        .select({ id: battleSessions.id })
        .from(battleSessions)
        .where(eq(battleSessions.playerId, playerId));
      expect(sessions).toHaveLength(0);
    });

    it('replays a retried batch instead of farming it twice', async () => {
      const championId = await readyToFarm();
      const first = await farm([championId], 4, 'batch-00000003');
      const [afterFirst] = await app.db
        .select({ silver: players.silver, energy: players.energy })
        .from(players)
        .where(eq(players.id, playerId));

      const retried = await farm([championId], 4, 'batch-00000003');
      expect(retried.statusCode, retried.body).toBe(200);
      expect(retried.json().data).toEqual(first.json().data);

      const [afterRetry] = await app.db
        .select({ silver: players.silver, energy: players.energy })
        .from(players)
        .where(eq(players.id, playerId));
      expect(afterRetry).toEqual(afterFirst);
    });

    it('trims the batch to what energy covers and says so', async () => {
      const champions = await chooseStarter();
      // Exactly three runs' worth, asked for five.
      await app.db
        .update(players)
        .set({ level: 10, energy: stageCost() * 3 })
        .where(eq(players.id, playerId));

      const response = await farm([champions[0]!.id], 5, 'batch-00000004');
      expect(response.statusCode, response.body).toBe(200);

      const result = response.json().data;
      expect(result.runs).toHaveLength(3);
      expect(result.stoppedReason).toBe('outOfEnergy');
      expect(result.energyLeft).toBe(0);
    });

    it('trims the batch to what one press may ask for', async () => {
      const championId = await readyToFarm();
      const cap = app.content.current().bundle.config['economy.multiBattleMaxPerCall'] as number;

      const response = await farm([championId], cap + 5, 'batch-00000005');
      const result = response.json().data;
      expect(result.runs).toHaveLength(cap);
      expect(result.stoppedReason).toBe('perCallLimit');
    });

    it('spends a daily allowance that refuses once it is gone', async () => {
      const championId = await readyToFarm(600);
      const cap = app.content.current().bundle.config['economy.multiBattleDailyCap'] as number;
      const perCall = app.content.current().bundle.config[
        'economy.multiBattleMaxPerCall'
      ] as number;

      let spent = 0;
      for (let batch = 0; spent < cap; batch += 1) {
        const response = await farm([championId], perCall, `batch-cap-${batch}`);
        expect(response.statusCode, response.body).toBe(200);
        spent += response.json().data.runs.length;
      }
      expect(spent).toBe(cap);

      const exhausted = await farm([championId], 1, 'batch-cap-last');
      expect(exhausted.statusCode).toBe(429);
      expect(exhausted.json().error.code).toBe('COOLDOWN');
    });

    it('reports the allowance on the player snapshot', async () => {
      const championId = await readyToFarm();
      await farm([championId], 3, 'batch-00000006');

      const snapshot = await as({ method: 'GET', url: apiPath(ROUTES.player.self) });
      const multi = snapshot.json().data.multiBattle;
      expect(multi.unlocked).toBe(true);
      expect(multi.runsLeftToday).toBe(multi.dailyCap - 3);
    });

    it('is shut until the account level opens it', async () => {
      const champions = await chooseStarter();
      await app.db.update(players).set({ level: 1, energy: 200 }).where(eq(players.id, playerId));

      const response = await farm([champions[0]!.id], 2, 'batch-00000007');
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('LOCKED_CONTENT');

      const snapshot = await as({ method: 'GET', url: apiPath(ROUTES.player.self) });
      expect(snapshot.json().data.multiBattle.unlocked).toBe(false);
      expect(snapshot.json().data.multiBattle.lockedReason).toContain('level');
    });

    it('refuses to batch a fight the player is already in', async () => {
      const championId = await readyToFarm();
      await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'campaign', stageKey: 'c01_s1_normal', team: [championId] },
      });

      const response = await farm([championId], 2, 'batch-00000008');
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('ALREADY_EXISTS');
    });

    it('refuses to batch a practice run', async () => {
      const championId = await readyToFarm();
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.multi),
        payload: {
          mode: 'practice',
          stageKey: 'c01_s1_normal',
          team: [championId],
          runs: 2,
          actionId: 'batch-00000009',
        },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('the practice sandbox', () => {
    /** Clears 1-1 the ordinary way, which is what makes it practisable. */
    async function clearFirstStage(): Promise<string> {
      const champions = await chooseStarter();
      const championId = champions[0]!.id;
      await app.db.update(players).set({ energy: 200 }).where(eq(players.id, playerId));

      for (let attempt = 0; attempt < 5; attempt += 1) {
        const started = await as({
          method: 'POST',
          url: apiPath(ROUTES.battle.start),
          payload: { mode: 'campaign', stageKey: 'c01_s1_normal', team: [championId] },
        });
        const battleId = started.json().data.id as string;
        const finished = await as({
          method: 'POST',
          url: apiPath(ROUTES.battle.action(battleId)),
          payload: { actionId: `clear-attempt-${attempt}`, auto: true },
        });
        if (finished.json().data.outcome === 'victory') return championId;
      }
      throw new Error('the starter could not clear 1-1 in five attempts');
    }

    it('costs nothing and pays nothing', async () => {
      const championId = await clearFirstStage();
      const [before] = await app.db
        .select({ silver: players.silver, energy: players.energy, xp: players.xp })
        .from(players)
        .where(eq(players.id, playerId));
      const [clearsBefore] = await app.db
        .select({ clears: stageProgress.clears })
        .from(stageProgress)
        .where(eq(stageProgress.playerId, playerId));

      const started = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'practice', stageKey: 'c01_s1_normal', team: [championId] },
      });
      expect(started.statusCode, started.body).toBe(200);
      const battleId = started.json().data.id as string;

      const finished = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: 'practice-0001', auto: true },
      });
      expect(finished.statusCode, finished.body).toBe(200);
      const view = finished.json().data;
      expect(view.status).toBe('finished');

      const [after] = await app.db
        .select({ silver: players.silver, energy: players.energy, xp: players.xp })
        .from(players)
        .where(eq(players.id, playerId));
      expect(after).toEqual(before);

      // Stars are still reported — the point of a sandbox is to find out how a team does
      // — but nothing is recorded, so the clear count does not move.
      if (view.outcome === 'victory') {
        expect(view.rewards.stars).toBeGreaterThanOrEqual(1);
        expect(view.rewards.silver).toBe(0);
        expect(view.rewards.firstClear).toBe(false);
      }
      const [clearsAfter] = await app.db
        .select({ clears: stageProgress.clears })
        .from(stageProgress)
        .where(eq(stageProgress.playerId, playerId));
      expect(clearsAfter?.clears).toBe(clearsBefore?.clears);
    });

    it('refuses a stage the player has never cleared', async () => {
      const champions = await chooseStarter();
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'practice', stageKey: 'c01_s1_normal', team: [champions[0]!.id] },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('LOCKED_CONTENT');
    });
  });

  // ── The cold open ────────────────────────────────────────────────────────

  /**
   * The one fight nobody brings a team to.
   *
   * A `tutorial` stage carries its own roster, so this is the only path through `start`
   * that never touches `player_champions` — which is exactly why it needs its own tests:
   * every other branch would have failed loudly on an empty roster, and this one has to
   * succeed on one.
   */
  describe('the cold open', () => {
    const COLD_OPEN = 'tut_cold_open';

    const openFight = () =>
      as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'tutorial', stageKey: COLD_OPEN, team: [] },
      });

    it('is fought with the stage’s own team, by an account that owns nobody', async () => {
      const response = await openFight();
      expect(response.statusCode, response.body).toBe(200);

      const stage = app.content.current().bundle.stages.find((entry) => entry.key === COLD_OPEN)!;
      const view = response.json().data;
      // The engine built one combatant per preset entry, and the roster is still empty.
      expect(view.state.allies).toHaveLength(stage.presetTeam.length);
      const roster = await as({ method: 'GET', url: apiPath(ROUTES.roster.list) });
      expect(roster.json().data.champions).toHaveLength(0);
    });

    it('costs no energy — the account has not been shown what energy is yet', async () => {
      const [before] = await app.db
        .select({ energy: players.energy })
        .from(players)
        .where(eq(players.id, playerId));

      expect((await openFight()).statusCode).toBe(200);

      const [after] = await app.db
        .select({ energy: players.energy })
        .from(players)
        .where(eq(players.id, playerId));
      expect(after!.energy).toBe(before!.energy);
    });

    it('gives the borrowed team relics, so it hits like the taste of power it is', async () => {
      const view = (await openFight()).json().data;
      const stage = app.content.current().bundle.stages.find((entry) => entry.key === COLD_OPEN)!;

      // Champions carrying three rank-3 relics each are meaningfully above their bare
      // selves; if the preset gear were silently dropped, this is what would notice.
      const scaled = view.state.allies.map((ally: { maxHp: number }) => ally.maxHp);
      expect(scaled.every((hp: number) => hp > 0)).toBe(true);
      expect(stage.presetTeam.every((member) => member.relics.length > 0)).toBe(true);
    });

    it('is the same fight for everybody', async () => {
      const first = (await openFight()).json().data;
      await as({ method: 'POST', url: apiPath(ROUTES.battle.retreat(first.id)) });

      // A second account, from scratch: same borrowed champions at the same strength.
      const other = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.register),
        payload: {
          accountName: uniqueAccountName('second'),
          profileName: uniqueProfileName(),
          password: 'a-good-long-password',
        },
      });
      const otherCookie = extractSessionCookie(other.headers['set-cookie']) as string;
      const second = (
        await app.inject({
          method: 'POST',
          url: apiPath(ROUTES.battle.start),
          payload: { mode: 'tutorial', stageKey: COLD_OPEN, team: [] },
          cookies: { mv_session: otherCookie },
        })
      ).json().data;

      // The relics are rolled from the stage key, not the battle seed, so the numbers
      // match even though the two fights run on different streams.
      expect(second.state.allies.map((ally: { maxHp: number }) => ally.maxHp)).toEqual(
        first.state.allies.map((ally: { maxHp: number }) => ally.maxHp),
      );
    });

    it('pays nothing and records no clear, however it ends', async () => {
      const battleId = (await openFight()).json().data.id as string;
      const resolved = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: 'cold-open-0001', auto: true },
      });
      expect(resolved.statusCode, resolved.body).toBe(200);

      const view = resolved.json().data;
      expect(view.status).not.toBe('active');
      expect(view.rewards?.silver ?? 0).toBe(0);
      expect(view.rewards?.playerXp ?? 0).toBe(0);
      expect(await battleLedger()).toHaveLength(0);

      const [row] = await app.db
        .select()
        .from(stageProgress)
        .where(and(eq(stageProgress.playerId, playerId), eq(stageProgress.stageKey, COLD_OPEN)));
      expect(row).toBeUndefined();
    });

    it('is a fight the borrowed team wins', async () => {
      // The whole point of the beat: frightening on the third wave, and then won. A cold
      // open a new account loses is a cold open that teaches the wrong thing.
      const battleId = (await openFight()).json().data.id as string;
      const resolved = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: 'cold-open-0002', auto: true },
      });
      expect(resolved.json().data.outcome).toBe('victory');
    });

    it('refuses to be farmed in a batch', async () => {
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.multi),
        payload: { mode: 'tutorial', stageKey: COLD_OPEN, team: [], runs: 5, actionId: 'batch-01' },
      });
      expect(response.statusCode).toBe(400);
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
