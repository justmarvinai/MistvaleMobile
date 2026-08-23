import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ROUTES, apiPath, speedsFor, type StageStanding } from '@mistvale/shared';
import {
  chapterRewards,
  contentEntries,
  contentRevisions,
  players,
  stageProgress,
} from '../../db/schema/index';
import { buildSeedContent } from '../../db/seed/seeders';
import * as contentRepo from '../../content/repo';
import { validateAndNormalise, type ContentSet } from '../../content/validate';
import * as progress from './service';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../../test/harness';

/**
 * Progress: what is open, what has been cleared, and what that was worth.
 *
 * The unlock chain has been authored in content since P1 and enforced since P6 — before
 * that a fresh account could walk into a chapter-3 boss. These tests pin the gate shut,
 * and pin the two once-only bonuses that hang off progress rather than off the fight.
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
      note: 'progress fixture',
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

describe.skipIf(!dbUp)('progress', () => {
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
        accountName: uniqueAccountName('pusher'),
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

  async function chooseStarter(): Promise<string> {
    const offered = await as({ method: 'GET', url: apiPath(ROUTES.roster.starters) });
    const starters = offered.json().data.starters as { key: string }[];
    const granted = await as({
      method: 'POST',
      url: apiPath(ROUTES.roster.chooseStarter),
      payload: { championKey: starters[0]!.key },
    });
    return (granted.json().data.champions as { id: string }[])[0]!.id;
  }

  async function readProgress(): Promise<StageStanding[]> {
    const response = await as({ method: 'GET', url: apiPath(ROUTES.progress.stages) });
    expect(response.statusCode, response.body).toBe(200);
    return response.json().data.progress.stages as StageStanding[];
  }

  const standingFor = (stages: StageStanding[], key: string): StageStanding =>
    stages.find((entry) => entry.stageKey === key)!;

  /** Records a clear directly, so a test about unlocks need not fight six battles. */
  async function markCleared(stageKey: string, stars = 3): Promise<void> {
    const stage = app.content.current().bundle.stages.find((entry) => entry.key === stageKey)!;
    await app.db
      .insert(stageProgress)
      .values({
        playerId,
        stageKey,
        parentKey: stage.parentKey,
        mode: stage.mode,
        stars,
        clears: 1,
        bestTurns: 5,
        firstClearedAt: new Date(),
        lastClearedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [stageProgress.playerId, stageProgress.stageKey],
        set: { stars, clears: 1 },
      });
  }

  describe('unlocks', () => {
    it('opens the first stage and shuts the rest of the chapter', async () => {
      const stages = await readProgress();
      expect(standingFor(stages, 'c01_s1_normal').open).toBe(true);
      expect(standingFor(stages, 'c01_s2_normal').open).toBe(false);
      expect(standingFor(stages, 'c01_s2_normal').lockedReason).toMatch(/clear 1-1/i);
    });

    it('refuses a battle on a stage that is shut', async () => {
      const championId = await chooseStarter();
      const response = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: {
          mode: 'campaign',
          stageKey: 'c01_s7_normal',
          team: [championId],
          actionId: 'start-progresste-001',
        },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('LOCKED_CONTENT');
    });

    it('opens the next stage once its predecessor falls', async () => {
      await markCleared('c01_s1_normal');
      const stages = await readProgress();
      expect(standingFor(stages, 'c01_s2_normal').open).toBe(true);
      expect(standingFor(stages, 'c01_s3_normal').open).toBe(false);
    });

    it('keeps a harder difficulty shut until the one below is finished', async () => {
      // The *whole* one below: Hard 1-1 wants 12-7 Normal, which is what makes Hard a
      // second pass over the vale rather than an alternative to the chapter you are on.
      const stages = await readProgress();
      const hard = standingFor(stages, 'c01_s1_hard');
      expect(hard.open).toBe(false);
      expect(hard.lockedReason).toMatch(/clear 12-7/i);

      const brutal = standingFor(stages, 'c01_s1_brutal');
      expect(brutal.open).toBe(false);
      expect(brutal.lockedReason).toMatch(/clear 12-7/i);
    });

    it('opens chapter 2 only after chapter 1 is beaten', async () => {
      expect(standingFor(await readProgress(), 'c02_s1_normal').open).toBe(false);
      await markCleared('c01_s7_normal');
      expect(standingFor(await readProgress(), 'c02_s1_normal').open).toBe(true);
    });
  });

  describe('recording a clear', () => {
    it('keeps the best star count, not the latest', async () => {
      const championId = await chooseStarter();

      // Win once for real, then overwrite the row with a worse result the way a sloppy
      // re-run would, and win again — the good result must survive.
      await fight(championId);
      await app.db
        .update(stageProgress)
        .set({ stars: 3 })
        .where(eq(stageProgress.playerId, playerId));

      await fight(championId);
      const [row] = await app.db
        .select()
        .from(stageProgress)
        .where(eq(stageProgress.playerId, playerId));
      expect(row!.stars).toBe(3);
      expect(row!.clears).toBe(2);
    });

    it('pays the first-clear bonus once and not again', async () => {
      const championId = await chooseStarter();

      const first = await fight(championId);
      expect(first.rewards.firstClear).toBe(true);
      expect(first.rewards.bonus.silver).toBeGreaterThan(0);

      const second = await fight(championId);
      expect(second.rewards.firstClear).toBe(false);
      expect(second.rewards.bonus.silver ?? 0).toBe(0);
    });

    it('pays a chapter star chest when the total crosses its tier, once', async () => {
      const championId = await chooseStarter();

      // Seven stars is the first tier for chapter 1. Plant six, then earn the seventh
      // in a real fight so the chest is claimed by the clear rather than by the fixture.
      for (const stage of ['c01_s2_normal', 'c01_s3_normal']) await markCleared(stage, 3);
      await app.db
        .update(stageProgress)
        .set({ stars: 3 })
        .where(eq(stageProgress.playerId, playerId));

      const result = await fight(championId);
      expect(result.rewards.chestTiers).toContain(7);

      const [claim] = await app.db
        .select()
        .from(chapterRewards)
        .where(eq(chapterRewards.playerId, playerId));
      expect(claim!.claimedTiers).toContain(7);

      // A re-clear must not hand it over a second time.
      const again = await fight(championId);
      expect(again.rewards.chestTiers).toEqual([]);
    });
  });

  describe('finishing a campaign difficulty', () => {
    /**
     * What the playback speeds are gated on (owner, 2026-08-22): ×3 for walking the whole
     * vale on Normal, ×4 for walking it again on Brutal.
     *
     * Worth a database test rather than a unit one because "the whole campaign" is read
     * from *published content* against *this player's rows* — 84 stages a difficulty, and
     * the answer has to be false while even one of them is missing.
     */
    function campaignKeys(difficulty: string): string[] {
      return app.content
        .current()
        .bundle.stages.filter(
          (stage) => stage.mode === 'campaign' && stage.difficulty === difficulty,
        )
        .map((stage) => stage.key);
    }

    it('is false until every stage of that difficulty is cleared', async () => {
      const keys = campaignKeys('normal');
      expect(keys.length).toBeGreaterThan(1);

      expect(await progress.campaignsFinished(app.db, playerId, app.content)).toMatchObject({
        normal: false,
      });

      // All but the last one. One missing stage is still an unfinished campaign.
      for (const key of keys.slice(0, -1)) await markCleared(key);
      expect(await progress.campaignsFinished(app.db, playerId, app.content)).toMatchObject({
        normal: false,
      });

      await markCleared(keys[keys.length - 1]!);
      expect(await progress.campaignsFinished(app.db, playerId, app.content)).toMatchObject({
        normal: true,
      });
    });

    it('answers per difficulty, so Normal does not hand over Brutal', async () => {
      for (const key of campaignKeys('normal')) await markCleared(key);
      const finished = await progress.campaignsFinished(app.db, playerId, app.content);
      expect(finished.normal).toBe(true);
      expect(finished.hard).toBe(false);
      expect(finished.brutal).toBe(false);
      expect(speedsFor(finished)).toEqual([1, 2, 4]);
    });

    it('adds nothing for Brutal, whose rung the owner removed', async () => {
      // The ladder stops at ×4 and ×4's condition is Normal, so walking Brutal as well
      // leaves the ladder where it was. Kept as a test rather than deleted: it is the one
      // consequence of dropping the top rung that a player would actually notice.
      for (const key of [...campaignKeys('normal'), ...campaignKeys('brutal')]) {
        await markCleared(key);
      }
      expect(speedsFor(await progress.campaignsFinished(app.db, playerId, app.content))).toEqual([
        1, 2, 4,
      ]);
    });
  });

  describe('the map payload', () => {
    it('reports stars, clears and the best turn count', async () => {
      const championId = await chooseStarter();
      await fight(championId);

      const standing = standingFor(await readProgress(), 'c01_s1_normal');
      expect(standing.clears).toBe(1);
      expect(standing.stars).toBeGreaterThanOrEqual(1);
      expect(standing.bestTurns).toBeGreaterThan(0);
    });

    it('totals stars per chapter', async () => {
      await markCleared('c01_s1_normal', 3);
      await markCleared('c01_s2_normal', 2);

      const response = await as({ method: 'GET', url: apiPath(ROUTES.progress.stages) });
      expect(response.json().data.progress.parentStars.chapter_01).toBe(5);
    });
  });

  /** Fights 1-1 to the end on auto and returns the finished view. */
  async function fight(championId: string): Promise<{
    rewards: {
      firstClear: boolean;
      bonus: Record<string, number>;
      chestTiers: number[];
      stars: number;
    };
  }> {
    // Energy regenerates slowly; a test that fights repeatedly needs it topped up.
    await app.db.update(players).set({ energy: 60 }).where(eq(players.id, playerId));

    const started = await as({
      method: 'POST',
      url: apiPath(ROUTES.battle.start),
      payload: {
        mode: 'campaign',
        stageKey: 'c01_s1_normal',
        team: [championId],
        actionId: 'start-progresste-002',
      },
    });
    expect(started.statusCode, started.body).toBe(200);
    const battleId = started.json().data.id as string;

    const resolved = await as({
      method: 'POST',
      url: apiPath(ROUTES.battle.action(battleId)),
      payload: { actionId: `auto-${Math.random().toString(36).slice(2, 12)}`, auto: true },
    });
    expect(resolved.statusCode, resolved.body).toBe(200);
    const view = resolved.json().data;
    expect(view.outcome, 'chapter 1-1 should be winnable by a starter').toBe('victory');
    return view;
  }
});
