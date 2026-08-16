import {
  DEFAULT_PLAYER_SETTINGS,
  computeUnlocks,
  type AccountSummary,
  type PlayerSummary,
  type SessionResponse,
  type UnlockFlags,
} from '@mistvale/shared';
import type { Database } from '../../db/client';
import type { AccountRow, PlayerRow } from '../../db/schema/index';
import { AppError } from '../../lib/errors';
import { burnTimingBudget, hashPassword, verifyPassword } from '../../lib/password';
import { generateSessionToken, hashSessionToken, sessionExpiryFrom } from '../../lib/session-token';
import { computeEnergy, energyCapForLevel, xpForNextLevel } from '../../lib/progression';
import * as repo from './repo';

/**
 * Identity rules: registration, login, sessions, password changes.
 *
 * Services own the game rules and transaction boundaries. They never touch HTTP —
 * routes translate their results into responses (docs/ARCHITECTURE.md §3).
 */

export interface AuthContext {
  db: Database;
  sessionPepper: string;
  sessionTtlDays: number;
  now?: () => Date;
}

export interface IssuedSession extends SessionResponse {
  /** Raw token for the cookie. Only ever leaves the server in a Set-Cookie header. */
  token: string;
  expiresAt: Date;
}

/** A unique-violation from PostgreSQL carries code 23505. */
function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as { code?: unknown; constraint?: unknown };
  if (candidate.code !== '23505') return false;
  return constraint === undefined || candidate.constraint === constraint;
}

