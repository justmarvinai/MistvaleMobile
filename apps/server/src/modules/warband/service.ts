import { and, count, desc, eq, inArray, sql } from 'drizzle-orm';
import { championScalingFrom, deriveStats } from '@mistvale/engine';
import {
  BORROW_COUNTER,
  warbandConfigFrom,
  type Warband,
  type WarbandConfig,
  type WardenSummary,
} from '@mistvale/shared';
import { gearInstances, playerChampions, playerFollows, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import { countersFor, remaining } from '../../lib/daily-counters';

import * as gear from '../gear/service';
import * as mastery from '../mastery/service';
import { accountBonusFor, accountBonusesFor } from '../roster/account';

/**
 * Wardens — the friends slice of Warbands (C37).
 *
 * A one-way list of people, and one champion a day borrowed from it. What is deliberately
 * absent is a guild: no chat, no officers, no shared bank, nothing to schedule with
 * anybody. Mistvale's social layer has been the same shape since the Wurm Wakes — the only
 * social act is turning up.
 *
 * The three decisions that make it small enough to be worth having are stated in
 * `shared/warband.ts`; the one that shapes this module is the second. **What may be
 * borrowed is what its owner nominated**, so there is no request, no accept, no pending
 * state and no channel to notify through. A standard-bearer is the fifth thing an account
 * chooses to show, after the four on its profile card.
 *
 * A borrowed champion is assembled from the **lender's** side of everything — their relics,
 * their masteries, their collection bonuses — exactly as an arena defence is, because a
 * champion that fought at the borrower's power would not be the champion that was offered.
 */

export interface WarbandContext {
  db: Database;
  content: ContentCache;
}

type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];

export function configFrom(content: ContentCache): WarbandConfig {
  return warbandConfigFrom(content.current().bundle.config);
}

// ── The list ────────────────────────────────────────────────────────────────

/**
 * One account's wardens, its own nomination, and what is left today.
 *
 * One call rather than three, because the screen asks all of it at once and because the
 * cap and the allowance mean nothing apart from the counts they bound.
 */
export async function warband(ctx: WarbandContext, playerId: string): Promise<Warband> {
  const config = configFrom(ctx.content);
  const now = new Date();

  const [me] = await ctx.db
    .select({
      standardBearerId: players.standardBearerId,
      lendsTotal: players.lendsTotal,
      dailyCounters: players.dailyCounters,
      dailyCountersDay: players.dailyCountersDay,
    })
    .from(players)
    .where(eq(players.id, playerId));
  if (!me) throw AppError.notFound('No such warden.');

  const rows = await ctx.db
    .select({
      playerId: players.id,
      profileName: players.profileName,
      level: players.level,
      title: players.title,
      avatarChampionKey: players.avatarChampionKey,
      lends: players.lendsTotal,
      standardBearerId: players.standardBearerId,
      keptAt: playerFollows.createdAt,
    })
    .from(playerFollows)
    .innerJoin(players, eq(players.id, playerFollows.wardenId))
    .where(eq(playerFollows.followerId, playerId))
    .orderBy(desc(playerFollows.createdAt));

  const bearers = await bearersFor(
    ctx,
    rows.flatMap((row) => (row.standardBearerId ? [row.standardBearerId] : [])),
  );

  const counters = countersFor(me, ctx.content.current().bundle.config, now);

  return {
    wardens: rows.map((row) => ({
      playerId: row.playerId,
      profileName: row.profileName,
      level: row.level,
      title: row.title ?? '',
      avatarChampionKey: row.avatarChampionKey,
      lends: row.lends,
      standardBearer: row.standardBearerId ? (bearers.get(row.standardBearerId) ?? null) : null,
    })),
    capacity: config.wardenCap,
    borrowsLeft: remaining(counters, BORROW_COUNTER, config.borrowsPerDay),
    borrowsPerDay: config.borrowsPerDay,
    standardBearerId: me.standardBearerId,
    lends: me.lendsTotal,
  };
}

/**
 * Keeps a warden, by profile name.
 *
 * By name because that is the only handle one player has for another — there are no
 * e-mail addresses anywhere in Mistvale and no invite codes. Bots are refused by name
 * rather than hidden: a warden who cannot lend is a row that does nothing, and saying so
 * is better than a list that quietly ignores half of what is typed into it.
 */
