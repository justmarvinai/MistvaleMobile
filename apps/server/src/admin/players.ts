import { randomBytes } from 'node:crypto';
import { and, count, desc, eq, ilike, or, sql } from 'drizzle-orm';
import {
  TEMP_PASSWORD_BYTES,
  type AdminGrantRequest,
  type AdminPlayerDetail,
  type AdminPlayerSearch,
} from '@mistvale/shared';
import {
  accounts,
  arenaBattles,
  arenaState,
  battleSessions,
  championSightings,
  chapterRewards,
  economyLog,
  gearInstances,
  hallOfValor,
  playerChampions,
  playerItems,
  players,
  sessions,
  shopStates,
  stageProgress,
  summonHistory,
} from '../db/schema/index';
import type { Database } from '../db/client';
import { AppError } from '../lib/errors';
import { hashPassword } from '../lib/password';
import { computeEnergy, energyCapForLevel } from '../lib/progression';
import type { ContentCache } from '../content/cache';
import * as rewards from '../modules/rewards/service';

/**
 * The support desk, server-side.
 *
 * Mistvale has no e-mail addresses anywhere — a deliberate simplification with one
 * binding consequence: **an operator is the only password-reset mechanism that exists**
 * (CLAUDE.md hard rules). Everything here is the machinery behind that promise, plus the
 * neighbouring things an operator needs in the same breath: see what an account actually
 * has, unban someone banned by mistake, rename a profile, hand back what a bug ate.
 *
 * Two rules refuse the caller's own account, and they are not symmetry for its own sake:
 * an admin who can demote themselves can lock the suite out of its own last admin, and an
 * admin who can ban themselves can lock everyone out at once. Recovery from either is a
 * shell on the VPS, which is exactly the situation the suite exists to avoid.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface PlayerAdminContext {
  db: Database;
  content: ContentCache;
}

/** Resolved once per action: the player, the account behind it, and nothing else. */
interface Subject {
  playerId: string;
  accountId: string;
  accountName: string;
  profileName: string;
  rank: (typeof accounts.$inferSelect)['rank'];
  status: (typeof accounts.$inferSelect)['status'];
  banReason: string | null;
  level: number;
  isBot: boolean;
}

async function requireSubject(db: Executor, playerId: string): Promise<Subject> {
  const [row] = await db
    .select({
      playerId: players.id,
      accountId: accounts.id,
      accountName: accounts.accountName,
      profileName: players.profileName,
      rank: accounts.rank,
      status: accounts.status,
      banReason: accounts.banReason,
      level: players.level,
      isBot: players.isBot,
    })
    .from(players)
    .innerJoin(accounts, eq(accounts.id, players.accountId))
    .where(eq(players.id, playerId));

  if (!row) throw AppError.notFound('No such player.');
  return row;
}

/** Refuses an action aimed at the operator performing it. */
function refuseSelf(subject: Subject, callerAccountId: string, what: string): void {
  if (subject.accountId === callerAccountId) {
    throw new AppError('VALIDATION', `You cannot ${what} your own account.`);
  }
}

// ── Reading ─────────────────────────────────────────────────────────────────

/**
 * Finds accounts by either name.
 *
 * An operator has whichever name the warden gave them — the one they log in with or the
 * one on their profile — and rarely knows which is which, so both are searched.
 */
export async function search(
  db: Database,
  options: { query: string; limit: number; offset: number; includeBots: boolean },
): Promise<AdminPlayerSearch> {
  const term = options.query.trim();
  const filters = [
    term.length > 0
      ? or(
          ilike(sql`${accounts.accountName}::text`, `%${term}%`),
          ilike(sql`${players.profileName}::text`, `%${term}%`),
        )
      : undefined,
    options.includeBots ? undefined : eq(players.isBot, false),
  ].filter((filter) => filter !== undefined);

  const where = filters.length > 0 ? and(...filters) : undefined;

  const [rows, [totals]] = await Promise.all([
    db
      .select({
        playerId: players.id,
        accountId: accounts.id,
        accountName: accounts.accountName,
        profileName: players.profileName,
        rank: accounts.rank,
        status: accounts.status,
        level: players.level,
        isBot: players.isBot,
        lastLoginAt: accounts.lastLoginAt,
        createdAt: players.createdAt,
      })
      .from(players)
      .innerJoin(accounts, eq(accounts.id, players.accountId))
      .where(where)
      .orderBy(desc(players.createdAt))
      .limit(options.limit)
      .offset(options.offset),
    db
      .select({ total: count() })
      .from(players)
      .innerJoin(accounts, eq(accounts.id, players.accountId))
      .where(where),
  ]);

  return {
    players: rows.map((row) => ({
      ...row,
      accountName: String(row.accountName),
      profileName: String(row.profileName),
      lastLoginAt: row.lastLoginAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    })),
    total: totals?.total ?? 0,
  };
}