export async function register(
  ctx: AuthContext,
  input: {
    accountName: string;
    profileName: string;
    password: string;
    ip?: string | null;
    userAgent?: string | null;
  },
): Promise<IssuedSession> {
  const now = ctx.now?.() ?? new Date();
  const passwordHash = await hashPassword(input.password);

  // Registration creates the account, its player profile, and the first session as one
  // unit: a half-created account would leave a player unable to log in or re-register.
  const created = await ctx.db.transaction(async (tx) => {
    let account: AccountRow;
    try {
      account = await repo.insertAccount(tx, {
        accountName: input.accountName,
        passwordHash,
        createdIp: input.ip ?? null,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.alreadyExists('That account name is already taken.', {
          field: 'accountName',
        });
      }
      throw error;
    }

    let player: PlayerRow;
    try {
      player = await repo.insertPlayer(tx, {
        accountId: account.id,
        profileName: input.profileName,
        energy: energyCapForLevel(1),
        energyUpdatedAt: now,
        settings: DEFAULT_PLAYER_SETTINGS,
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw AppError.alreadyExists('That profile name is already taken.', {
          field: 'profileName',
        });
      }
      throw error;
    }

    return { account, player };
  });

  const session = await issueSession(ctx, created.account.id, {
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    now,
  });

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    ...buildSessionResponse(created.account, created.player, now),
  };
}

export async function login(
  ctx: AuthContext,
  input: { accountName: string; password: string; ip?: string | null; userAgent?: string | null },
): Promise<IssuedSession> {
  const now = ctx.now?.() ?? new Date();
  const account = await repo.findAccountByName(ctx.db, input.accountName);

  if (!account) {
    // Spend the same time we would on a real verification so that a missing account is
    // indistinguishable from a wrong password by response timing.
    await burnTimingBudget(input.password);
    throw AppError.invalidCredentials();
  }

  const passwordOk = await verifyPassword(account.passwordHash, input.password);
  if (!passwordOk) {
    throw AppError.invalidCredentials();
  }

  if (account.status === 'banned') {
    throw new AppError('ACCOUNT_BANNED', account.banReason ?? undefined);
  }

  const player = await repo.findPlayerByAccountId(ctx.db, account.id);
  if (!player) {
    // Registration is transactional, so this means the row was removed out of band.
    throw AppError.internal('Account has no player profile.');
  }

  const session = await issueSession(ctx, account.id, {
    ip: input.ip ?? null,
    userAgent: input.userAgent ?? null,
    now,
  });
  await repo.updateLastLogin(ctx.db, account.id, now);

  return {
    token: session.token,
    expiresAt: session.expiresAt,
    ...buildSessionResponse(account, player, now),
  };
}

export async function logout(ctx: AuthContext, token: string): Promise<void> {
  await repo.deleteSessionByTokenHash(ctx.db, hashSessionToken(token, ctx.sessionPepper));
}

export async function logoutAll(ctx: AuthContext, accountId: string): Promise<number> {
  return repo.deleteSessionsForAccount(ctx.db, accountId);
}

/** Resolves a raw token to its account and player, or undefined when it is not valid. */
export async function resolveSession(
  ctx: AuthContext,
  token: string,
): Promise<{ sessionId: string; account: AccountRow; player: PlayerRow } | undefined> {
  const now = ctx.now?.() ?? new Date();
  const tokenHash = hashSessionToken(token, ctx.sessionPepper);
  const found = await repo.findLiveSession(ctx.db, tokenHash, now);
  if (!found) return undefined;

  const player = await repo.findPlayerByAccountId(ctx.db, found.account.id);
  if (!player) return undefined;

  // Sliding expiry: an active player never gets logged out mid-session.
  await repo.touchSession(ctx.db, found.sessionId, now, sessionExpiryFrom(now, ctx.sessionTtlDays));

  return { sessionId: found.sessionId, account: found.account, player };
}

export async function changePassword(
  ctx: AuthContext,
  input: { accountId: string; currentPassword: string; newPassword: string },
): Promise<void> {
  const account = await repo.findAccountById(ctx.db, input.accountId);
  if (!account) throw AppError.authRequired();

  const ok = await verifyPassword(account.passwordHash, input.currentPassword);
  if (!ok) throw AppError.invalidCredentials();

  if (input.currentPassword === input.newPassword) {
    throw AppError.validation(
      { field: 'newPassword' },
      'Choose a password you have not used here.',
    );
  }

  const passwordHash = await hashPassword(input.newPassword);
  await ctx.db.transaction(async (tx) => {
    await repo.updatePasswordHash(tx, account.id, passwordHash);
    // Every other device is signed out; the caller receives a fresh session.
    await repo.deleteSessionsForAccount(tx, account.id);
  });
}

async function issueSession(
  ctx: AuthContext,
  accountId: string,
  options: { ip: string | null; userAgent: string | null; now: Date },
): Promise<{ token: string; expiresAt: Date }> {
  const token = generateSessionToken();
  const expiresAt = sessionExpiryFrom(options.now, ctx.sessionTtlDays);

  await repo.insertSession(ctx.db, {
    accountId,
    tokenHash: hashSessionToken(token, ctx.sessionPepper),
    expiresAt,
    ip: options.ip,
    userAgent: options.userAgent,
  });

  return { token, expiresAt };
}

/** Shapes the database rows into the DTOs the client consumes. */
export function buildSessionResponse(
  account: AccountRow,
  player: PlayerRow,
  now: Date,
): SessionResponse {
  return {
    account: toAccountSummary(account),
    player: toPlayerSummary(player, now),
  };
}

export function toAccountSummary(account: AccountRow): AccountSummary {
  return {
    id: account.id,
    accountName: account.accountName,
    rank: account.rank,
    forcePasswordChange: account.forcePasswordChange,
  };
}

export function toPlayerSummary(player: PlayerRow, now: Date): PlayerSummary {
  const energy = computeEnergy({
    storedValue: player.energy,
    updatedAt: player.energyUpdatedAt,
    level: player.level,
    now,
  });

  return {
    id: player.id,
    profileName: player.profileName,
    level: player.level,
    xp: player.xp,
    xpToNextLevel: xpForNextLevel(player.level),
    silver: player.silver,
    crystals: player.crystals,
    valorMedals: player.valorMedals,
    energy: energy.state,
    rosterCapacity: player.rosterCapacity,
    tutorialStep: player.tutorialStep,
    createdAt: player.createdAt.toISOString(),
  };
}

export function unlocksFor(player: PlayerRow): UnlockFlags {
  return computeUnlocks(player.level);
}
