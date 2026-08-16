import { and, eq, gt, lt, sql } from 'drizzle-orm';
import type { Database } from '../../db/client';
import { accounts, players, sessions } from '../../db/schema/index';
import type { AccountRow, NewAccountRow, NewPlayerRow, PlayerRow } from '../../db/schema/index';

/**
 * Data access for identity.
 *
 * Repositories only run queries — no game rules, no HTTP. Every function accepts a
 * `Database`, which may be a transaction handle, so a service can compose several calls
 * atomically (docs/ARCHITECTURE.md §5.3).
 */

export async function findAccountByName(
  db: Database,
  accountName: string,
): Promise<AccountRow | undefined> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.accountName, accountName))
    .limit(1);
  return rows[0];
}

export async function findAccountById(db: Database, id: string): Promise<AccountRow | undefined> {
  const rows = await db.select().from(accounts).where(eq(accounts.id, id)).limit(1);
  return rows[0];
}

export async function insertAccount(db: Database, values: NewAccountRow): Promise<AccountRow> {
  const rows = await db.insert(accounts).values(values).returning();
  const row = rows[0];
  if (!row) throw new Error('insertAccount: no row returned');
  return row;
}

export async function insertPlayer(db: Database, values: NewPlayerRow): Promise<PlayerRow> {
  const rows = await db.insert(players).values(values).returning();
  const row = rows[0];
  if (!row) throw new Error('insertPlayer: no row returned');
  return row;
}

export async function findPlayerByAccountId(
  db: Database,
  accountId: string,
): Promise<PlayerRow | undefined> {
  const rows = await db.select().from(players).where(eq(players.accountId, accountId)).limit(1);
  return rows[0];
}

export async function profileNameExists(db: Database, profileName: string): Promise<boolean> {
  const rows = await db
    .select({ id: players.id })
    .from(players)
    .where(eq(players.profileName, profileName))
    .limit(1);
  return rows.length > 0;
}

export async function updateLastLogin(db: Database, accountId: string, at: Date): Promise<void> {
  await db
    .update(accounts)
    .set({ lastLoginAt: at, updatedAt: at })
    .where(eq(accounts.id, accountId));
}

export async function updatePasswordHash(
  db: Database,
  accountId: string,
  passwordHash: string,
): Promise<void> {
  await db
    .update(accounts)
    .set({ passwordHash, forcePasswordChange: false, updatedAt: new Date() })
    .where(eq(accounts.id, accountId));
}

export async function insertSession(
  db: Database,
  values: {
    accountId: string;
    tokenHash: string;
    expiresAt: Date;
    userAgent?: string | null;
    ip?: string | null;
  },
): Promise<void> {
  await db.insert(sessions).values(values);
}

/** Returns the account behind a live (unexpired) session token hash. */
export async function findLiveSession(
  db: Database,
  tokenHash: string,
  now: Date,
): Promise<{ sessionId: string; account: AccountRow } | undefined> {
  const rows = await db
    .select({ sessionId: sessions.id, account: accounts })
    .from(sessions)
    .innerJoin(accounts, eq(accounts.id, sessions.accountId))
    .where(and(eq(sessions.tokenHash, tokenHash), gt(sessions.expiresAt, now)))
    .limit(1);
  return rows[0];
}

/**
 * Refreshes the sliding session window.
 *
 * Throttled to at most once per hour so a busy player does not cause a write on every
 * request.
 */
export async function touchSession(
  db: Database,
  sessionId: string,
  now: Date,
  newExpiry: Date,
): Promise<void> {
  await db
    .update(sessions)
    .set({ lastSeenAt: now, expiresAt: newExpiry })
    .where(
      and(
        eq(sessions.id, sessionId),
        lt(sessions.lastSeenAt, new Date(now.getTime() - 60 * 60 * 1000)),
      ),
    );
}

export async function deleteSessionByTokenHash(db: Database, tokenHash: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export async function deleteSessionsForAccount(db: Database, accountId: string): Promise<number> {
  const result = await db.delete(sessions).where(eq(sessions.accountId, accountId)).returning({
    id: sessions.id,
  });
  return result.length;
}

/** Removes expired rows; called by the daily maintenance job. */
export async function deleteExpiredSessions(db: Database, now: Date): Promise<number> {
  const result = await db.delete(sessions).where(lt(sessions.expiresAt, now)).returning({
    id: sessions.id,
  });
  return result.length;
}

export async function countAccounts(db: Database): Promise<number> {
  const rows = await db.select({ count: sql<number>`count(*)::int` }).from(accounts);
  return rows[0]?.count ?? 0;
}
