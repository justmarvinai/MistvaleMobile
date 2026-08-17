import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { and, eq } from 'drizzle-orm';
import { ROUTES, apiPath, type GoalEvent } from '@mistvale/shared';
import { contentEntries, contentRevisions, playerQuests, players } from '../../db/schema/index';
import { buildSeedContent } from '../../db/seed/seeders';
import * as contentRepo from '../../content/repo';
import { validateAndNormalise, type ContentSet } from '../../content/validate';
import { gameDayFrom } from '../../lib/game-day';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../../test/harness';
import { activeQuests, periodAnchor, questComplete, track } from './progress';

/**
 * The fan-out: what a player did, and what was listening.
 *
 * `track` is the seam the whole retention layer hangs off — quests now, missions and events
 * in the phases after this one — so the things worth pinning are the ones that would be
 * expensive to discover later: that a filter actually narrows, that a claimed quest is
 * finished, that yesterday's instance stays yesterday's, and that two reports landing at
 * once produce two lots of progress rather than one.
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
      note: 'progress fan-out fixture',
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

describe('period anchors', () => {
  // A game-day that starts at 04:00 UTC, which is what the seeded config says.
  const config = { 'ops.dailyResetHour': 4, 'ops.dailyResetTimezone': 'UTC' };

  it('puts the small hours on yesterday, the way every other daily does', () => {
    // 02:00 on the 15th is still the 14th's day: the reset is the boundary, not midnight.
    expect(periodAnchor('daily', config, new Date('2026-03-15T02:00:00Z'))).toBe('2026-03-14');
    expect(periodAnchor('daily', config, new Date('2026-03-15T05:00:00Z'))).toBe('2026-03-15');
  });

  it('names a week by its Monday', () => {
    // The 15th of March 2026 is a Sunday, so it belongs to the week that began on the 9th.
    expect(periodAnchor('weekly', config, new Date('2026-03-15T12:00:00Z'))).toBe('2026-03-09');
    expect(periodAnchor('weekly', config, new Date('2026-03-16T12:00:00Z'))).toBe('2026-03-16');
  });

  it('names a month by its first', () => {
    expect(periodAnchor('monthly', config, new Date('2026-03-15T12:00:00Z'))).toBe('2026-03-01');
    // And follows the game-day across the boundary: 02:00 on the 1st is still last month.
    expect(periodAnchor('monthly', config, new Date('2026-03-01T02:00:00Z'))).toBe('2026-02-01');
  });
});

describe.skipIf(!dbUp)('progress fan-out', () => {
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
        accountName: uniqueAccountName('tracker'),
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

  /** Reports events the way a module would: inside a transaction that did something. */
  const report = (events: readonly GoalEvent[], now?: Date) =>
    app.db.transaction((tx) => track(tx, { content: app.content }, playerId, events, { now }));

  const instances = async () =>
    app.db.select().from(playerQuests).where(eq(playerQuests.playerId, playerId));

  const instance = async (questKey: string) => {
    const [row] = await app.db
      .select()
      .from(playerQuests)
      .where(and(eq(playerQuests.playerId, playerId), eq(playerQuests.questKey, questKey)));
    return row;
  };

  /** Raises the account to a level, so the gated quests come into view. */
  const setLevel = (level: number) =>
    app.db.update(players).set({ level }).where(eq(players.id, playerId));

  describe('advancing', () => {
    it('advances the quest that was waiting for it', async () => {
      await report([{ type: 'battleWin', facts: { mode: 'campaign' } }]);

      const row = await instance('daily_campaign_wins');
      expect(row?.progress).toEqual([1]);
      expect(row?.completedAt).toBeNull();
      expect(row?.claimedAt).toBeNull();
    });

    it('writes nothing at all when no quest is listening', async () => {
      // Nothing in the seeded checklist counts champions obtained; that goal type exists
      // for the missions in P8c. A report with no audience must not leave a row behind.
      await report([{ type: 'championObtained', facts: { rarity: 'legendary' } }]);
      expect(await instances()).toHaveLength(0);
    });

    it('counts the amount rather than the report', async () => {
      // Fifty energy is one report worth fifty, not fifty reports — that is what stops a
      // ten-battle farm run from costing ten round trips to say the same thing.
      await report([{ type: 'useEnergy', amount: 18 }]);
      expect((await instance('daily_energy'))?.progress).toEqual([18]);
    });

    it('narrows by the filters the goal declares', async () => {
      // "Walk the Vale" asks for campaign wins. A Depths floor is a win, and must not count.
      await report([{ type: 'battleWin', facts: { mode: 'depths' } }]);
      expect(await instance('daily_campaign_wins')).toBeUndefined();

      await report([{ type: 'battleWin', facts: { mode: 'campaign' } }]);
      expect((await instance('daily_campaign_wins'))?.progress).toEqual([1]);
    });

    it('advances every listener of one report, across periods', async () => {
      // One campaign win is a daily, a weekly and a monthly. Three quests, one report —
      // the property that keeps the reporting modules ignorant of all three.
      await report([{ type: 'battleWin', facts: { mode: 'campaign' } }]);
      const keys = (await instances()).map((row) => row.questKey).sort();
      expect(keys).toEqual(['daily_campaign_wins', 'monthly_campaign', 'weekly_campaign']);
    });

    it('takes a list of reports as one action', async () => {
      // Winning a campaign boss stage is three things at once, reported together so that no
      // call site can remember two of them and forget the third.
      await report([
        { type: 'battleWin', facts: { mode: 'campaign' } },
        { type: 'stageClear', facts: { mode: 'campaign', stageKey: 'c01_s7_normal' } },
        { type: 'bossKill', facts: { mode: 'campaign' } },
      ]);
      await setLevel(4);
      await report([{ type: 'bossKill', facts: { mode: 'campaign' } }]);

      expect((await instance('daily_campaign_wins'))?.progress).toEqual([1]);
      // The first boss kill arrived below the quest's unlock level, so only the second one
      // counted — which is the gate doing its job rather than a lost report.
      expect((await instance('daily_bosses'))?.progress).toEqual([1]);
    });

    it('caps progress at the target', async () => {
      await report([{ type: 'useEnergy', amount: 5_000 }]);
      // 5_000/50 would be an honest number and a broken progress bar.
      expect((await instance('daily_energy'))?.progress).toEqual([50]);
    });

    it('marks a quest complete once its goal is met, and stamps the moment once', async () => {
      for (let index = 0; index < 7; index += 1) {
        await report([{ type: 'battleWin', facts: { mode: 'campaign' } }]);
      }
      const completed = await instance('daily_campaign_wins');
      expect(completed?.progress).toEqual([7]);
      expect(completed?.completedAt).not.toBeNull();

      // An eighth win must not move the completion timestamp: "when did you finish this"
      // is a fact about the seventh battle.
      await report([{ type: 'battleWin', facts: { mode: 'campaign' } }]);
      const after = await instance('daily_campaign_wins');
      expect(after?.completedAt?.getTime()).toBe(completed?.completedAt?.getTime());
    });
  });

  describe('gates', () => {
    it('holds a quest shut until its unlock level', async () => {
      // The Arena daily opens at account level 8; a fresh account is level 1.
      await report([{ type: 'arenaBattle' }]);
      expect(await instance('daily_arena')).toBeUndefined();

      await setLevel(8);
      await report([{ type: 'arenaBattle' }]);
      expect((await instance('daily_arena'))?.progress).toEqual([1]);
    });

    it('stops advancing a quest that has been claimed', async () => {
      await report([{ type: 'battleWin', facts: { mode: 'campaign' } }]);
      await app.db
        .update(playerQuests)
        .set({ claimedAt: new Date() })
        .where(
          and(
            eq(playerQuests.playerId, playerId),
            eq(playerQuests.questKey, 'daily_campaign_wins'),
          ),
        );

      await report([{ type: 'battleWin', facts: { mode: 'campaign' } }]);
      // Otherwise a player could claim at 1/7 and bank the other six against tomorrow.
      expect((await instance('daily_campaign_wins'))?.progress).toEqual([1]);

      // The other two listeners are not claimed, and must keep moving.
      expect((await instance('weekly_campaign'))?.progress).toEqual([2]);
    });

    it('gives no account a quest it has never heard of', async () => {
      const level1 = activeQuests({ content: app.content }, 1, new Date()).map(
        ({ def }) => def.key,
      );
      const level10 = activeQuests({ content: app.content }, 10, new Date()).map(
        ({ def }) => def.key,
      );
      expect(level1).not.toContain('daily_arena');
      expect(level10).toContain('daily_arena');
      expect(level10.length).toBeGreaterThan(level1.length);
    });
  });

  describe('periods', () => {
    it('opens a fresh instance when the period rolls over, and leaves the old one alone', async () => {
      const monday = new Date('2026-03-16T12:00:00Z');
      const tuesday = new Date('2026-03-17T12:00:00Z');

      await report([{ type: 'battleWin', facts: { mode: 'campaign' } }], monday);
      await report([{ type: 'battleWin', facts: { mode: 'campaign' } }], tuesday);

      const daily = (await instances())
        .filter((row) => row.questKey === 'daily_campaign_wins')
        .sort((a, b) => a.periodAnchor.localeCompare(b.periodAnchor));
      expect(daily.map((row) => [row.periodAnchor, row.progress])).toEqual([
        ['2026-03-16', [1]],
        ['2026-03-17', [1]],
      ]);

      // The week did not turn over between them, so the weekly kept counting — which is the
      // whole reason the anchor lives on the row rather than a `resetAt` column somewhere.
      const weekly = (await instances()).filter((row) => row.questKey === 'weekly_campaign');
      expect(weekly).toHaveLength(1);
      expect(weekly[0]?.progress).toEqual([2]);
    });

    it('keeps last night’s finished quest claimable this morning', async () => {
      // A player who finishes their dailies twenty minutes before the reset and claims
      // twenty minutes after it has finished *yesterday's*, and the row they earned must
      // still be sitting there unclaimed rather than having been rolled away underneath
      // them. The two instants are taken either side of the reset the operator configured,
      // and the first assertion is what stops this quietly becoming a test of nothing if
      // that hour is ever moved.
      const config = app.content.current().bundle.config;
      const lastNight = new Date('2026-03-16T02:50:00Z');
      const thisMorning = new Date('2026-03-16T12:00:00Z');
      const yesterday = gameDayFrom(config, lastNight).date;
      const today = gameDayFrom(config, thisMorning).date;
      expect(yesterday).not.toBe(today);

      await report([{ type: 'useEnergy', amount: 50 }], lastNight);
      await report([{ type: 'useEnergy', amount: 4 }], thisMorning);

      const rows = (await instances())
        .filter((row) => row.questKey === 'daily_energy')
        .sort((a, b) => a.periodAnchor.localeCompare(b.periodAnchor));
      expect(rows.map((row) => [row.periodAnchor, row.progress])).toEqual([
        [yesterday, [50]],
        [today, [4]],
      ]);
      expect(rows[0]?.completedAt).not.toBeNull();
      expect(rows[0]?.claimedAt).toBeNull();
    });
  });

  describe('under contention', () => {
    it('counts both of two reports that land at the same instant', async () => {
      // The read-modify-write in `track` is only safe because it locks the player row
      // first. Without that lock both transactions read 0, both write 1, and one of the
      // two battles the player actually fought is simply gone.
      await Promise.all([
        report([{ type: 'battleWin', facts: { mode: 'campaign' } }]),
        report([{ type: 'battleWin', facts: { mode: 'campaign' } }]),
      ]);

      expect((await instance('daily_campaign_wins'))?.progress).toEqual([2]);
      const rows = (await instances()).filter((row) => row.questKey === 'daily_campaign_wins');
      expect(rows).toHaveLength(1);
    });

    it('survives eight concurrent reports without losing one', async () => {
      await Promise.all(
        Array.from({ length: 8 }, () => report([{ type: 'useEnergy', amount: 3 }])),
      );
      expect((await instance('daily_energy'))?.progress).toEqual([24]);
    });
  });

  describe('completion', () => {
    it('needs every goal, not the first one', () => {
      const def = {
        goals: [
          { type: 'battleWin' as const, target: 3, filters: {} },
          { type: 'summon' as const, target: 2, filters: {} },
        ],
      } as Parameters<typeof questComplete>[0];
      expect(questComplete(def, [3, 1])).toBe(false);
      expect(questComplete(def, [3, 2])).toBe(true);
      // A goal nothing has reported yet reads as zero rather than as absent.
      expect(questComplete(def, [3])).toBe(false);
    });
  });

  describe('reported by the game itself', () => {
    it('advances the campaign daily off a real battle', async () => {
      // The end-to-end claim: nothing in the battle module knows what a quest is, and a
      // fight still moves the checklist.
      const offered = await as({ method: 'GET', url: apiPath(ROUTES.roster.starters) });
      const starters = offered.json().data.starters as { key: string }[];
      const granted = await as({
        method: 'POST',
        url: apiPath(ROUTES.roster.chooseStarter),
        payload: { championKey: starters[0]!.key },
      });
      const championId = (granted.json().data.champions as { id: string }[])[0]!.id;

      const started = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.start),
        payload: { mode: 'campaign', stageKey: 'c01_s1_normal', team: [championId] },
      });
      expect(started.statusCode, started.body).toBe(200);
      const battleId = started.json().data.id as string;

      const finished = await as({
        method: 'POST',
        url: apiPath(ROUTES.battle.action(battleId)),
        payload: { actionId: 'quest-fanout-0001', auto: true },
      });
      expect(finished.statusCode, finished.body).toBe(200);
      const view = finished.json().data;

      // The energy is spent whatever the outcome; the win is only counted on a win.
      const energy = await instance('daily_energy');
      expect(energy?.progress?.[0]).toBeGreaterThan(0);

      if (view.outcome === 'victory') {
        expect((await instance('daily_campaign_wins'))?.progress).toEqual([1]);
        expect((await instance('weekly_campaign'))?.progress).toEqual([1]);
      }
    });
  });
});
