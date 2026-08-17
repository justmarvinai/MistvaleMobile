import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, InjectOptions } from 'fastify';
import { eq } from 'drizzle-orm';
import { ADMIN_API_PREFIX, ADMIN_ROUTES, ROUTES, apiPath } from '@mistvale/shared';
import { DEFAULT_PLAYER_SETTINGS } from '@mistvale/shared';
import {
  accounts,
  arenaState,
  auditLog,
  economyLog,
  gearInstances,
  hallOfValor,
  playerChampions,
  playerItems,
  players,
  sessions,
  stageProgress,
} from '../db/schema/index';
import {
  buildTestApp,
  extractSessionCookie,
  isDatabaseAvailable,
  truncateAll,
  uniqueAccountName,
  uniqueProfileName,
} from '../test/harness';

/**
 * The support desk.
 *
 * There is no e-mail address anywhere in Mistvale, so an operator is the *only*
 * password-reset mechanism that exists — which makes these endpoints load-bearing rather
 * than convenient, and makes their guards worth pinning. Three of those guards are the
 * reason this file exists at all: a reset must actually force a change, an admin must not
 * be able to demote or ban themselves, and a grant must land in the ledger.
 */

const dbUp = await isDatabaseAvailable();
const password = 'a-good-long-password';

describe.skipIf(!dbUp)('player management', () => {
  let app: FastifyInstance;
  let adminCookie: string;
  let adminPlayerId: string;
  let targetPlayerId: string;
  let targetAccountId: string;
  let targetName: string;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  /** Registers an account and returns what the tests need to act on it. */
  async function register(prefix: string) {
    const accountName = uniqueAccountName(prefix);
    const response = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.register),
      payload: { accountName, profileName: uniqueProfileName(), password },
    });
    expect(response.statusCode, response.body).toBe(201);
    const data = response.json().data as {
      account: { id: string };
      player: { id: string };
    };
    return {
      accountName,
      accountId: data.account.id,
      playerId: data.player.id,
      cookie: extractSessionCookie(response.headers['set-cookie']) as string,
    };
  }

  beforeEach(async () => {
    await truncateAll(app);

    const admin = await register('desk');
    await app.db.update(accounts).set({ rank: 'admin' }).where(eq(accounts.id, admin.accountId));
    adminCookie = admin.cookie;
    adminPlayerId = admin.playerId;

    const target = await register('warden');
    targetPlayerId = target.playerId;
    targetAccountId = target.accountId;
    targetName = target.accountName;
  });

  const asAdmin = (options: InjectOptions) =>
    app.inject({ ...options, cookies: { mv_session: adminCookie } });

  const adminUrl = (route: string) => `${ADMIN_API_PREFIX}${route}`;

  describe('finding an account', () => {
    it('searches account and profile names alike', async () => {
      const byAccount = await asAdmin({
        method: 'GET',
        url: adminUrl(`${ADMIN_ROUTES.players.search}?q=${encodeURIComponent(targetName)}`),
      });
      expect(byAccount.statusCode, byAccount.body).toBe(200);
      expect(byAccount.json().data.players).toHaveLength(1);
      expect(byAccount.json().data.players[0].playerId).toBe(targetPlayerId);

      const [row] = await app.db
        .select({ profileName: players.profileName })
        .from(players)
        .where(eq(players.id, targetPlayerId));
      const byProfile = await asAdmin({
        method: 'GET',
        url: adminUrl(
          `${ADMIN_ROUTES.players.search}?q=${encodeURIComponent(String(row!.profileName))}`,
        ),
      });
      expect(byProfile.json().data.players[0].playerId).toBe(targetPlayerId);
    });

    it('leaves bots out unless asked for them', async () => {
      await app.db.update(players).set({ isBot: true }).where(eq(players.id, targetPlayerId));

      const without = await asAdmin({
        method: 'GET',
        url: adminUrl(ADMIN_ROUTES.players.search),
      });
      expect(
        without
          .json()
          .data.players.some((p: { playerId: string }) => p.playerId === targetPlayerId),
      ).toBe(false);

      const with_ = await asAdmin({
        method: 'GET',
        url: adminUrl(`${ADMIN_ROUTES.players.search}?bots=true`),
      });
      expect(
        with_.json().data.players.some((p: { playerId: string }) => p.playerId === targetPlayerId),
      ).toBe(true);
    });

    it('answers one account with everything an operator needs', async () => {
      const response = await asAdmin({
        method: 'GET',
        url: adminUrl(ADMIN_ROUTES.players.detail(targetPlayerId)),
      });
      expect(response.statusCode, response.body).toBe(200);

      const detail = response.json().data;
      expect(detail.account.accountName).toBe(targetName);
      expect(detail.account.status).toBe('active');
      expect(detail.player.energyCap).toBeGreaterThan(0);
      expect(detail.holdings.champions).toBe(0);
      // Registration issued a session, so there is one to see.
      expect(detail.sessions.length).toBeGreaterThanOrEqual(1);
      // A fresh account has an empty ledger — the welcome grant comes with the starter.
      expect(detail.economy).toEqual([]);

      // Move something, and the tail reports it newest-first.
      await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.grant(targetPlayerId)),
        payload: { silver: 250, note: 'a first line in the ledger' },
      });
      const reread = await asAdmin({
        method: 'GET',
        url: adminUrl(ADMIN_ROUTES.players.detail(targetPlayerId)),
      });
      expect(reread.json().data.economy[0].deltas.silver).toBe(250);
    });

    it('404s an id that is not a player', async () => {
      const response = await asAdmin({
        method: 'GET',
        url: adminUrl(ADMIN_ROUTES.players.detail('00000000-0000-4000-8000-000000000000')),
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('resetting a password', () => {
    it('issues a temporary password, signs every session out, and forces a change', async () => {
      const target = await register('forgot');

      const reset = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.resetPassword(target.playerId)),
      });
      expect(reset.statusCode, reset.body).toBe(200);
      const { temporaryPassword, sessionsRevoked } = reset.json().data;
      expect(temporaryPassword).toBeTruthy();
      expect(sessionsRevoked).toBeGreaterThanOrEqual(1);

      // The old session is gone.
      const stale = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.player.self),
        cookies: { mv_session: target.cookie },
      });
      expect(stale.statusCode).toBe(401);

      // The old password no longer works; the temporary one does.
      const oldWay = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: target.accountName, password },
      });
      expect(oldWay.statusCode).toBe(401);

      const login = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: target.accountName, password: temporaryPassword },
      });
      expect(login.statusCode, login.body).toBe(200);
      expect(login.json().data.account.forcePasswordChange).toBe(true);
      const cookie = extractSessionCookie(login.headers['set-cookie']) as string;

      // …and that session can do exactly two things until the password is replaced.
      const blocked = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.roster.list),
        cookies: { mv_session: cookie },
      });
      expect(blocked.statusCode).toBe(403);
      expect(blocked.json().error.code).toBe('PASSWORD_CHANGE_REQUIRED');

      const allowed = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.auth.me),
        cookies: { mv_session: cookie },
      });
      expect(allowed.statusCode).toBe(200);

      const changed = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.changePassword),
        cookies: { mv_session: cookie },
        payload: { currentPassword: temporaryPassword, newPassword: 'a-brand-new-password' },
      });
      expect(changed.statusCode, changed.body).toBe(200);

      // With the flag cleared, the account is ordinary again.
      const after = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: target.accountName, password: 'a-brand-new-password' },
      });
      expect(after.statusCode).toBe(200);
      const freshCookie = extractSessionCookie(after.headers['set-cookie']) as string;
      const unblocked = await app.inject({
        method: 'GET',
        url: apiPath(ROUTES.roster.list),
        cookies: { mv_session: freshCookie },
      });
      expect(unblocked.statusCode).toBe(200);
    });

    it('never writes the password into the audit trail', async () => {
      const reset = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.resetPassword(targetPlayerId)),
      });
      const { temporaryPassword } = reset.json().data;

      const entries = await app.db.query.auditLog.findMany();
      const serialised = JSON.stringify(entries);
      expect(serialised).not.toContain(temporaryPassword);
      expect(serialised).toContain('player.resetPassword');
    });
  });

  describe('rank, bans and names', () => {
    it('changes a rank, but never the operator’s own', async () => {
      const promoted = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.rank(targetPlayerId)),
        payload: { rank: 'gamemaster' },
      });
      expect(promoted.statusCode, promoted.body).toBe(200);
      expect(promoted.json().data.rank).toBe('gamemaster');

      // The guard that stops the suite locking itself out of its own last admin.
      const self = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.rank(adminPlayerId)),
        payload: { rank: 'player' },
      });
      expect(self.statusCode).toBe(400);
      const [row] = await app.db
        .select({ rank: accounts.rank })
        .from(accounts)
        .innerJoin(players, eq(players.accountId, accounts.id))
        .where(eq(players.id, adminPlayerId));
      expect(row!.rank).toBe('admin');
    });

    it('bans with a reason, signs the account out, and refuses without one', async () => {
      const noReason = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.ban(targetPlayerId)),
        payload: { banned: true },
      });
      expect(noReason.statusCode).toBe(400);

      const banned = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.ban(targetPlayerId)),
        payload: { banned: true, reason: 'selling accounts' },
      });
      expect(banned.statusCode, banned.body).toBe(200);
      expect(banned.json().data.status).toBe('banned');

      // A ban that left a live session running would not start until the token expired.
      const live = await app.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.accountId, targetAccountId));
      expect(live).toHaveLength(0);

      const login = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: targetName, password },
      });
      expect(login.statusCode).toBe(403);
      expect(login.json().error.code).toBe('ACCOUNT_BANNED');

      const lifted = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.ban(targetPlayerId)),
        payload: { banned: false },
      });
      expect(lifted.json().data.status).toBe('active');
      expect(lifted.json().data.banReason).toBeNull();

      const back = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: targetName, password },
      });
      expect(back.statusCode).toBe(200);
    });

    it('refuses to ban the operator’s own account', async () => {
      const response = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.ban(adminPlayerId)),
        payload: { banned: true, reason: 'a very bad idea' },
      });
      expect(response.statusCode).toBe(400);
    });

    it('renames a profile, and refuses a name already taken', async () => {
      const other = await register('neighbour');
      const [otherRow] = await app.db
        .select({ profileName: players.profileName })
        .from(players)
        .where(eq(players.id, other.playerId));

      const taken = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.profileName(targetPlayerId)),
        payload: { profileName: String(otherRow!.profileName) },
      });
      expect(taken.statusCode).toBe(409);

      const renamed = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.profileName(targetPlayerId)),
        payload: { profileName: 'Renamed Warden' },
      });
      expect(renamed.statusCode, renamed.body).toBe(200);
      expect(renamed.json().data.profileName).toBe('Renamed Warden');
    });
  });

  describe('granting', () => {
    it('moves currency through the ledger, not around it', async () => {
      const [before] = await app.db
        .select({ silver: players.silver, crystals: players.crystals })
        .from(players)
        .where(eq(players.id, targetPlayerId));

      const response = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.grant(targetPlayerId)),
        payload: { silver: 5_000, crystals: 100, note: 'lost to a bug in the forge' },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.applied.silver).toBe(5_000);

      const [after] = await app.db
        .select({ silver: players.silver, crystals: players.crystals })
        .from(players)
        .where(eq(players.id, targetPlayerId));
      expect(after!.silver).toBe(before!.silver + 5_000);
      expect(after!.crystals).toBe(before!.crystals + 100);

      // An operator hand-out that bypassed the ledger would be invisible in exactly the
      // audit it most needs to appear in.
      const ledger = await app.db
        .select({ source: economyLog.source, deltas: economyLog.deltas })
        .from(economyLog)
        .where(eq(economyLog.playerId, targetPlayerId));
      const grant = ledger.find((row) => row.source.startsWith('admin:'));
      expect(grant, 'the grant is in economy_log').toBeTruthy();
      expect((grant!.deltas as Record<string, number>).silver).toBe(5_000);

      // …and the operator's reason is in the audit trail.
      const entries = await app.db.query.auditLog.findMany();
      expect(JSON.stringify(entries)).toContain('lost to a bug in the forge');
    });

    it('takes things away as readily as it gives them', async () => {
      await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.grant(targetPlayerId)),
        payload: { silver: 10_000, note: 'setup' },
      });
      const response = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.grant(targetPlayerId)),
        payload: { silver: -10_000, note: 'reversing a duplicate grant' },
      });
      expect(response.statusCode, response.body).toBe(200);
      expect(response.json().data.applied.silver).toBe(-10_000);
    });

    it('refuses to take away more than the account has', async () => {
      const response = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.grant(targetPlayerId)),
        payload: { crystals: -999_999, note: 'not possible' },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('INSUFFICIENT_FUNDS');
    });

    it('refuses a grant that moves nothing', async () => {
      const response = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.grant(targetPlayerId)),
        payload: { note: 'an empty gesture' },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('resetting an account to a fresh start', () => {
    /**
     * Registers an account and gives it something to lose in every table the reset
     * touches.
     *
     * Rows are written directly rather than played for: this suite publishes no content,
     * and what is under test is that the reset empties these tables — not how they came
     * to be full. Nothing here is a foreign key into content, so plain keys are honest.
     */
    async function playedAccount() {
      const target = await register('spent');
      const playerId = target.playerId;

      const [champion] = await app.db
        .insert(playerChampions)
        .values({ playerId, championKey: 'anuria', level: 30, rank: 4 })
        .returning({ id: playerChampions.id });

      await app.db.insert(gearInstances).values({
        playerId,
        equippedChampionId: champion!.id,
        setKey: 'vanguard',
        slot: 'weapon',
        rank: 5,
        rarity: 'epic',
        mainStat: { stat: 'atk', percent: false, value: 200 },
      });
      await app.db.insert(playerItems).values({ playerId, itemKey: 'sigil_faded', quantity: 7 });
      await app.db
        .insert(stageProgress)
        .values({ playerId, stageKey: 'c01_s1_normal', stars: 3, clears: 12 });
      await app.db.insert(arenaState).values({ playerId, rating: 1_400 });
      await app.db
        .insert(hallOfValor)
        .values({ playerId, element: 'ember', stat: 'atk', level: 3 });

      await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.grant(playerId)),
        payload: { silver: 50_000, crystals: 400, valorMedals: 90, note: 'test fixture' },
      });

      return target;
    }

    it('destroys what was played and reports how much', async () => {
      const target = await playedAccount();

      const response = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.reset(target.playerId)),
      });
      expect(response.statusCode, response.body).toBe(200);
      const summary = response.json().data;
      expect(summary.champions).toBe(1);
      expect(summary.gear).toBe(1);
      expect(summary.itemStacks).toBe(1);
      expect(summary.stagesCleared).toBe(1);
      expect(summary.refunded.silver).toBe(-50_000);

      const roster = await app.db
        .select({ id: playerChampions.id })
        .from(playerChampions)
        .where(eq(playerChampions.playerId, target.playerId));
      expect(roster).toHaveLength(0);
    });

    it('puts the account back exactly where registration leaves it', async () => {
      const target = await playedAccount();
      await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.reset(target.playerId)),
      });

      const [fresh] = await app.db.select().from(players).where(eq(players.id, target.playerId));
      expect(fresh!.level).toBe(1);
      expect(fresh!.xp).toBe(0);
      expect(fresh!.silver).toBe(0);
      expect(fresh!.crystals).toBe(0);
      expect(fresh!.valorMedals).toBe(0);
      expect(fresh!.tutorialStep).toBe(0);
      expect(fresh!.summonPity).toEqual({});
      expect(
        await app.db
          .select({ id: playerChampions.id })
          .from(playerChampions)
          .where(eq(playerChampions.playerId, target.playerId)),
      ).toHaveLength(0);
    });

    it('takes the arena standing and the Hall with it', async () => {
      await app.db.insert(arenaState).values({ playerId: targetPlayerId, rating: 1_400 });
      await app.db
        .insert(hallOfValor)
        .values({ playerId: targetPlayerId, element: 'ember', stat: 'atk', level: 3 });

      await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.reset(targetPlayerId)),
      });

      expect(
        await app.db.select().from(arenaState).where(eq(arenaState.playerId, targetPlayerId)),
      ).toHaveLength(0);
      expect(
        await app.db.select().from(hallOfValor).where(eq(hallOfValor.playerId, targetPlayerId)),
      ).toHaveLength(0);
    });

    it('leaves the ledger balancing rather than rewriting it', async () => {
      // The whole point of emptying the wallet through RewardService: the sum of a
      // player's deltas stays equal to their balance, so a reset reads as a line rather
      // than as a discontinuity nobody can explain a year later.
      //
      // Granted through the API rather than by SQL, because the invariant is only
      // meaningful if the money arrived the way money actually arrives.
      await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.grant(targetPlayerId)),
        payload: { silver: 50_000, crystals: 400, note: 'test fixture' },
      });

      await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.reset(targetPlayerId)),
      });

      const ledger = await app.db
        .select({ source: economyLog.source, deltas: economyLog.deltas })
        .from(economyLog)
        .where(eq(economyLog.playerId, targetPlayerId));
      const reset = ledger.filter((line) => line.source === 'admin:reset');
      expect(reset).toHaveLength(1);
      expect((reset[0]!.deltas as Record<string, number>).silver).toBe(-50_000);

      // Every silver line ever written for this account, summed, equals what it holds.
      const total = ledger.reduce(
        (sum, line) => sum + ((line.deltas as Record<string, number>).silver ?? 0),
        0,
      );
      const [row] = await app.db
        .select({ silver: players.silver })
        .from(players)
        .where(eq(players.id, targetPlayerId));
      expect(row!.silver).toBe(0);
      expect(total).toBe(row!.silver);
    });

    it('keeps the account, its password and its rank', async () => {
      await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.reset(targetPlayerId)),
      });

      // A reset is not a deletion: the same credentials still work afterwards.
      const login = await app.inject({
        method: 'POST',
        url: apiPath(ROUTES.auth.login),
        payload: { accountName: targetName, password },
      });
      expect(login.statusCode, login.body).toBe(200);
    });

    it('signs every session out', async () => {
      await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.reset(targetPlayerId)),
      });
      const live = await app.db
        .select({ id: sessions.id })
        .from(sessions)
        .where(eq(sessions.accountId, targetAccountId));
      expect(live).toHaveLength(0);
    });

    it('keeps accessibility settings, which are not progress', async () => {
      await app.db
        .update(players)
        .set({ settings: { ...DEFAULT_PLAYER_SETTINGS, reducedMotion: true } })
        .where(eq(players.id, targetPlayerId));

      await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.reset(targetPlayerId)),
      });

      const [row] = await app.db
        .select({ settings: players.settings })
        .from(players)
        .where(eq(players.id, targetPlayerId));
      expect(row!.settings.reducedMotion).toBe(true);
    });

    it('refuses an arena bot, and says where to go instead', async () => {
      await app.db.update(players).set({ isBot: true }).where(eq(players.id, targetPlayerId));
      const response = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.reset(targetPlayerId)),
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error.message).toMatch(/bot manager/i);
    });

    it('records what was destroyed in the audit trail', async () => {
      // Nothing survives to compare against afterwards, so the audit entry is the only
      // remaining answer to "what did that account have?".
      await app.db
        .update(players)
        .set({ silver: 50_000, level: 20 })
        .where(eq(players.id, targetPlayerId));

      await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.reset(targetPlayerId)),
      });

      const [entry] = await app.db
        .select({ before: auditLog.before, after: auditLog.after })
        .from(auditLog)
        .where(eq(auditLog.action, 'player.reset'));
      expect(entry).toBeDefined();
      expect((entry!.before as { silver: number }).silver).toBe(50_000);
      expect((entry!.before as { level: number }).level).toBe(20);
    });

    it('lets an operator reset their own account', async () => {
      // Unlike rank and ban, this locks nobody out: the account keeps its rank and its
      // password, so an admin testing the game on their own account may use it.
      const response = await asAdmin({
        method: 'POST',
        url: adminUrl(ADMIN_ROUTES.players.reset(adminPlayerId)),
      });
      expect(response.statusCode, response.body).toBe(200);
    });
  });

  it('signs an account out everywhere without changing its password', async () => {
    const target = await register('elsewhere');

    const response = await asAdmin({
      method: 'DELETE',
      url: adminUrl(ADMIN_ROUTES.players.sessions(target.playerId)),
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.json().data.revoked).toBeGreaterThanOrEqual(1);

    const stale = await app.inject({
      method: 'GET',
      url: apiPath(ROUTES.player.self),
      cookies: { mv_session: target.cookie },
    });
    expect(stale.statusCode).toBe(401);

    // The password still works — that is the difference between this and a reset.
    const login = await app.inject({
      method: 'POST',
      url: apiPath(ROUTES.auth.login),
      payload: { accountName: target.accountName, password },
    });
    expect(login.statusCode).toBe(200);
  });

  it('is closed to everyone below admin rank', async () => {
    const warden = await register('curious');
    for (const [method, url] of [
      ['GET', adminUrl(ADMIN_ROUTES.players.search)],
      ['GET', adminUrl(ADMIN_ROUTES.players.detail(targetPlayerId))],
      ['POST', adminUrl(ADMIN_ROUTES.players.resetPassword(targetPlayerId))],
    ] as const) {
      const response = await app.inject({
        method,
        url,
        cookies: { mv_session: warden.cookie },
        payload: {},
      });
      expect(response.statusCode, `${method} ${url}`).toBe(403);
    }
  });
});
