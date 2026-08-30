import { and, eq } from 'drizzle-orm';
import {
  claimsCloseOn,
  eventWindowAt,
  pointsAllowedToday,
  type EventWindow,
  type ValePassDef,
  type ValePassStanding,
  type ValePassTierStanding,
  type ValePassTrack,
  type ValePassView,
} from '@mistvale/shared';
import { playerPasses, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import { gameDayFrom } from '../../lib/game-day';
import * as rewards from '../rewards/service';
import { graceDaysFrom } from './events';

/**
 * The Vale Pass: a season, and the two-column track it pays out along (C38).
 *
 * It exists because of a gap nothing else in Mistvale fills. The campaign rewards clearing,
 * the Arena rewards a good team, the Titan rewards the best hour you had, and the Wurm
 * rewards turning up on a weekend — **nothing rewards coming back regularly**, which is the
 * one thing a live game most wants and the one thing this genre invented the pass for.
 *
 * Three decisions shape it.
 *
 * **The day's earning is capped.** Without a ceiling a heavy weekend finishes the whole
 * track and the remaining five weeks are decoration, which is the failure mode every pass
 * is shaped to avoid. It is a *rate* limit rather than a total — the same shape as the farm
 * allowance, the Titan's keys and the Arena's tokens — and it is **on the screen**, because
 * a ceiling nobody can see is indistinguishable from a feature that has stopped working.
 *
 * **The season's own track is bought with crystals**, which are fully earnable and are "a
 * pacing currency, not a paywall" (GAME_DESIGN §13). EA has no payments, so the honest
 * shape of a premium track here is a crystal price a player can reach by playing. It is per
 * *season*, which is what makes it a season rather than an upgrade bought once forever.
 *
 * **There is no cron.** The window is derived from the clock every time it is read, exactly
 * as an event's is, so a server that was down for a fortnight comes back with the right
 * season live and nothing to catch up on. Last season's row simply stops matching.
 */

type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * What the *reading* half needs. Split from the scoring half deliberately: the fan-out
 * carries a content-only context and must not be given a database handle it does not use,
 * because the compiler naming the difference is what keeps `ProgressService` free of every
 * subscriber's dependencies.
 */
export interface PassContext extends PassContentContext {
  db: Database;
}

/** What deciding *which* seasons are running needs, which is content and a clock. */
export interface PassContentContext {
  content: ContentCache;
}

interface VisiblePass {
  def: ValePassDef;
  window: EventWindow;
  /** Scoring right now. False while only the collection grace period is left. */
  live: boolean;
}

/**
 * Every season a player should see: the one running, plus one that has just shut and still
 * owes them something.
 *
 * The same rule as an event's, and for the same reason: somebody who finished the track on
 * the season's last evening and opened the game the next morning must not find it gone.
 * Sharing the *grace* number with events is deliberate — an operator who lengthens the
 * window for collecting after an event should not have to find a second knob for the pass.
 */
export function visiblePasses(ctx: PassContentContext, level: number, now: Date): VisiblePass[] {
  const bundle = ctx.content.current().bundle;
  const day = gameDayFrom(bundle.config, now);
  const grace = graceDaysFrom(bundle.config);

  return bundle.valePasses.flatMap<VisiblePass>((def) => {
    if (!def.active || level < def.unlockLevel) return [];

    const live = eventWindowAt(def.schedule, day.date, day.weekday, now);
    if (live) return [{ def, window: live, live: true }];

    for (let back = 1; back <= grace; back += 1) {
      const past = new Date(now.getTime() - back * 24 * 60 * 60 * 1000);
      const pastDay = gameDayFrom(bundle.config, past);
      const window = eventWindowAt(def.schedule, pastDay.date, pastDay.weekday, past);
      if (window && day.date <= claimsCloseOn(window, grace)) {
        return [{ def, window, live: false }];
      }
    }
    return [];
  });
}

/** Every season running right now that this account has reached — what the fan-out scores. */
export function livePasses(
  ctx: PassContentContext,
  level: number,
  now: Date,
): { def: ValePassDef; window: EventWindow }[] {
  return visiblePasses(ctx, level, now)
    .filter((entry) => entry.live)
    .map(({ def, window }) => ({ def, window }));
}

export async function overview(
  ctx: PassContext,
  playerId: string,
  now = new Date(),
): Promise<ValePassView> {
  const [player] = await ctx.db
    .select({ level: players.level })
    .from(players)
    .where(eq(players.id, playerId));
  if (!player) throw AppError.notFound('No such player.');

  const rows = await ctx.db.select().from(playerPasses).where(eq(playerPasses.playerId, playerId));
  return build(ctx, player.level, rows, now);
}

function build(
  ctx: PassContentContext,
  level: number,
  rows: (typeof playerPasses.$inferSelect)[],
  now: Date,
): ValePassView {
  const bundle = ctx.content.current().bundle;
  const today = gameDayFrom(bundle.config, now).date;
  const grace = graceDaysFrom(bundle.config);
  const held = new Map(rows.map((row) => [`${row.passKey}:${row.season}`, row]));
  let claimableTotal = 0;

  const passes: ValePassStanding[] = visiblePasses(ctx, level, now).map(({ def, window, live }) => {
    const row = held.get(`${def.key}:${window.anchor}`);
    const points = row?.points ?? 0;
    // A ceiling of zero opens the track to everybody, which is what makes the whole
    // premium column optional content rather than a mechanism an operator must use.
    const unlocked = def.unlockCost === 0 || (row?.unlocked ?? false);
    const free = new Set(row?.claimedFree ?? []);
    const premium = new Set(row?.claimedPremium ?? []);

    const tiers: ValePassTierStanding[] = def.tiers.map((tier, index) => {
      const reached = points >= tier.points;
      const freeTaken = free.has(index);
      const premiumTaken = premium.has(index);
      const hasPremium = Object.keys(tier.premium).length > 0;
      const hasFree = Object.keys(tier.free).length > 0;

      if (reached && hasFree && !freeTaken) claimableTotal += 1;
      if (reached && hasPremium && unlocked && !premiumTaken) claimableTotal += 1;

      return {
        index,
        points: tier.points,
        free: tier.free,
        premium: tier.premium,
        reached,
        freeClaimed: freeTaken,
        premiumClaimed: premiumTaken,
        // Locked only where there is something behind the lock. A tier with an empty
        // premium column is empty rather than withheld, and drawing it as treasure
        // would be the screen lying about what the purchase buys.
        premiumLocked: hasPremium && !unlocked,
      };
    });

    return {
      passKey: def.key,
      name: def.name,
      description: def.description,
      bannerAsset: def.bannerAsset,
      season: window.anchor,
      points,
      pointsToday: row?.pointsDay === today ? row.pointsToday : 0,
      dailyCap: def.dailyPointCap,
      live,
      endsOn: window.endsOn,
      claimsCloseOn: claimsCloseOn(window, grace),
      unlocked,
      unlockCost: def.unlockCost,
      rules: def.pointRules.map((rule) => ({
        label: rule.label || rule.type,
        points: rule.points,
      })),
      tiers,
      claimable: tiers.filter(
        (tier) =>
          tier.reached &&
          ((Object.keys(tier.free).length > 0 && !tier.freeClaimed) ||
            (Object.keys(tier.premium).length > 0 && unlocked && !tier.premiumClaimed)),
      ).length,
    };
  });

  return { today, passes, claimable: claimableTotal };
}

/** Tiers waiting to be collected — the dock's pip. One query. */
export async function claimableCount(
  ctx: PassContext,
  playerId: string,
  level: number,
  now = new Date(),
): Promise<number> {
  const rows = await ctx.db.select().from(playerPasses).where(eq(playerPasses.playerId, playerId));
  return build(ctx, level, rows, now).claimable;
}

// ── Claiming and taking up the track ────────────────────────────────────────

export interface PassResult {
  paid: Record<string, number>;
  levelsGained: number;
  pass: ValePassView;
}

/** Pays one tier of one column. */
export async function claimTier(
  ctx: PassContext,
  playerId: string,
  passKey: string,
  tier: number,
  track: ValePassTrack,
  actionId: string,
  now = new Date(),
): Promise<PassResult> {
  return ctx.db.transaction(async (tx) => {
    const level = await lockLevel(tx, playerId);
    const { def, window } = requireVisible(ctx, level, passKey, now);

    const rung = def.tiers[tier];
    if (!rung) throw AppError.notFound('No such tier.');
    const payout = track === 'free' ? rung.free : rung.premium;
    if (Object.keys(payout).length === 0) {
      throw new AppError('VALIDATION', 'That tier pays nothing on that track.');
    }

    const [row] = await tx
      .select()
      .from(playerPasses)
      .where(
        and(
          eq(playerPasses.playerId, playerId),
          eq(playerPasses.passKey, passKey),
          eq(playerPasses.season, window.anchor),
        ),
      )
      .for('update');

    const taken = new Set((track === 'free' ? row?.claimedFree : row?.claimedPremium) ?? []);
    if (row?.claimActionId === actionId && taken.has(tier)) {
      // A retried claim: answer as before, pay nothing again.
      return finish(ctx, tx, playerId, level, payout, 0, now);
    }
    if (taken.has(tier)) {
      throw new AppError('ALREADY_EXISTS', 'That reward is already collected.');
    }
    if ((row?.points ?? 0) < rung.points) {
      throw new AppError(
        'VALIDATION',
        `That tier needs ${rung.points} points — you have ${row?.points ?? 0}.`,
      );
    }
    // Checked here as well as drawn as locked, because the lock on the screen is politeness
    // and this is the rule: the whole premium column is what the crystals buy.
    if (track === 'premium' && def.unlockCost > 0 && !row?.unlocked) {
      throw new AppError('LOCKED_CONTENT', 'That track has not been taken up this season.');
    }

    taken.add(tier);
    const sorted = [...taken].sort((a, b) => a - b);
    // The row exists: points cannot have reached a tier without one. Updating by id rather
    // than upserting keeps that assumption visible instead of inventing a score.
    await tx
      .update(playerPasses)
      .set({
        ...(track === 'free' ? { claimedFree: sorted } : { claimedPremium: sorted }),
        claimActionId: actionId,
        updatedAt: now,
      })
      .where(eq(playerPasses.id, row!.id));

    const paid = await rewards.payRewards(
      tx,
      playerId,
      payout,
      `valePass:${passKey}:${track}:${tier}`,
      knownItem(ctx),
    );

    return finish(ctx, tx, playerId, level, paid.applied, paid.levelsGained, now);
  });
}

/**
 * Takes up the season's own track, for crystals.
 *
 * Nothing is paid out here — the tiers already reached become claimable and are collected
 * one at a time, exactly as they would have been. That is deliberate: paying out a backlog
 * inside the purchase would make one transaction that both spends and grants twenty
 * different things, and a failure halfway through it would be the worst kind to unpick.
 */
export async function unlock(
  ctx: PassContext,
  playerId: string,
  passKey: string,
  actionId: string,
  now = new Date(),
): Promise<PassResult> {
  return ctx.db.transaction(async (tx) => {
    const level = await lockLevel(tx, playerId);
    const { def, window, live } = requireVisible(ctx, level, passKey, now);

    if (def.unlockCost === 0) {
      throw new AppError('VALIDATION', 'This season’s track is open to everybody already.');
    }
    // A season already over cannot be bought into. The grace period is for collecting what
    // was earned, not for buying a track there is no longer any time to climb.
    if (!live) throw new AppError('LOCKED_CONTENT', 'That season is over.');

    const [row] = await tx
      .select()
      .from(playerPasses)
      .where(
        and(
          eq(playerPasses.playerId, playerId),
          eq(playerPasses.passKey, passKey),
          eq(playerPasses.season, window.anchor),
        ),
      )
      .for('update');

    if (row?.unlockActionId === actionId && row.unlocked) {
      return finish(ctx, tx, playerId, level, {}, 0, now);
    }
    if (row?.unlocked) throw new AppError('ALREADY_EXISTS', 'You already hold this track.');

    const [wallet] = await tx
      .select({ crystals: players.crystals })
      .from(players)
      .where(eq(players.id, playerId));
    if ((wallet?.crystals ?? 0) < def.unlockCost) {
      throw new AppError(
        'INSUFFICIENT_FUNDS',
        `That needs ${def.unlockCost} crystals — you have ${wallet?.crystals ?? 0}.`,
      );
    }

    await rewards.spend(tx, playerId, { crystals: def.unlockCost }, `valePass:${passKey}:unlock`);

    // Upserted rather than updated: a player may take up the track before earning a single
    // point, which is the whole reason somebody buys it on day one.
    await tx
      .insert(playerPasses)
      .values({
        playerId,
        passKey,
        season: window.anchor,
        unlocked: true,
        unlockActionId: actionId,
      })
      .onConflictDoUpdate({
        target: [playerPasses.playerId, playerPasses.passKey, playerPasses.season],
        set: { unlocked: true, unlockActionId: actionId, updatedAt: now },
      });

    return finish(ctx, tx, playerId, level, { crystals: -def.unlockCost }, 0, now);
  });
}

// ── Scoring ─────────────────────────────────────────────────────────────────

/**
 * Adds points to every running season, capped at what the day still allows.
 *
 * Called from `ProgressService.track`, under the player-row lock it already holds — which
 * is what makes the read-then-write below safe. An event's score is a bare SQL increment
 * because nothing bounds it; a season's cannot be, because how much of an award actually
 * lands depends on what today has already taken. The arithmetic is `pointsAllowedToday`,
 * which is shared so the fan-out and the test that proves a season cannot be rushed read
 * one rule.
 */
export async function score(
  tx: Executor,
  ctx: PassContentContext,
  playerId: string,
  earnedByPass: readonly { def: ValePassDef; window: EventWindow; points: number }[],
  now: Date,
): Promise<void> {
  if (earnedByPass.length === 0) return;
  const today = gameDayFrom(ctx.content.current().bundle.config, now).date;

  for (const { def, window, points } of earnedByPass) {
    const [row] = await tx
      .select({
        id: playerPasses.id,
        points: playerPasses.points,
        pointsToday: playerPasses.pointsToday,
        pointsDay: playerPasses.pointsDay,
      })
      .from(playerPasses)
      .where(
        and(
          eq(playerPasses.playerId, playerId),
          eq(playerPasses.passKey, def.key),
          eq(playerPasses.season, window.anchor),
        ),
      );

    // A stamp from an older day reads as zero, which is what rolls the ceiling over with no
    // reset job — `daily-counters.ts`'s rule on a counter that belongs to this row.
    const alreadyToday = row?.pointsDay === today ? row.pointsToday : 0;
    const granted = pointsAllowedToday(points, alreadyToday, def.dailyPointCap);
    if (granted <= 0) continue;

    if (row) {
      await tx
        .update(playerPasses)
        .set({
          points: row.points + granted,
          pointsToday: alreadyToday + granted,
          pointsDay: today,
          updatedAt: now,
        })
        .where(eq(playerPasses.id, row.id));
    } else {
      await tx.insert(playerPasses).values({
        playerId,
        passKey: def.key,
        season: window.anchor,
        points: granted,
        pointsToday: granted,
        pointsDay: today,
      });
    }
  }
}

// ── Shared bits ─────────────────────────────────────────────────────────────

async function lockLevel(tx: Executor, playerId: string): Promise<number> {
  const [player] = await tx
    .select({ level: players.level })
    .from(players)
    .where(eq(players.id, playerId))
    .for('update');
  if (!player) throw AppError.notFound('No such player.');
  return player.level;
}

/** The season a request names, or the honest reason it cannot be acted on. */
function requireVisible(
  ctx: PassContentContext,
  level: number,
  passKey: string,
  now: Date,
): VisiblePass {
  const visible = visiblePasses(ctx, level, now).find((entry) => entry.def.key === passKey);
  if (visible) return visible;
  // Over versus never published are different answers, and a player who spent a month on a
  // track deserves the first one.
  const known = ctx.content.current().bundle.valePasses.some((def) => def.key === passKey);
  throw known
    ? new AppError('LOCKED_CONTENT', 'That season is over.')
    : AppError.notFound('No such season.');
}

/** Re-reads the whole screen inside the transaction, so it cannot be stale. */
async function finish(
  ctx: PassContentContext,
  tx: Executor,
  playerId: string,
  level: number,
  paid: Record<string, number>,
  levelsGained: number,
  now: Date,
): Promise<PassResult> {
  const rows = await tx.select().from(playerPasses).where(eq(playerPasses.playerId, playerId));
  // A claim may have levelled the account, which can bring another season into view.
  const [player] = await tx
    .select({ level: players.level })
    .from(players)
    .where(eq(players.id, playerId));
  return { paid, levelsGained, pass: build(ctx, player?.level ?? level, rows, now) };
}

/** Whether a reward's item key is still in the published catalogue. */
function knownItem(ctx: PassContentContext): (itemKey: string) => boolean {
  const items = new Set(ctx.content.current().bundle.items.map((item) => item.key));
  return (itemKey) => items.has(itemKey);
}
