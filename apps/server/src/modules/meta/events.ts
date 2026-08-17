import { and, eq } from 'drizzle-orm';
import {
  claimsCloseOn,
  eventWindowAt,
  type EventDef,
  type EventMilestoneStanding,
  type EventStanding,
  type EventWindow,
  type EventsView,
} from '@mistvale/shared';
import { playerEvents, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import { gameDayFrom } from '../../lib/game-day';
import * as rewards from '../rewards/service';

/**
 * Timed events: what is worth doing this weekend, and what the ladder pays for it.
 *
 * There is no scheduler. An event's window is derived from the clock every time it is
 * asked for, so a server that was down all weekend comes back with exactly the right
 * events live and nothing to catch up on (docs/ARCHITECTURE.md §5.1).
 *
 * Scoring lives in `progress.ts` with the other two listeners; this module is what a player
 * sees and what a claim does.
 */

type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface EventContext {
  db: Database;
  content: ContentCache;
}

/** How long after an event shuts its milestones can still be collected. */
export function graceDaysFrom(config: Readonly<Record<string, unknown>>): number {
  const value = config['events.claimGraceDays'];
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 3;
}

/**
 * Every event a player should see: the ones running, plus the ones that have just shut and
 * still owe them something.
 *
 * The second half is the whole reason this is not simply "events where now is inside the
 * window". Somebody who finished a ladder on Sunday evening and opened the game on Monday
 * must not find it gone — the work was done, and taking it back over a scheduling boundary
 * teaches people not to bother next time.
 */
interface VisibleEvent {
  def: EventDef;
  window: EventWindow;
  /** Scoring right now. False while only the claim grace period is left. */
  live: boolean;
}

function visibleEvents(ctx: EventContext, level: number, now: Date): VisibleEvent[] {
  const bundle = ctx.content.current().bundle;
  const day = gameDayFrom(bundle.config, now);
  const grace = graceDaysFrom(bundle.config);

  return bundle.events.flatMap<VisibleEvent>((def) => {
    if (!def.active || level < def.unlockLevel) return [];

    const live = eventWindowAt(def.schedule, day.date, day.weekday, now);
    if (live) return [{ def, window: live, live: true }];

    // Not running. Walk back through the grace period a day at a time and ask the same
    // question of each — which finds the occurrence that just ended without needing a
    // second, subtly different piece of schedule arithmetic to maintain.
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

export async function overview(
  ctx: EventContext,
  playerId: string,
  now = new Date(),
): Promise<EventsView> {
  const [player] = await ctx.db
    .select({ level: players.level })
    .from(players)
    .where(eq(players.id, playerId));
  if (!player) throw AppError.notFound('No such player.');

  const rows = await ctx.db.select().from(playerEvents).where(eq(playerEvents.playerId, playerId));
  return build(ctx, player.level, rows, now);
}

function build(
  ctx: EventContext,
  level: number,
  rows: (typeof playerEvents.$inferSelect)[],
  now: Date,
): EventsView {
  const bundle = ctx.content.current().bundle;
  const held = new Map(rows.map((row) => [`${row.eventKey}:${row.occurrence}`, row]));
  const grace = graceDaysFrom(bundle.config);
  let claimableTotal = 0;

  const events: EventStanding[] = visibleEvents(ctx, level, now).map(({ def, window, live }) => {
    const row = held.get(`${def.key}:${window.anchor}`);
    const points = row?.points ?? 0;
    const claimed = new Set(row?.claimedMilestones ?? []);

    const milestones: EventMilestoneStanding[] = def.milestones.map((entry, index) => {
      const reached = points >= entry.points;
      const taken = claimed.has(index);
      if (reached && !taken) claimableTotal += 1;
      return {
        index,
        points: entry.points,
        rewards: entry.rewards,
        reached,
        claimed: taken,
      };
    });

    return {
      eventKey: def.key,
      name: def.name,
      description: def.description,
      bannerAsset: def.bannerAsset,
      occurrence: window.anchor,
      points,
      live,
      endsOn: window.endsOn,
      claimsCloseOn: claimsCloseOn(window, grace),
      rules: def.pointRules.map((rule) => ({
        label: rule.label || rule.type,
        points: rule.points,
      })),
      milestones,
      claimable: milestones.filter((entry) => entry.reached && !entry.claimed).length,
    };
  });

  return {
    today: gameDayFrom(bundle.config, now).date,
    events,
    claimable: claimableTotal,
  };
}

/** Milestones waiting to be collected — the dock's pip. One query. */
export async function claimableCount(
  ctx: EventContext,
  playerId: string,
  level: number,
  now = new Date(),
): Promise<number> {
  const rows = await ctx.db.select().from(playerEvents).where(eq(playerEvents.playerId, playerId));
  return build(ctx, level, rows, now).claimable;
}

// ── Claiming ────────────────────────────────────────────────────────────────

export interface ClaimResult {
  paid: Record<string, number>;
  levelsGained: number;
  events: EventsView;
}

/** Pays one milestone of one event's current occurrence. */
export async function claimMilestone(
  ctx: EventContext,
  playerId: string,
  eventKey: string,
  milestone: number,
  actionId: string,
  now = new Date(),
): Promise<ClaimResult> {
  return ctx.db.transaction(async (tx) => {
    const [player] = await tx
      .select({ level: players.level })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');

    const visible = visibleEvents(ctx, player.level, now).find(
      (entry) => entry.def.key === eventKey,
    );
    // Not running and past its grace: the honest answer is that it is over, not that the
    // event never existed.
    if (!visible) {
      const known = ctx.content.current().bundle.events.some((def) => def.key === eventKey);
      throw known
        ? new AppError('LOCKED_CONTENT', 'That event is over.')
        : AppError.notFound('No such event.');
    }

    const { def, window } = visible;
    const rung = def.milestones[milestone];
    if (!rung) throw AppError.notFound('No such milestone.');

    const [row] = await tx
      .select()
      .from(playerEvents)
      .where(
        and(
          eq(playerEvents.playerId, playerId),
          eq(playerEvents.eventKey, eventKey),
          eq(playerEvents.occurrence, window.anchor),
        ),
      )
      .for('update');

    const claimed = new Set(row?.claimedMilestones ?? []);
    if (row?.claimActionId === actionId && claimed.has(milestone)) {
      // A retried claim: answer as before, pay nothing again.
      return finish(ctx, tx, playerId, player.level, rung.rewards, 0, now);
    }
    if (claimed.has(milestone)) {
      throw new AppError('ALREADY_EXISTS', 'That milestone is already claimed.');
    }
    if ((row?.points ?? 0) < rung.points) {
      throw new AppError(
        'VALIDATION',
        `That needs ${rung.points} points — you have ${row?.points ?? 0}.`,
      );
    }

    claimed.add(milestone);
    // The row exists: points cannot have reached the milestone without one. Updating by id
    // rather than upserting keeps that assumption visible instead of quietly creating a
    // score out of nowhere.
    await tx
      .update(playerEvents)
      .set({
        claimedMilestones: [...claimed].sort((a, b) => a - b),
        claimActionId: actionId,
        updatedAt: now,
      })
      .where(eq(playerEvents.id, row!.id));

    const paid = await rewards.payRewards(
      tx,
      playerId,
      rung.rewards,
      `event:${eventKey}:${milestone}`,
      knownItem(ctx),
    );

    return finish(ctx, tx, playerId, player.level, paid.applied, paid.levelsGained, now);
  });
}

/** Re-reads the whole screen inside the claim's transaction, so it cannot be stale. */
async function finish(
  ctx: EventContext,
  tx: Executor,
  playerId: string,
  level: number,
  paid: Record<string, number>,
  levelsGained: number,
  now: Date,
): Promise<ClaimResult> {
  const rows = await tx.select().from(playerEvents).where(eq(playerEvents.playerId, playerId));
  // The claim may have levelled the account, which can bring another event into view.
  const [player] = await tx
    .select({ level: players.level })
    .from(players)
    .where(eq(players.id, playerId));
  return { paid, levelsGained, events: build(ctx, player?.level ?? level, rows, now) };
}

/** Whether a reward's item key is still in the published catalogue. */
function knownItem(ctx: EventContext): (itemKey: string) => boolean {
  const items = new Set(ctx.content.current().bundle.items.map((item) => item.key));
  return (itemKey) => items.has(itemKey);
}
