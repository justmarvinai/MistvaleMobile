import { eq } from 'drizzle-orm';
import { tierForRating, type ArenaResult } from '@mistvale/shared';
import { arenaBattles, arenaState, players } from '../../db/schema/index';
import type { ArenaStateRow } from '../../db/schema/arena';
import type { Database } from '../../db/client';
import { AppError } from '../../lib/errors';
import { gameDayFrom } from '../../lib/game-day';
import type { ContentCache } from '../../content/cache';
import * as rewards from '../rewards/service';
import { applyRating, arenaConfigFrom, medalsForWin, ratingChange, weeklyDecay } from './rating';

/**
 * The ladder's stateful core: opening a record, moving two ratings, naming a week.
 *
 * Split out of `service.ts` for one structural reason. The arena service has to reach into
 * the battle module to assemble both teams, and the battle module has to reach back to
 * settle a finished arena fight — which would be a cycle between two service modules, the
 * one shape `ARCHITECTURE §4` rules out. Everything the battle module needs lives here
 * instead, and this file imports no service but `rewards`.
 */

export type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ArenaContext {
  db: Database;
  content: ContentCache;
}

/** The arena's numbers, out of the published config. */
export const config = (ctx: ArenaContext) => arenaConfigFrom(ctx.content.current().bundle.config);

/**
 * The player's row, created on first contact.
 *
 * A row is made rather than defaulted-in-memory because the ladder has to be able to
 * *find* this player: matchmaking reads `arena_state` by rating band, and an account with
 * no row is an account nobody can be offered.
 */
export async function ensureState(
  tx: Executor,
  playerId: string,
  ctx: ArenaContext,
): Promise<ArenaStateRow> {
  const [existing] = await tx.select().from(arenaState).where(eq(arenaState.playerId, playerId));
  if (existing) return existing;

  const settings = config(ctx);
  const [created] = await tx
    .insert(arenaState)
    .values({
      playerId,
      rating: settings.startingRating,
      tier: tierForRating(settings.startingRating, settings.thresholds),
      weeklyHigh: settings.startingRating,
      tokens: settings.tokenCap,
    })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  // Lost a race with a concurrent first read; the other one won and the row is there.
  const [row] = await tx.select().from(arenaState).where(eq(arenaState.playerId, playerId));
  if (!row) throw AppError.internal('Could not open an arena record.');
  return row;
}

/** Refuses the Arena to an account that has not reached its unlock level. */
export function assertUnlocked(level: number, ctx: ArenaContext): void {
  const settings = config(ctx);
  if (level < settings.unlockLevel) {
    throw new AppError(
      'LOCKED_CONTENT',
      `The Arena opens at account level ${settings.unlockLevel}.`,
    );
  }
}

// ── Settling ────────────────────────────────────────────────────────────────

export interface SettleInput {
  attackerId: string;
  defenderId: string;
  battleId: string;
  won: boolean;
}

/**
 * Moves both ratings and pays the medals, once an arena battle has resolved.
 *
 * Called from the battle module's settle path, inside the same transaction as the result,
 * so a fight can never be recorded without its rating change or vice versa.
 *
 * Both sides move, even though only one of them was present: a defence team that loses
 * while its owner sleeps has still lost. That is what makes a rating mean the same thing
 * at the top of the ladder as at the bottom (ECONOMY_BALANCE §8).
 */
export async function settleBattle(
  tx: Executor,
  ctx: ArenaContext,
  input: SettleInput,
): Promise<ArenaResult> {
  const settings = config(ctx);

  const attacker = await ensureState(tx, input.attackerId, ctx);
  const defender = await ensureState(tx, input.defenderId, ctx);

  const change = ratingChange(attacker.rating, defender.rating, input.won, settings);
  const attackerAfter = applyRating(attacker.rating, change.attacker, settings);
  const defenderAfter = applyRating(defender.rating, change.defender, settings);

  const tierBefore = tierForRating(attacker.rating, settings.thresholds);
  const tierAfter = tierForRating(attackerAfter, settings.thresholds);
  // Paid at the tier the win *landed* in, so a promoting win pays the new band.
  const medals = input.won ? medalsForWin(tierAfter, settings) : 0;

  const now = new Date();
  await tx
    .update(arenaState)
    .set({
      rating: attackerAfter,
      tier: tierAfter,
      weeklyHigh: Math.max(attacker.weeklyHigh, attackerAfter),
      // The offer is spent whether it was won or lost — a list that let a player retry the
      // same opponent until it worked would make the token meaningless.
      offers: attacker.offers.filter((offer) => offer.defenderId !== input.defenderId),
      updatedAt: now,
    })
    .where(eq(arenaState.playerId, input.attackerId));

  await tx
    .update(arenaState)
    .set({
      rating: defenderAfter,
      tier: tierForRating(defenderAfter, settings.thresholds),
      weeklyHigh: Math.max(defender.weeklyHigh, defenderAfter),
      updatedAt: now,
    })
    .where(eq(arenaState.playerId, input.defenderId));

  if (medals > 0) {
    await rewards.grant(tx, input.attackerId, { valorMedals: medals }, 'arena:win');
  }

  await tx.insert(arenaBattles).values({
    attackerId: input.attackerId,
    defenderId: input.defenderId,
    battleId: input.battleId,
    won: input.won,
    attackerRatingDelta: attackerAfter - attacker.rating,
    defenderRatingDelta: defenderAfter - defender.rating,
    medals,
  });

  const [opponent] = await tx
    .select({ profileName: players.profileName })
    .from(players)
    .where(eq(players.id, input.defenderId));

  return {
    won: input.won,
    ratingBefore: attacker.rating,
    ratingAfter: attackerAfter,
    ratingDelta: attackerAfter - attacker.rating,
    tierBefore,
    tierAfter,
    medals,
    opponent: opponent?.profileName ?? 'a stranger',
  };
}