/**
 * Everything about one account, on one screen.
 *
 * Counts rather than contents for what an account owns: an operator answering "did my
 * relic vanish" needs to know there are 143 of them before they need to see all 143, and
 * the drill-in views arrive with A5 proper.
 */
export async function detail(
  ctx: PlayerAdminContext,
  playerId: string,
): Promise<AdminPlayerDetail> {
  const [row] = await ctx.db
    .select()
    .from(players)
    .innerJoin(accounts, eq(accounts.id, players.accountId))
    .where(eq(players.id, playerId));
  if (!row) throw AppError.notFound('No such player.');

  const { players: player, accounts: account } = row;
  const now = new Date();

  const [holdings, progressRows, liveSessions, economy] = await Promise.all([
    Promise.all([
      ctx.db
        .select({ total: count() })
        .from(playerChampions)
        .where(eq(playerChampions.playerId, playerId)),
      ctx.db
        .select({ total: count() })
        .from(gearInstances)
        .where(eq(gearInstances.playerId, playerId)),
      ctx.db.select({ total: count() }).from(playerItems).where(eq(playerItems.playerId, playerId)),
    ]),
    ctx.db
      .select({
        stageKey: stageProgress.stageKey,
        parentKey: stageProgress.parentKey,
        mode: stageProgress.mode,
        stars: stageProgress.stars,
        clears: stageProgress.clears,
      })
      .from(stageProgress)
      .where(eq(stageProgress.playerId, playerId)),
    ctx.db
      .select({
        id: sessions.id,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
        expiresAt: sessions.expiresAt,
        ip: sessions.ip,
        userAgent: sessions.userAgent,
      })
      .from(sessions)
      .where(eq(sessions.accountId, account.id))
      .orderBy(desc(sessions.lastSeenAt)),
    ctx.db
      .select({
        source: economyLog.source,
        deltas: economyLog.deltas,
        createdAt: economyLog.createdAt,
      })
      .from(economyLog)
      .where(eq(economyLog.playerId, playerId))
      .orderBy(desc(economyLog.createdAt))
      .limit(25),
  ]);

  // Floor numbers come from published content rather than from the row, so a renumbered
  // floor reads correctly the moment it is published — the same rule the Depths hub uses.
  const floorNumbers = new Map(
    ctx.content
      .current()
      .bundle.stages.filter((stage) => stage.mode !== 'campaign')
      .map((stage) => [stage.key, stage.number]),
  );
  const deepestFloors: Record<string, number> = {};
  for (const entry of progressRows) {
    if (entry.mode === 'campaign' || entry.clears <= 0) continue;
    const floor = floorNumbers.get(entry.stageKey) ?? 0;
    deepestFloors[entry.parentKey] = Math.max(deepestFloors[entry.parentKey] ?? 0, floor);
  }

  const energy = computeEnergy({
    storedValue: player.energy,
    updatedAt: player.energyUpdatedAt,
    level: player.level,
    now,
  });

  return {
    account: {
      id: account.id,
      accountName: String(account.accountName),
      rank: account.rank,
      status: account.status,
      banReason: account.banReason,
      forcePasswordChange: account.forcePasswordChange,
      lastLoginAt: account.lastLoginAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
    },
    player: {
      id: player.id,
      profileName: String(player.profileName),
      level: player.level,
      xp: player.xp,
      silver: player.silver,
      crystals: player.crystals,
      valorMedals: player.valorMedals,
      energy: energy.value,
      energyCap: energyCapForLevel(player.level),
      rosterCapacity: player.rosterCapacity,
      isBot: player.isBot,
      createdAt: player.createdAt.toISOString(),
    },
    holdings: {
      champions: holdings[0][0]?.total ?? 0,
      gear: holdings[1][0]?.total ?? 0,
      itemStacks: holdings[2][0]?.total ?? 0,
    },
    progress: {
      stagesCleared: progressRows.filter((entry) => entry.clears > 0).length,
      stars: progressRows.reduce((total, entry) => total + entry.stars, 0),
      totalClears: progressRows.reduce((total, entry) => total + entry.clears, 0),
      deepestFloors,
    },
    sessions: liveSessions.map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt.toISOString(),
      lastSeenAt: entry.lastSeenAt.toISOString(),
      expiresAt: entry.expiresAt.toISOString(),
      ip: entry.ip,
      userAgent: entry.userAgent,
    })),
    economy: economy.map((entry) => ({
      source: entry.source,
      deltas: entry.deltas as Record<string, number>,
      createdAt: entry.createdAt.toISOString(),
    })),
  };
}

