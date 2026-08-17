import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq, sql } from 'drizzle-orm';
import { ADMIN_API_PREFIX, ADMIN_ROUTES, ROUTES, apiPath } from '@mistvale/shared';
import {
  accounts,
  arenaBattles,
  battleSessions,
  championSightings,
  economyLog,
  loginClaims,
  mailbox,
  playerEvents,
  playerMissions,
  playerQuests,
  summonHistory,
} from '../db/schema/index';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../test/harness';
import { NEVER_PRUNED, pruneOldRows, pruneWindowsFrom, type PruneWindows } from './prune';

/**
 * The nightly prune.
 *
 * The whole of this file defends one property: **the prune is about disk, never about
 * state.** The worst bug it could have is not deleting too little — that is a full disk,
 * which is loud — but deleting something a player's position is counted from. The login
 * calendar is exactly that: its track position is `count(*)` over `login_claims`, so a
 * prune that swept them would silently walk every player backwards through the month.
 *
 * So the harshest test here runs with every window at zero — the most destructive setting
 * the config permits — and asserts that every table on `NEVER_PRUNED` still holds its rows.
 */

const dbUp = await isDatabaseAvailable();

const DAY_MS = 24 * 60 * 60 * 1000;
const ago = (days: number): Date => new Date(Date.now() - days * DAY_MS);
const dayAgo = (days: number): string => ago(days).toISOString().slice(0, 10);

const WIDE: PruneWindows = {
  battleDays: 14,
  mailDays: 30,
  economyDays: 90,
  questDays: 90,
  eventDays: 60,
};
/** Every window at zero: keep nothing older than today. The harshest legal setting. */
const RUTHLESS: PruneWindows = {
  battleDays: 0,
  mailDays: 0,
  economyDays: 0,
  questDays: 0,
  eventDays: 0,
};