export async function follow(
  ctx: WarbandContext,
  playerId: string,
  profileName: string,
): Promise<WardenSummary> {
  const config = configFrom(ctx.content);

  const [warden] = await ctx.db
    .select({
      id: players.id,
      profileName: players.profileName,
      level: players.level,
      title: players.title,
      avatarChampionKey: players.avatarChampionKey,
      lends: players.lendsTotal,
      standardBearerId: players.standardBearerId,
      isBot: players.isBot,
    })
    .from(players)
    .where(eq(players.profileName, profileName));

  if (!warden) throw AppError.notFound(`No warden named "${profileName}".`);
  if (warden.id === playerId) {
    throw new AppError('VALIDATION', 'You cannot keep yourself as a warden.');
  }
  if (warden.isBot) {
    throw new AppError('VALIDATION', 'That is one of the Arena’s own; there is nobody there.');
  }

  const [held] = await ctx.db
    .select({ total: count() })
    .from(playerFollows)
    .where(eq(playerFollows.followerId, playerId));
  if ((held?.total ?? 0) >= config.wardenCap) {
    throw new AppError(
      'VALIDATION',
      `Your list holds ${config.wardenCap} wardens. Let one go to make room.`,
    );
  }

  // `onConflictDoNothing` rather than a read-then-write: keeping the same warden twice is
  // a no-op, not an error, and the pair is the primary key so the database settles it.
  await ctx.db
    .insert(playerFollows)
    .values({ followerId: playerId, wardenId: warden.id })
    .onConflictDoNothing();

  const bearers = await bearersFor(ctx, warden.standardBearerId ? [warden.standardBearerId] : []);
  return {
    playerId: warden.id,
    profileName: warden.profileName,
    level: warden.level,
    title: warden.title ?? '',
    avatarChampionKey: warden.avatarChampionKey,
    lends: warden.lends,
    standardBearer: warden.standardBearerId ? (bearers.get(warden.standardBearerId) ?? null) : null,
  };
}

/** Stops keeping one. Idempotent: letting go of somebody twice is not an error. */
export async function unfollow(
  ctx: WarbandContext,
  playerId: string,
  wardenId: string,
): Promise<void> {
  await ctx.db
    .delete(playerFollows)
    .where(and(eq(playerFollows.followerId, playerId), eq(playerFollows.wardenId, wardenId)));
}

/**
 * Nominates the copy anybody keeping this account may take into a fight, or withdraws it.
 *
 * Ownership is checked and food is refused. **Availability deliberately is not**, which is
 * the one place this parts company with the arena defence: an expedition makes a champion
 * unavailable to *its own account* — that narrowed roster is the whole cost of sending one
 * (C10c) — and a borrow takes nothing from the lender at all. Going quiet on somebody's list
 * for twelve hours because of their own expedition schedule would be invisible to both
 * sides, and it would penalise the one act here that already pays nothing.
 */
export async function setStandardBearer(
  ctx: WarbandContext,
  playerId: string,
  championId: string | null,
): Promise<void> {
  if (championId === null) {
    await ctx.db
      .update(players)
      .set({ standardBearerId: null, updatedAt: new Date() })
      .where(eq(players.id, playerId));
    return;
  }

  const [owned] = await ctx.db
    .select({ id: playerChampions.id, championKey: playerChampions.championKey })
    .from(playerChampions)
    .where(and(eq(playerChampions.id, championId), eq(playerChampions.playerId, playerId)));
  if (!owned) throw AppError.notFound('You do not own that champion.');

  const def = ctx.content
    .current()
    .bundle.champions.find((entry) => entry.key === owned.championKey);
  if (!def) throw new AppError('CONTENT_STALE', 'That champion is no longer published.');
  if (def.isFood) {
    throw new AppError('VALIDATION', 'Food cannot be put forward — there is nothing to lend.');
  }

  await ctx.db
    .update(players)
    .set({ standardBearerId: championId, updatedAt: new Date() })
    .where(eq(players.id, playerId));
}

// ── Borrowing ───────────────────────────────────────────────────────────────

export interface BorrowedAlly {
  /** The lender, so the results screen can say whose champion it was. */
  wardenId: string;
  profileName: string;
  championId: string;
}

/**
 * Resolves the champion an account is borrowing, and spends the day's allowance.
 *
 * Called inside the battle-start transaction, under the player-row lock it already holds,
 * so two taps on a flaky connection cannot spend one borrow twice. Refuses before anything
 * else is charged, in the order a player would ask: is this somebody I keep, have they put
 * anybody forward, and have I got a borrow left.
 */