// ── Acting ──────────────────────────────────────────────────────────────────

/**
 * Resets a password to a generated temporary one.
 *
 * The operator does not choose it. A chosen password is one the operator keeps knowing;
 * a generated one is read out once and replaced on the warden's next sign-in, which
 * `forcePasswordChange` makes mandatory rather than encouraged. Every session is signed
 * out in the same transaction — a reset that left the old sessions alive would leave
 * whoever prompted it still logged in.
 */
export async function resetPassword(
  db: Database,
  playerId: string,
): Promise<{ subject: Subject; temporaryPassword: string; sessionsRevoked: number }> {
  const subject = await requireSubject(db, playerId);
  // Base64url of 12 bytes: 16 characters, no ambiguity about case or punctuation when
  // it is read down a phone line.
  const temporaryPassword = randomBytes(TEMP_PASSWORD_BYTES).toString('base64url');
  const passwordHash = await hashPassword(temporaryPassword);

  const sessionsRevoked = await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({ passwordHash, forcePasswordChange: true, updatedAt: new Date() })
      .where(eq(accounts.id, subject.accountId));
    const removed = await tx
      .delete(sessions)
      .where(eq(sessions.accountId, subject.accountId))
      .returning({ id: sessions.id });
    return removed.length;
  });

  return { subject, temporaryPassword, sessionsRevoked };
}

/** Changes an account's rank. Never the caller's own — that is how a suite locks itself out. */
export async function setRank(
  db: Database,
  playerId: string,
  callerAccountId: string,
  rank: Subject['rank'],
): Promise<Subject> {
  const subject = await requireSubject(db, playerId);
  refuseSelf(subject, callerAccountId, 'change the rank of');

  await db
    .update(accounts)
    .set({ rank, updatedAt: new Date() })
    .where(eq(accounts.id, subject.accountId));

  return { ...subject, rank };
}

/**
 * Bans or unbans, with a reason the account will be shown.
 *
 * Banning signs the account out: a ban that leaves a live session running is a ban that
 * does not start until the token expires.
 */