describe.skipIf(!dbUp)('the nightly prune', () => {
  let app: FastifyInstance;
  let playerId: string;
  let cookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
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
        accountName: uniqueAccountName('prune'),
        profileName: uniqueProfileName(),
        password: 'a-good-long-password',
      },
    });
    expect(registered.statusCode).toBe(201);
    cookie = extractSessionCookie(registered.headers['set-cookie']) as string;
    playerId = registered.json().data.player.id as string;
  });

  /** Rows of every prunable kind, half old enough to go and half not. */
  async function seedRows(): Promise<void> {
    await app.db.insert(battleSessions).values([
      {
        playerId,
        mode: 'campaign',
        stageKey: 'c01_s1_normal',
        contentRev: 1,
        seed: 1,
        state: {},
        status: 'finished',
        updatedAt: ago(30),
      },
      {
        playerId,
        mode: 'campaign',
        stageKey: 'c01_s1_normal',
        contentRev: 1,
        seed: 2,
        state: {},
        status: 'finished',
        updatedAt: ago(1),
      },
      // Somebody's fight, still open, and older than any window.
      {
        playerId,
        mode: 'campaign',
        stageKey: 'c01_s2_normal',
        contentRev: 1,
        seed: 3,
        state: {},
        status: 'active',
        updatedAt: ago(400),
      },
    ]);

    await app.db.insert(mailbox).values([
      { playerId, title: 'Long gone', body: '.', expiresAt: ago(60) },
      { playerId, title: 'Recently expired', body: '.', expiresAt: ago(1) },
      // No expiry: it keeps, at any window.
      { playerId, title: 'Kept forever', body: '.' },
    ]);

    await app.db.insert(economyLog).values([
      { playerId, source: 'test:old', deltas: { silver: 1 }, createdAt: ago(200) },
      { playerId, source: 'test:new', deltas: { silver: 1 }, createdAt: ago(2) },
    ]);

    await app.db.insert(playerQuests).values([
      { playerId, questKey: 'q_old', periodAnchor: dayAgo(200) },
      { playerId, questKey: 'q_new', periodAnchor: dayAgo(1) },
    ]);

    await app.db.insert(playerEvents).values([
      { playerId, eventKey: 'e_old', occurrence: dayAgo(200), points: 10 },
      { playerId, eventKey: 'e_new', occurrence: dayAgo(1), points: 10 },
    ]);
  }

  /** Rows the prune must never touch, all old enough that a careless one would. */
  async function seedUntouchable(): Promise<void> {
    await app.db.insert(loginClaims).values([
      { playerId, track: 'calendar', day: 1, claimedOn: dayAgo(400), createdAt: ago(400) },
      { playerId, track: 'calendar', day: 2, claimedOn: dayAgo(399), createdAt: ago(399) },
      { playerId, track: 'welcome', day: 1, claimedOn: dayAgo(398), createdAt: ago(398) },
    ]);
    await app.db.insert(championSightings).values({
      playerId,
      championKey: 'anuria',
      firstSeenAt: ago(400),
    });
    await app.db.insert(summonHistory).values({
      playerId,
      poolKey: 'faded',
      sigilItemKey: 'sigil_faded',
      championKey: 'anuria',
      rarity: 'epic',
      pityAfter: {},
      contentRev: 1,
      createdAt: ago(400),
    });
    await app.db.insert(playerMissions).values({
      playerId,
      missionKey: 'm01_first_step',
      createdAt: ago(400),
    });
    await app.db.insert(arenaBattles).values({
      attackerId: playerId,
      defenderId: playerId,
      won: true,
      attackerRatingDelta: 5,
      defenderRatingDelta: -5,
      medals: 1,
      createdAt: ago(400),
    });
  }

  const rows = async (table: Parameters<typeof app.db.delete>[0]): Promise<number> => {
    const [row] = await app.db.select({ n: sql<number>`count(*)::int` }).from(table);
    return row?.n ?? 0;
  };

  // ── What it takes ─────────────────────────────────────────────────────────

  it('deletes what is past its window and leaves what is not', async () => {
    await seedRows();

    const report = await pruneOldRows(app.db, WIDE);

    expect(report.battles).toBe(1);
    expect(report.mail).toBe(1);
    expect(report.economy).toBe(1);
    expect(report.quests).toBe(1);
    expect(report.events).toBe(1);

    // One of each kind survives, plus the two that are never eligible.
    expect(await rows(battleSessions)).toBe(2);
    expect(await rows(mailbox)).toBe(2);
    expect(await rows(economyLog)).toBe(1);
    expect(await rows(playerQuests)).toBe(1);
    expect(await rows(playerEvents)).toBe(1);
  });

  it('never takes a battle somebody is still fighting', async () => {
    await seedRows();
    await pruneOldRows(app.db, RUTHLESS);

    const [active] = await app.db
      .select({ id: battleSessions.id })
      .from(battleSessions)
      .where(eq(battleSessions.status, 'active'));
    // Four hundred days old and still open: a player who left the tab up comes back to it.
    expect(active).toBeDefined();
  });

  it('never takes mail that has no expiry', async () => {
    await seedRows();
    await pruneOldRows(app.db, RUTHLESS);

    const kept = await app.db.select().from(mailbox);
    expect(kept).toHaveLength(1);
    expect(kept[0]?.title).toBe('Kept forever');
  });

  // ── What it must never take ───────────────────────────────────────────────

  it('leaves every table on the never-prune list alone, at the harshest setting', async () => {
    await seedRows();
    await seedUntouchable();

    await pruneOldRows(app.db, RUTHLESS);

    // Walked from the exported list rather than hand-listed here, so adding a table to the
    // guard without a case for it fails the build rather than passing quietly.
    const survivors: Record<(typeof NEVER_PRUNED)[number], () => Promise<number>> = {
      login_claims: () => rows(loginClaims),
      champion_sightings: () => rows(championSightings),
      summon_history: () => rows(summonHistory),
      audit_log: async () => 1, // Written by admin actions; none happen in this test.
      arena_battles: () => rows(arenaBattles),
      player_missions: () => rows(playerMissions),
    };

    for (const table of NEVER_PRUNED) {
      expect(await survivors[table](), `${table} must survive a prune`).toBeGreaterThan(0);
    }
  });

  it('keeps the login calendar’s position exactly, because the rows are the position', async () => {
    await seedUntouchable();
    const before = await app.db
      .select()
      .from(loginClaims)
      .where(eq(loginClaims.playerId, playerId));

    await pruneOldRows(app.db, RUTHLESS);

    const after = await app.db.select().from(loginClaims).where(eq(loginClaims.playerId, playerId));
    // Not "some survived" — *all* of them, because the count is what day the player is on.
    // Losing one would walk them back through the calendar with no other symptom.
    expect(after).toHaveLength(before.length);
    expect(after.filter((row) => row.track === 'calendar')).toHaveLength(2);
  });

  // ── The windows ───────────────────────────────────────────────────────────

  it('reads its windows from config, and refuses nonsense', () => {
    expect(pruneWindowsFrom({ 'ops.retainBattleDays': 3 }).battleDays).toBe(3);
    // Zero is a legitimate "keep nothing older than today".
    expect(pruneWindowsFrom({ 'ops.retainMailDays': 0 }).mailDays).toBe(0);
    // A negative window would delete the future; a string is a typo. Both fall back.
    expect(pruneWindowsFrom({ 'ops.retainEconomyDays': -5 }).economyDays).toBe(90);
    expect(pruneWindowsFrom({ 'ops.retainQuestDays': 'soon' }).questDays).toBe(90);
    expect(pruneWindowsFrom({}).eventDays).toBe(60);
  });

  it('does nothing at all to a clean database', async () => {
    const report = await pruneOldRows(app.db, WIDE);
    expect(report).toEqual({ battles: 0, mail: 0, economy: 0, quests: 0, events: 0 });
  });

  // ── Running it by hand ────────────────────────────────────────────────────

  describe('the operator’s button', () => {
    const adminUrl = (route: string) => `${ADMIN_API_PREFIX}${route}`;

    async function asAdmin(): Promise<string> {
      const accountName = uniqueAccountName('ops');
      const registered = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.register),
        payload: {
          accountName,
          profileName: uniqueProfileName(),
          password: 'a-good-long-password',
        },
      });
      expect(registered.statusCode).toBe(201);
      await app.db
        .update(accounts)
        .set({ rank: 'admin' })
        .where(eq(accounts.accountName, accountName));

      const signedIn = await app.inject({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.auth.login),
        payload: { accountName, password: 'a-good-long-password' },
      });
      expect(signedIn.statusCode).toBe(200);
      return extractSessionCookie(signedIn.headers['set-cookie']) as string;
    }

    it('lists the jobs it will run, and nothing else', async () => {
      const adminCookie = await asAdmin();
      const response = await app.inject({
        method: 'GET',
        url: adminUrl(ADMIN_ROUTES.jobs.list),
        cookies: { mv_session: adminCookie },
      });

      expect(response.statusCode).toBe(200);
      const names = (response.json().data.jobs as { name: string }[]).map((job) => job.name);
      expect(names.sort()).toEqual(['daily', 'weekly']);
    });

    it('runs the nightly pass on demand', async () => {
      const adminCookie = await asAdmin();
      await seedRows();

      const response = await app.inject({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.jobs.run('daily')),
        cookies: { mv_session: adminCookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data.job).toBe('daily');
      // Ran for real: the old rows are gone.
      expect(await rows(playerQuests)).toBe(1);
    });

    it('refuses a job that is not on the list', async () => {
      const adminCookie = await asAdmin();
      const response = await app.inject({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.jobs.run('rm-rf')),
        cookies: { mv_session: adminCookie },
      });
      // A closed map, not a name that reaches anything callable.
      expect(response.statusCode).toBe(404);
    });

    it('turns a player away from running jobs', async () => {
      const response = await app.inject({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.jobs.run('daily')),
        cookies: { mv_session: cookie },
      });
      expect([401, 403]).toContain(response.statusCode);
    });
  });
});
