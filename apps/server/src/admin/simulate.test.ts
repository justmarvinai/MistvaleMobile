import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import {
  ADMIN_API_PREFIX,
  ADMIN_ROUTES,
  CONTENT_REGISTRY,
  ROUTES,
  SIMULATE_MAX_RUNS,
  apiPath,
} from '@mistvale/shared';
import { accounts, auditLog, contentEntries } from '../db/schema/index';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  seedLiveContent,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../test/harness';

/**
 * The balance sandbox.
 *
 * What is worth pinning here is not the arithmetic — `@mistvale/sim` is pure and the CI
 * gates exercise it on every stage in the game — but the four things that are only true
 * once it is an *endpoint*: it is admin-only, it reads the drafts an operator is actually
 * editing, it refuses a stage that is not there, and it writes nothing at all.
 *
 * The last one is the one that would be quietly wrong for a long time. A sandbox that
 * touched a player, a roster or the live content cache would be indistinguishable from a
 * working one until the day somebody noticed their account had changed.
 */

const dbUp = await isDatabaseAvailable();
const password = 'a-good-long-password';
const STAGE = 'c01_s1_normal';

describe.skipIf(!dbUp)('the balance sandbox', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let playerCookie: string;

  beforeAll(async () => {
    app = await buildTestApp();
    // The suites share one database and each replaces the content it finds, so a sandbox
    // test cannot assume whatever ran before it left a campaign behind.
    await seedLiveContent(app);
  });

  afterAll(async () => {
    await app?.close();
  });

  async function register(prefix: string) {
    const response = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: {
        accountName: uniqueAccountName(prefix),
        profileName: uniqueProfileName(),
        password,
      },
    });
    expect(response.statusCode, response.body).toBe(201);
    return {
      accountId: (response.json().data as { account: { id: string } }).account.id,
      cookie: extractSessionCookie(response.headers['set-cookie']) as string,
    };
  }

  beforeEach(async () => {
    await truncateAll(app);
    // Drafts are content rather than player rows, so `truncateAll` leaves them: a test that
    // wrote one has to take it away itself or the next test simulates somebody else's edit.
    await app.db.delete(contentEntries).where(eq(contentEntries.state, 'draft'));

    const admin = await register('sandbox');
    await app.db.update(accounts).set({ rank: 'admin' }).where(eq(accounts.id, admin.accountId));
    adminCookie = admin.cookie;
    playerCookie = (await register('warden')).cookie;
  });

  const url = `${ADMIN_API_PREFIX}${ADMIN_ROUTES.simulate.stage}`;
  const asAdmin = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: adminCookie } });

  it('fights a stage and reports how it went', async () => {
    const response = await asAdmin({
      method: 'POST',
      url,
      payload: { stageKey: STAGE, tier: 'modest', runs: 5 },
    });
    expect(response.statusCode, response.body).toBe(200);

    const { result } = response.json().data as {
      result: {
        stageKey: string;
        stageLabel: string;
        runs: number;
        wins: number;
        winRate: number;
        averageTurns: number | null;
        starTurnLimit: number | null;
        winsWithinStarLimit: number | null;
        team: { championKey: string; name: string; level: number }[];
      };
    };

    expect(result.stageKey).toBe(STAGE);
    // Named the way an operator says it, not the way the database stores it.
    expect(result.stageLabel).not.toBe(STAGE);
    expect(result.runs).toBe(5);
    expect(result.wins).toBeGreaterThan(0);
    expect(result.winRate).toBeCloseTo(result.wins / 5, 6);
    expect(result.averageTurns).toBeGreaterThan(0);
    // A number is never reported without the team that produced it.
    expect(result.team).toHaveLength(4);
    expect(result.team[0]!.name).not.toBe(result.team[0]!.championKey);
    expect(result.team.every((member) => member.level === 50)).toBe(true);
    // Chapter one sets a three-star turn limit, and the share under it is the figure an
    // operator is usually really asking about.
    expect(result.starTurnLimit).toBeGreaterThan(0);
    expect(result.winsWithinStarLimit).not.toBeNull();
  });

  it('reads the drafts, so a retune can be checked before it is published', async () => {
    const before = await asAdmin({
      method: 'POST',
      url,
      payload: { stageKey: STAGE, tier: 'fresh', runs: 6 },
    });
    expect(before.statusCode, before.body).toBe(200);
    expect(before.json().data.result.wins).toBeGreaterThan(0);

    // The same stage, drafted into something nobody clears: one wave of the toughest enemy
    // published, at the top of its level band. Nothing is published — the point is that the
    // sandbox can see an edit the game cannot.
    const live = await app.content.current().bundle;
    const stage = live.stages.find((entry) => entry.key === STAGE);
    const wall = [...live.enemies].sort((a, b) => b.baseStats.hp - a.baseStats.hp)[0];
    expect(stage && wall).toBeTruthy();

    const draft = await asAdmin({
      method: 'PUT',
      // The URL segment is the registry's `path` rather than the content type — asked for
      // by name here so a rename cannot leave this test hitting a route that is gone.
      url: `${ADMIN_API_PREFIX}${ADMIN_ROUTES.content.item(CONTENT_REGISTRY.stage.path, STAGE)}`,
      payload: {
        data: {
          ...stage,
          waves: [[{ enemyKey: wall!.key, level: 60, stars: 6, slot: 0 }]],
        },
      },
    });
    expect(draft.statusCode, draft.body).toBe(200);

    const drafted = await asAdmin({
      method: 'POST',
      url,
      payload: { stageKey: STAGE, source: 'draft', tier: 'fresh', runs: 6 },
    });
    expect(drafted.statusCode, drafted.body).toBe(200);
    expect(drafted.json().data.result.wins).toBe(0);

    // And the live content is untouched by any of it: reading a draft must not publish one.
    const after = await asAdmin({
      method: 'POST',
      url,
      payload: { stageKey: STAGE, source: 'live', tier: 'fresh', runs: 6 },
    });
    expect(after.json().data.result.wins).toBeGreaterThan(0);
  });

  it('refuses a stage that is not there', async () => {
    const response = await asAdmin({
      method: 'POST',
      url,
      payload: { stageKey: 'no_such_stage', runs: 2 },
    });
    expect(response.statusCode).toBe(404);
  });

  it('refuses more runs than the box will spend on one press', async () => {
    const response = await asAdmin({
      method: 'POST',
      url,
      payload: { stageKey: STAGE, runs: SIMULATE_MAX_RUNS + 1 },
    });
    expect(response.statusCode).toBe(400);
  });

  it('is admin-only, and anonymous callers get nothing', async () => {
    const asPlayer = await app.inject({
      method: 'POST',
      url,
      payload: { stageKey: STAGE, runs: 2 },
      cookies: { mv_session: playerCookie },
    });
    expect(asPlayer.statusCode).toBe(403);

    const anonymous = await app.inject({ method: 'POST', url, payload: { stageKey: STAGE } });
    expect(anonymous.statusCode).toBe(401);
  });

  it('writes nothing — not an audit row, not a content row', async () => {
    const contentBefore = await app.db.select({ key: contentEntries.key }).from(contentEntries);

    const response = await asAdmin({
      method: 'POST',
      url,
      payload: { stageKey: STAGE, runs: 3 },
    });
    expect(response.statusCode, response.body).toBe(200);

    // The audit log is the record of what an operator *changed*; a simulation changes
    // nothing, and filling it with "somebody pressed Simulate" would bury what matters.
    expect(await app.db.select({ id: auditLog.id }).from(auditLog)).toHaveLength(0);
    expect(await app.db.select({ key: contentEntries.key }).from(contentEntries)).toHaveLength(
      contentBefore.length,
    );
  });
});
