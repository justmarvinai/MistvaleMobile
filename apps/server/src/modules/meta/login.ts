import { randomInt } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createRng } from '@mistvale/engine';
import {
  type GearInstance,
  type LoginDayStanding,
  type LoginTrackDef,
  type LoginTrackKind,
  type LoginTrackStanding,
  type LoginView,
} from '@mistvale/shared';
import { loginClaims, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import { gameDayFrom } from '../../lib/game-day';
import { createGearBatch, gearContextFrom, toDto } from '../gear/service';
import * as rewards from '../rewards/service';
import { grantChampion } from '../roster/service';

/**
 * The login calendar, and the newcomer track beside it.
 *
 * Two tracks, one rule: **the Nth claim pays the day numbered N.** A player who misses a
 * Tuesday loses that Tuesday's tile and not their place in the track — which is what makes
 * this a reward for showing up rather than a punishment for a holiday, and which also means
 * there is nothing here to reset at 04:00. The whole track's state is `count(*)` over the
 * claims plus "did one of them happen today", both derived on read
 * (docs/ARCHITECTURE.md §5.1).
 *
 * The calendar cycles forever; the welcome track runs once and is then finished for good.
 * That is the only behavioural difference between them, and it lives in one branch.
 */

type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface LoginContext {
  db: Database;
  content: ContentCache;
}

/** The account level the calendar opens at. */
export function unlockLevelFrom(config: Readonly<Record<string, unknown>>): number {
  const value = config['unlocks.loginCalendarLevel'];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}

/** A fresh 32-bit seed. A welcome relic must not be predictable from anything. */
function freshSeed(): number {
  return randomInt(0, 2 ** 31 - 1);
}

/**
 * The live track of each kind.
 *
 * Publish validation refuses two active tracks of a kind, so `find` is exact rather than
 * arbitrary — but it is still `find` and not an assertion, because content published before
 * that rule existed must degrade to "the first one" rather than to a 500.
 */
function liveTrack(ctx: LoginContext, kind: LoginTrackKind): LoginTrackDef | undefined {
  return ctx.content
    .current()
    .bundle.loginTracks.find((def) => def.active && def.track === kind && def.days.length > 0);
}

/** The definition's days, in the order the Nth claim walks them. */
function orderedDays(def: LoginTrackDef): LoginTrackDef['days'] {
  return [...def.days].sort((a, b) => a.day - b.day);
}

/**
 * Where a track stands, from nothing but its claims.
 *
 * `claimsMade` is the whole state. Everything the screen shows — which cycle, which tile is
 * next, whether today is spent — falls out of it and the day the last claim landed on.
 *
 * Exported because it is the arithmetic worth pinning on its own: a cycle that wraps wrong
 * is invisible for twenty-nine days.
 */
export function standingOf(
  def: LoginTrackDef,
  claims: (typeof loginClaims.$inferSelect)[],
  today: string,
): LoginTrackStanding {
  const days = orderedDays(def);
  const claimsMade = claims.length;
  const claimedToday = claims.some((row) => row.claimedOn === today);

  // The welcome track stops at its end; the calendar wraps and starts the next cycle.
  const finished = def.track === 'welcome' && claimsMade >= days.length;
  const position = finished ? days.length : claimsMade % days.length;
  const cycle = Math.floor(claimsMade / days.length) + (finished ? 0 : 1);

  const standings: LoginDayStanding[] = days.map((entry, index) => ({
    day: entry.day,
    rewards: entry.rewards,
    champions: entry.grants.champions,
    choices: entry.grants.choices,
    relicCount: entry.grants.relics.length,
    // Claimed *in the cycle being shown*: on a fresh cycle nothing is, which is the point
    // of a calendar that comes round again.
    claimed: index < position,
    next: !finished && index === position && !claimedToday,
  }));

  return {
    trackKey: def.key,
    track: def.track,
    name: def.name,
    description: def.description,
    days: standings,
    cycle,
    claimsMade,
    claimedToday,
    finished,
    claimable: !finished && !claimedToday,
  };
}

function build(
  ctx: LoginContext,
  level: number,
  rows: (typeof loginClaims.$inferSelect)[],
  now: Date,
): LoginView {
  const bundle = ctx.content.current().bundle;
  const today = gameDayFrom(bundle.config, now).date;
  const unlockLevel = unlockLevelFrom(bundle.config);
  const unlocked = level >= unlockLevel;

  const of = (kind: LoginTrackKind): LoginTrackStanding | null => {
    const def = liveTrack(ctx, kind);
    if (!def) return null;
    return standingOf(
      def,
      rows.filter((row) => row.track === kind),
      today,
    );
  };

  const calendar = of('calendar');
  const welcome = of('welcome');
  // A finished welcome track is not shown at all — it is a newcomer's first week, and
  // leaving a spent strip on the screen forever would be clutter pretending to be content.
  const visibleWelcome = welcome?.finished ? null : welcome;

  return {
    today,
    unlocked,
    unlockLevel,
    calendar,
    welcome: visibleWelcome,
    // A shrouded dock entry must not carry a pip: it would be pointing at a door the
    // player cannot open yet.
    claimable: unlocked ? [calendar, visibleWelcome].filter((track) => track?.claimable).length : 0,
  };
}

export async function overview(
  ctx: LoginContext,
  playerId: string,
  now = new Date(),
): Promise<LoginView> {
  const [player] = await ctx.db
    .select({ level: players.level })
    .from(players)
    .where(eq(players.id, playerId));
  if (!player) throw AppError.notFound('No such player.');

  const rows = await ctx.db.select().from(loginClaims).where(eq(loginClaims.playerId, playerId));
  return build(ctx, player.level, rows, now);
}

/** Tracks with a day waiting — the dock's pip. One query. */
export async function claimableCount(
  ctx: LoginContext,
  playerId: string,
  level: number,
  now = new Date(),
): Promise<number> {
  const rows = await ctx.db.select().from(loginClaims).where(eq(loginClaims.playerId, playerId));
  return build(ctx, level, rows, now).claimable;
}

// ── Claiming ────────────────────────────────────────────────────────────────

export interface ClaimResult {
  day: number;
  paid: Record<string, number>;
  champions: string[];
  relics: GearInstance[];
  levelsGained: number;
  login: LoginView;
}

/**
 * Takes the next day of one track.
 *
 * The day paid is decided by how many claims came before it, inside the transaction and
 * under the player's row lock — so two tabs racing the same tile cannot both take day 7,
 * and the unique index on `(player, track, day claimed on)` is the backstop that would
 * catch it if the lock ever moved.
 */
export async function claim(
  ctx: LoginContext,
  playerId: string,
  track: LoginTrackKind,
  actionId: string,
  choice: string | undefined,
  now = new Date(),
): Promise<ClaimResult> {
  return ctx.db.transaction(async (tx) => {
    const [player] = await tx
      .select({ level: players.level })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');

    const unlockLevel = unlockLevelFrom(ctx.content.current().bundle.config);
    if (player.level < unlockLevel) {
      throw new AppError(
        'LOCKED_CONTENT',
        `The calendar opens at account level ${unlockLevel}. Nothing is lost by waiting — it pays its first day whenever you take it.`,
      );
    }

    const def = liveTrack(ctx, track);
    if (!def) throw AppError.notFound('There is no such track running.');

    const bundle = ctx.content.current().bundle;
    const today = gameDayFrom(bundle.config, now).date;
    const rows = await tx.select().from(loginClaims).where(eq(loginClaims.playerId, playerId));
    const mine = rows.filter((row) => row.track === track);

    const todays = mine.find((row) => row.claimedOn === today);
    if (todays) {
      const day = orderedDays(def).find((entry) => entry.day === todays.day);
      // A retried claim: answer as before, pay nothing again.
      if (todays.claimActionId === actionId) {
        return finish(
          ctx,
          tx,
          playerId,
          player.level,
          todays.day,
          day?.rewards ?? {},
          [],
          [],
          0,
          now,
        );
      }
      throw new AppError('ALREADY_EXISTS', 'You have already collected today on that track.');
    }

    const standing = standingOf(def, mine, today);
    if (standing.finished) {
      throw new AppError('LOCKED_CONTENT', 'That track is finished.');
    }

    const days = orderedDays(def);
    const entry = days[mine.length % days.length];
    if (!entry) throw AppError.internal('The track has no day to give.');

    // A selector day needs a pick, and a plain day must not accept one — silently ignoring
    // an unexpected `choice` is how a client bug becomes an unexplained missing champion.
    const champions = [...entry.grants.champions];
    if (entry.grants.choices.length > 0) {
      if (!choice || !entry.grants.choices.includes(choice)) {
        throw new AppError('VALIDATION', 'Pick one of the champions this day offers.');
      }
      champions.push(choice);
    } else if (choice) {
      throw new AppError('VALIDATION', 'That day is not a choice.');
    }

    await tx.insert(loginClaims).values({
      playerId,
      track,
      day: entry.day,
      claimedOn: today,
      claimActionId: actionId,
    });

    const paid = await rewards.payRewards(
      tx,
      playerId,
      entry.rewards,
      `login:${track}:${entry.day}`,
      knownItem(ctx),
    );

    for (const championKey of champions) {
      try {
        await grantChampion(tx, playerId, championKey, {}, ctx.content.current().bundle.champions);
      } catch (cause) {
        if (cause instanceof AppError && cause.code === 'ROSTER_FULL') {
          throw new AppError(
            'ROSTER_FULL',
            'Your roster is full. Make room, then collect today — the champion is waiting.',
          );
        }
        throw cause;
      }
    }

    const relics = await grantRelics(ctx, tx, playerId, entry.grants.relics, track, entry.day);

    return finish(
      ctx,
      tx,
      playerId,
      player.level + paid.levelsGained,
      entry.day,
      paid.applied,
      champions,
      relics,
      paid.levelsGained,
      now,
    );
  });
}

/** Rolls and hands over a day's relics, if it has any. */
async function grantRelics(
  ctx: LoginContext,
  tx: Executor,
  playerId: string,
  requests: LoginTrackDef['days'][number]['grants']['relics'],
  track: LoginTrackKind,
  day: number,
): Promise<GearInstance[]> {
  if (requests.length === 0) return [];

  const bundle = ctx.content.current().bundle;
  const context = gearContextFrom(bundle);
  const source = `login:${track}:${day}`;
  const created = await createGearBatch(
    tx,
    playerId,
    requests.map((relic) => ({ ...relic, source })),
    createRng(freshSeed()),
    context,
  );
  return created.map((row) => toDto(row, context));
}

/** Re-reads the whole screen inside the claim's transaction, so it cannot be stale. */
async function finish(
  ctx: LoginContext,
  tx: Executor,
  playerId: string,
  level: number,
  day: number,
  paid: Record<string, number>,
  champions: string[],
  relics: GearInstance[],
  levelsGained: number,
  now: Date,
): Promise<ClaimResult> {
  const rows = await tx.select().from(loginClaims).where(eq(loginClaims.playerId, playerId));
  return { day, paid, champions, relics, levelsGained, login: build(ctx, level, rows, now) };
}

/** Whether a reward's item key is still in the published catalogue. */
function knownItem(ctx: LoginContext): (itemKey: string) => boolean {
  const items = new Set(ctx.content.current().bundle.items.map((item) => item.key));
  return (itemKey) => items.has(itemKey);
}