export async function setBanned(
  db: Database,
  playerId: string,
  callerAccountId: string,
  input: { banned: boolean; reason?: string | undefined },
): Promise<Subject> {
  const subject = await requireSubject(db, playerId);
  if (input.banned) refuseSelf(subject, callerAccountId, 'ban');

  const reason = input.banned ? (input.reason?.trim() ?? '') : null;
  if (input.banned && reason!.length < 3) {
    throw new AppError('VALIDATION', 'A ban needs a reason — the account is shown it.');
  }

  await db.transaction(async (tx) => {
    await tx
      .update(accounts)
      .set({
        status: input.banned ? 'banned' : 'active',
        banReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(accounts.id, subject.accountId));
    if (input.banned) {
      await tx.delete(sessions).where(eq(sessions.accountId, subject.accountId));
    }
  });

  return { ...subject, status: input.banned ? 'banned' : 'active', banReason: reason };
}

/** Renames a profile. The uniqueness rule is the database's, so a race cannot beat it. */
export async function rename(
  db: Database,
  playerId: string,
  profileName: string,
): Promise<Subject> {
  const subject = await requireSubject(db, playerId);

  try {
    await db
      .update(players)
      .set({ profileName, updatedAt: new Date() })
      .where(eq(players.id, subject.playerId));
  } catch (cause) {
    // `players_profile_name_key` is citext-unique, so this is the only way to lose.
    if (String(cause).includes('players_profile_name_key')) {
      throw new AppError('ALREADY_EXISTS', 'That profile name is taken.');
    }
    throw cause;
  }

  return { ...subject, profileName };
}

/**
 * Hands something over — or takes it back.
 *
 * Routed through `RewardService` rather than writing the columns directly, so an operator
 * grant lands in `economy_log` beside the battle payouts and the summon spends. A hand-out
 * that bypassed the ledger would be invisible in exactly the audit it most needs to appear
 * in, and would break the one-place-to-extend rule every other grant follows.
 */
export async function grant(
  db: Database,
  playerId: string,
  actor: string,
  input: AdminGrantRequest,
): Promise<{ subject: Subject; result: rewards.GrantResult }> {
  const subject = await requireSubject(db, playerId);
  const source = `admin:${actor}`;

  const result = await db.transaction(async (tx) => {
    const granted = await rewards.grant(
      tx,
      subject.playerId,
      {
        ...(input.silver !== undefined ? { silver: input.silver } : {}),
        ...(input.crystals !== undefined ? { crystals: input.crystals } : {}),
        ...(input.valorMedals !== undefined ? { valorMedals: input.valorMedals } : {}),
        ...(input.playerXp !== undefined ? { playerXp: input.playerXp } : {}),
      },
      source,
    );
    if (input.items && Object.keys(input.items).length > 0) {
      await rewards.grantItems(tx, subject.playerId, input.items, source);
    }
    return granted;
  });

  return { subject, result };
}

/** Signs an account out everywhere. The account keeps its password; it just has to use it. */
export async function revokeSessions(
  db: Database,
  playerId: string,
): Promise<{ subject: Subject; revoked: number }> {
  const subject = await requireSubject(db, playerId);
  const removed = await db
    .delete(sessions)
    .where(eq(sessions.accountId, subject.accountId))
    .returning({ id: sessions.id });
  return { subject, revoked: removed.length };
}

/**
 * Returns an account to the state registration leaves it in.
 *
 * The support answer to "I want to start over", and the one an operator reaches for most
 * while testing. Everything the account has *played* is destroyed: champions, relics,
 * items, campaign and Depths progress, the Chronicle, shop stock, summon history, battles,
 * its arena standing and its Hall of Valor. The account itself survives — same name, same
 * password, same rank — because this is a reset, not a deletion.
 *
 * Three deliberate exceptions to "everything":
 *
 *  - **Settings stay.** Audio, battle speed, reduced motion and colourblind glyphs are
 *    accessibility choices, not progress. Resetting somebody's motion sensitivity because
 *    they asked for a fresh roster would be actively unkind.
 *  - **`economy_log` stays**, and the wallet is emptied *through* `RewardService` rather
 *    than by writing zeros. That keeps the ledger's central property true — the sum of a
 *    player's deltas is their balance — so the reset appears as a line rather than as a
 *    discontinuity nobody can explain later. The faucet and sink history was real; it
 *    happened, and rewriting it would corrupt the economy dashboards it feeds.
 *  - **The audit trail stays**, obviously, and gains an entry for this.
 *
 * No champion is granted back. A fresh account has none and is shown the starter chooser,
 * so that is what "fresh" has to mean here — and the welcome grant arrives with the
 * starter, exactly as it does for a new warden.
 */
export interface ResetSummary {
  champions: number;
  gear: number;
  itemStacks: number;
  stagesCleared: number;
  battles: number;
  summons: number;
  /** Currencies taken back, as a ledger line records them. */
  refunded: Record<string, number>;
  sessionsRevoked: number;
}

export async function resetAccount(
  db: Database,
  playerId: string,
): Promise<{ subject: Subject; summary: ResetSummary }> {
  const subject = await requireSubject(db, playerId);
  if (subject.isBot) {
    throw new AppError(
      'VALIDATION',
      'That is an arena bot. Rebuild the ladder from the bot manager instead.',
    );
  }

  const summary = await db.transaction(async (tx) => {
    // Locked for the same reason every other mutation locks it: a battle resolving
    // mid-reset would pay into a wallet this is in the middle of emptying.
    const [wallet] = await tx
      .select({
        silver: players.silver,
        crystals: players.crystals,
        valorMedals: players.valorMedals,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!wallet) throw AppError.notFound('No such player.');

    // Counted where the number is worth reporting back, deleted plainly where it is not.
    // Written out rather than looped: these tables do not share a primary key, and a loop
    // clever enough to paper over that is a loop nobody can check.
    const champions = await tx
      .delete(playerChampions)
      .where(eq(playerChampions.playerId, playerId))
      .returning({ id: playerChampions.id });
    const gear = await tx
      .delete(gearInstances)
      .where(eq(gearInstances.playerId, playerId))
      .returning({ id: gearInstances.id });
    const items = await tx
      .delete(playerItems)
      .where(eq(playerItems.playerId, playerId))
      .returning({ id: playerItems.id });
    const cleared = await tx
      .delete(stageProgress)
      .where(eq(stageProgress.playerId, playerId))
      .returning({ id: stageProgress.id });
    const battles = await tx
      .delete(battleSessions)
      .where(eq(battleSessions.playerId, playerId))
      .returning({ id: battleSessions.id });
    const summons = await tx
      .delete(summonHistory)
      .where(eq(summonHistory.playerId, playerId))
      .returning({ id: summonHistory.id });

    await tx.delete(chapterRewards).where(eq(chapterRewards.playerId, playerId));
    await tx.delete(championSightings).where(eq(championSightings.playerId, playerId));
    await tx.delete(shopStates).where(eq(shopStates.playerId, playerId));
    await tx.delete(hallOfValor).where(eq(hallOfValor.playerId, playerId));
    await tx.delete(arenaState).where(eq(arenaState.playerId, playerId));

    // Arena history names two players. Both sides go: a fight whose attacker no longer
    // has a rating is a row that can only mislead whoever reads it next.
    await tx
      .delete(arenaBattles)
      .where(or(eq(arenaBattles.attackerId, playerId), eq(arenaBattles.defenderId, playerId)));

    // The wallet goes back through RewardService so the ledger still balances.
    const refunded: Record<string, number> = {};
    const cost = {
      ...(wallet.silver > 0 ? { silver: wallet.silver } : {}),
      ...(wallet.crystals > 0 ? { crystals: wallet.crystals } : {}),
      ...(wallet.valorMedals > 0 ? { valorMedals: wallet.valorMedals } : {}),
    };
    if (Object.keys(cost).length > 0) {
      const spent = await rewards.spend(tx, playerId, cost, 'admin:reset');
      Object.assign(refunded, spent.applied);
    }

    // Level and XP cannot go through the ledger — it moves currencies, and account level
    // is derived from XP rather than held as a balance. Set directly, to exactly what
    // `auth/service.ts` gives a new registration.
    await tx
      .update(players)
      .set({
        level: 1,
        xp: 0,
        energy: energyCapForLevel(1),
        energyUpdatedAt: new Date(),
        rosterCapacity: 60,
        tutorialStep: 0,
        summonPity: {},
        lastSummonActionId: null,
        lastMultiBattle: null,
        dailyCounters: {},
        dailyCountersDay: null,
        lastDailyResetAt: null,
        updatedAt: new Date(),
      })
      .where(eq(players.id, playerId));

    // Signed out everywhere: a tab still holding the old roster would spend the next
    // minute 404-ing against champions that no longer exist.
    const revoked = await tx
      .delete(sessions)
      .where(eq(sessions.accountId, subject.accountId))
      .returning({ id: sessions.id });

    return {
      champions: champions.length,
      gear: gear.length,
      itemStacks: items.length,
      stagesCleared: cleared.length,
      battles: battles.length,
      summons: summons.length,
      refunded,
      sessionsRevoked: revoked.length,
    };
  });

  return { subject, summary };
}