// ── Weeks ───────────────────────────────────────────────────────────────────

/**
 * The week a moment belongs to, named by its Monday, in the operator's own timezone.
 *
 * Derived from `gameDayFrom` rather than from UTC so the arena week turns over at the same
 * moment as every other daily reset in the game — one clock, one boundary.
 */
export function weekKey(ctx: ArenaContext, now: Date): string {
  const day = gameDayFrom(ctx.content.current().bundle.config, now);
  const date = new Date(`${day.date}T00:00:00Z`);
  // Monday-based: `getUTCDay` calls Sunday 0, and the arena week starts on Monday.
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

/** When the current arena week rolls over — the Monday after the one it started on. */
export function nextMonday(ctx: ArenaContext, now: Date): Date {
  const monday = new Date(`${weekKey(ctx, now)}T00:00:00Z`);
  monday.setUTCDate(monday.getUTCDate() + 7);
  return monday;
}

export interface WeeklyResetReport {
  /** Accounts whose chest was sealed for collection. */
  sealed: number;
  /** Accounts whose rating decayed towards its tier floor. */
  decayed: number;
  week: string;
}

/**
 * Closes the arena week.
 *
 * Three things happen, in this order and for a reason:
 *
 *  1. **The chest is sealed.** The week's best rating is copied into the pending-chest
 *     columns, because step 3 is about to clear `weekly_high` and a chest earned in the
 *     week that just ended has to survive the boundary to be claimed in the next one.
 *  2. **Ratings decay** by a share of the distance down to their tier floor — enough that
 *     an abandoned Platinum account drifts out of the way, never enough to demote anybody
 *     on its own (ECONOMY_BALANCE §8).
 *  3. **The week restarts**: `weekly_high` becomes the post-decay rating and the daily
 *     refresh allowance is cleared.
 *
 * Only real accounts are touched. A bot's rating is the nightly refresh's business, and
 * decaying it every Monday would drag the whole ladder to its band floors over a season.
 *
 * Safe to run twice: the week it is sealing is named, and a second run inside the same
 * week is a no-op rather than a second decay.
 */
export async function weeklyReset(ctx: ArenaContext, now: Date): Promise<WeeklyResetReport> {
  const settings = config(ctx);
  // The week that just *ended* — this runs at the boundary, so `now` is already inside
  // the new one.
  const closing = weekKey(ctx, new Date(now.getTime() - 24 * 60 * 60 * 1000));

  const rows = await ctx.db
    .select({
      playerId: arenaState.playerId,
      rating: arenaState.rating,
      weeklyHigh: arenaState.weeklyHigh,
      pendingChestWeek: arenaState.pendingChestWeek,
      pendingChestHigh: arenaState.pendingChestHigh,
    })
    .from(arenaState)
    .innerJoin(players, eq(players.id, arenaState.playerId))
    .where(eq(players.isBot, false));

  const report: WeeklyResetReport = { sealed: 0, decayed: 0, week: closing };

  for (const row of rows) {
    // Already closed this week; a restart or a manual re-run must not decay twice.
    if (row.pendingChestWeek === closing) continue;

    // An unclaimed chest is not thrown away — the better of the two is kept, so three
    // weeks away costs the collection but never the best week in it.
    const high = Math.max(row.weeklyHigh, row.pendingChestHigh);
    const decayed = weeklyDecay(row.rating, settings);

    await ctx.db
      .update(arenaState)
      .set({
        rating: decayed,
        tier: tierForRating(decayed, settings.thresholds),
        weeklyHigh: decayed,
        pendingChestWeek: closing,
        pendingChestHigh: high,
        refreshesUsed: 0,
        refreshDay: null,
        updatedAt: now,
      })
      .where(eq(arenaState.playerId, row.playerId));

    report.sealed += 1;
    if (decayed !== row.rating) report.decayed += 1;
  }

  return report;
}