export async function borrow(
  tx: Executor,
  ctx: WarbandContext,
  player: {
    playerId: string;
    dailyCounters: Record<string, number>;
    dailyCountersDay: string | null;
  },
  wardenId: string,
  now: Date,
): Promise<BorrowedAlly> {
  const config = configFrom(ctx.content);

  const [kept] = await tx
    .select({
      profileName: players.profileName,
      standardBearerId: players.standardBearerId,
    })
    .from(playerFollows)
    .innerJoin(players, eq(players.id, playerFollows.wardenId))
    .where(
      and(eq(playerFollows.followerId, player.playerId), eq(playerFollows.wardenId, wardenId)),
    );

  if (!kept) throw new AppError('VALIDATION', 'That warden is not on your list.');
  if (!kept.standardBearerId) {
    throw new AppError('VALIDATION', `${kept.profileName} has put nobody forward.`);
  }

  const counters = countersFor(player, ctx.content.current().bundle.config, now);
  if (remaining(counters, BORROW_COUNTER, config.borrowsPerDay) < 1) {
    throw new AppError(
      'COOLDOWN',
      config.borrowsPerDay === 0
        ? 'Borrowing is closed.'
        : 'You have borrowed today. The allowance comes back with the daily reset.',
    );
  }

  // Spent here rather than on the fight's outcome, and for the Titan's reason: the
  // resource is the *attempt*. A borrow that only cost something on a win would be a way
  // to scout a boss with somebody else's champion for nothing.
  const next = { ...counters.used, [BORROW_COUNTER]: (counters.used[BORROW_COUNTER] ?? 0) + 1 };
  await tx
    .update(players)
    .set({ dailyCounters: next, dailyCountersDay: counters.day, updatedAt: new Date() })
    .where(eq(players.id, player.playerId));

  // One statement rather than a read-modify-write: the lender's row is not locked by this
  // transaction and two borrowers at the same instant must both count.
  await tx
    .update(players)
    .set({ lendsTotal: sql`${players.lendsTotal} + 1`, updatedAt: new Date() })
    .where(eq(players.id, wardenId));

  return {
    wardenId,
    profileName: kept.profileName,
    championId: kept.standardBearerId,
  };
}

// ── Assembling a lent champion ──────────────────────────────────────────────

/**
 * The nominated copies, assembled from their **owners'** side of everything.
 *
 * Relics, masteries and collection bonuses all come from the lender, because a champion
 * that fought at the borrower's power would not be the champion that was offered — the
 * same rule the Arena draws between an attacker's collection and a defender's team.
 */
async function bearersFor(
  ctx: WarbandContext,
  ids: readonly string[],
): Promise<Map<string, NonNullable<WardenSummary['standardBearer']>>> {
  const out = new Map<string, NonNullable<WardenSummary['standardBearer']>>();
  if (ids.length === 0) return out;

  const rows = await ctx.db
    .select()
    .from(playerChampions)
    .where(inArray(playerChampions.id, [...ids]));
  if (rows.length === 0) return out;

  const snapshot = ctx.content.current();
  const champions = new Map(snapshot.bundle.champions.map((entry) => [entry.key, entry]));
  const scaling = championScalingFrom(snapshot.bundle.config);
  const gearContext = gear.gearContextFrom(snapshot.bundle);
  const masteryNodes = mastery.nodesFrom(ctx.content);

  const equipped = await gear.gearByChampion(
    ctx.db,
    rows.map((row) => row.id),
  );

  for (const row of rows) {
    const def = champions.get(row.championKey);
    if (!def) continue;
    const base = deriveStats(def.baseStats, row, scaling);
    const learned = mastery.resolveMasteries(row.masteries ?? [], masteryNodes);
    const masteryStats = mastery.applyMasteryStats(base, learned);
    const bonuses = await accountBonusesFor(ctx.db, ctx.content, row.playerId);
    const assembled = gear.assembleChampion(
      base,
      equipped.get(row.id) ?? [],
      gearContext,
      { flat: masteryStats, setBonusAmplifyPct: learned.setBonusAmplifyPct },
      accountBonusFor(bonuses, row.championKey, def.rarity),
    );
    out.set(row.id, {
      championKey: row.championKey,
      level: row.level,
      rank: row.rank,
      ascension: row.ascension,
      awakening: row.awakening,
      power: assembled.power,
      relics: (equipped.get(row.id) ?? []).length,
    });
  }

  return out;
}

/** How many relics a nominated copy is wearing — used by the tests and the summary alike. */
export async function relicsWorn(db: Database, championId: string): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(gearInstances)
    .where(eq(gearInstances.equippedChampionId, championId));
  return row?.total ?? 0;
}
