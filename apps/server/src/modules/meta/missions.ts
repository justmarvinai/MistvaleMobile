import { and, eq } from 'drizzle-orm';
import {
  type GoalProgress,
  type MissionArc,
  type MissionDef,
  type MissionStanding,
  type MissionsView,
} from '@mistvale/shared';
import { playerMissions, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import * as rewards from '../rewards/service';
import { grantChampion } from '../roster/service';
import { missionComplete } from './progress';

/**
 * The Valewarden's Path.
 *
 * Eighty steps in arcs of eight, walked once. Arcs open in order and the eight inside one
 * are open together, which is the compromise that makes the chain a *path* without making
 * it a wall: a player who cannot do "reach Silver in the Arena" tonight still has seven
 * other things in front of them.
 *
 * Progress accrues on every active mission regardless of arc (see `advanceMissions`); this
 * module decides only what may be *claimed*. That separation is what lets somebody who
 * farmed two hundred Depths floors in arc 4 find arc 8 already half done.
 */

type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface MissionContext {
  db: Database;
  content: ContentCache;
}

// ── Reading ─────────────────────────────────────────────────────────────────

export async function overview(ctx: MissionContext, playerId: string): Promise<MissionsView> {
  const rows = await ctx.db
    .select()
    .from(playerMissions)
    .where(eq(playerMissions.playerId, playerId));
  const [player] = await ctx.db
    .select({ title: players.title })
    .from(players)
    .where(eq(players.id, playerId));
  if (!player) throw AppError.notFound('No such player.');

  return build(ctx, rows, player.title);
}

/** Missions grouped by arc, in step order. */
function arcsOf(ctx: MissionContext): Map<number, MissionDef[]> {
  const arcs = new Map<number, MissionDef[]>();
  for (const def of ctx.content.current().bundle.missions) {
    if (!def.active) continue;
    const steps = arcs.get(def.arc) ?? [];
    steps.push(def);
    arcs.set(def.arc, steps);
  }
  for (const steps of arcs.values()) steps.sort((a, b) => a.step - b.step);
  return new Map([...arcs.entries()].sort((a, b) => a[0] - b[0]));
}

function build(
  ctx: MissionContext,
  rows: (typeof playerMissions.$inferSelect)[],
  title: string | null,
): MissionsView {
  const held = new Map(rows.map((row) => [row.missionKey, row]));
  const arcs: MissionArc[] = [];

  // Arcs open in order: the first one is always open, and each later one opens when the
  // one before it is entirely claimed. Walking them in order is what makes that a single
  // pass rather than a lookup per arc.
  let previousFinished = true;
  let currentArc = 0;
  let claimedTotal = 0;
  let total = 0;
  let claimable = 0;

  for (const [arc, steps] of arcsOf(ctx)) {
    const open = previousFinished;
    const claimedSteps = steps.filter((def) => held.get(def.key)?.claimedAt).length;
    const finished = claimedSteps === steps.length;

    const missions: MissionStanding[] = steps.map((def) => {
      const row = held.get(def.key);
      const progress = def.goals.map((_, index) => row?.progress[index] ?? 0);
      const claimed = Boolean(row?.claimedAt);
      const complete = missionComplete(def, progress);
      if (open && complete && !claimed) claimable += 1;

      return {
        missionKey: def.key,
        goals: def.goals.map<GoalProgress>((goal, index) => ({
          goal,
          progress: progress[index] ?? 0,
          complete: (progress[index] ?? 0) >= goal.target,
        })),
        complete,
        claimed,
        rewards: def.rewards,
        grantsChampions: def.grants.champions,
        grantsTitle: def.grants.title,
        claimable: open && complete && !claimed,
      };
    });

    arcs.push({
      arc,
      name: steps[0]?.arcName ?? `Arc ${arc}`,
      open,
      finished,
      claimedSteps,
      totalSteps: steps.length,
      missions,
    });

    claimedTotal += claimedSteps;
    total += steps.length;
    if (currentArc === 0 && !finished) currentArc = arc;
    previousFinished = finished;
  }

  return {
    arcs,
    // Every arc finished: the Path is walked. Point at the last one rather than at nothing,
    // so the screen has somewhere to land.
    currentArc: currentArc || (arcs.at(-1)?.arc ?? 1),
    claimedTotal,
    total,
    claimable,
    title,
  };
}

/** How many steps are waiting to be claimed — the dock's pip. One query. */
export async function claimableCount(ctx: MissionContext, playerId: string): Promise<number> {
  const rows = await ctx.db
    .select()
    .from(playerMissions)
    .where(eq(playerMissions.playerId, playerId));
  return build(ctx, rows, null).claimable;
}

// ── Claiming ────────────────────────────────────────────────────────────────

export interface ClaimResult {
  paid: Record<string, number>;
  champions: string[];
  title: string | null;
  levelsGained: number;
  arcCompleted: boolean;
  missions: MissionsView;
}

/**
 * Pays one finished step, and hands over whatever it grants.
 *
 * A step can grant a champion the Mistgate will never roll — that is how the exclusive
 * Legendary at the end of the Path exists at all — so the grant happens inside the claim's
 * transaction alongside the payout. A claim that paid the crystals and lost the champion
 * would be the single worst bug in the game.
 */
export async function claim(
  ctx: MissionContext,
  playerId: string,
  missionKey: string,
  actionId: string,
  now = new Date(),
): Promise<ClaimResult> {
  return ctx.db.transaction(async (tx) => {
    const [player] = await tx
      .select({ title: players.title })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');

    const def = ctx.content
      .current()
      .bundle.missions.find((entry) => entry.key === missionKey && entry.active);
    if (!def) throw AppError.notFound('No such mission.');

    const rows = await tx
      .select()
      .from(playerMissions)
      .where(eq(playerMissions.playerId, playerId));
    const view = build(ctx, rows, player.title);
    const standing = view.arcs
      .flatMap((arc) => arc.missions)
      .find((entry) => entry.missionKey === missionKey);
    if (!standing) throw AppError.notFound('No such mission.');

    const [row] = await tx
      .select()
      .from(playerMissions)
      .where(and(eq(playerMissions.playerId, playerId), eq(playerMissions.missionKey, missionKey)));

    if (row?.claimActionId === actionId) {
      // A retried claim: answer as before, pay nothing again.
      return finish(ctx, tx, playerId, def.rewards, def.grants.champions, 0, false);
    }
    if (row?.claimedAt) throw new AppError('ALREADY_EXISTS', 'That one is already claimed.');
    if (!standing.complete) throw new AppError('VALIDATION', 'That mission is not finished yet.');
    if (!standing.claimable) {
      const arc = view.arcs.find((entry) =>
        entry.missions.some((m) => m.missionKey === missionKey),
      );
      throw new AppError(
        'LOCKED_CONTENT',
        `Finish “${view.arcs.find((entry) => !entry.finished && entry.open)?.name ?? 'the arc before it'}” before ${arc?.name ?? 'this arc'} opens.`,
      );
    }

    await tx
      .update(playerMissions)
      .set({ claimedAt: now, claimActionId: actionId, updatedAt: now })
      .where(eq(playerMissions.id, row!.id));

    const paid = await rewards.payRewards(
      tx,
      playerId,
      def.rewards,
      `mission:${missionKey}`,
      knownItem(ctx),
    );

    // The champion, then the title — both after the row is marked claimed, so a failure
    // anywhere rolls the whole claim back rather than leaving a step spent for nothing.
    const champions: string[] = [];
    for (const championKey of def.grants.champions) {
      try {
        await grantChampion(tx, playerId, championKey);
        champions.push(championKey);
      } catch (cause) {
        // A full roster must not swallow the reward of an eighty-step chain.
        if (cause instanceof AppError && cause.code === 'ROSTER_FULL') {
          throw new AppError(
            'ROSTER_FULL',
            'Your roster is full. Make room, then claim this — the reward is waiting.',
          );
        }
        throw cause;
      }
    }

    if (def.grants.title) {
      await tx
        .update(players)
        .set({ title: def.grants.title, updatedAt: now })
        .where(eq(players.id, playerId));
    }

    // Did this close the arc? Worth telling the client, because opening the next one is
    // the moment the screen has something to celebrate.
    const arcBefore = view.arcs.find((entry) => entry.arc === def.arc);
    const arcCompleted = (arcBefore?.claimedSteps ?? 0) + 1 === (arcBefore?.totalSteps ?? 0);

    return finish(
      ctx,
      tx,
      playerId,
      paid.applied,
      champions,
      paid.levelsGained,
      arcCompleted,
      def.grants.title || null,
    );
  });
}

/** Re-reads the whole screen inside the claim's transaction, so it cannot be stale. */
async function finish(
  ctx: MissionContext,
  tx: Executor,
  playerId: string,
  paid: Record<string, number>,
  champions: string[],
  levelsGained: number,
  arcCompleted: boolean,
  title: string | null = null,
): Promise<ClaimResult> {
  const rows = await tx.select().from(playerMissions).where(eq(playerMissions.playerId, playerId));
  const [player] = await tx
    .select({ title: players.title })
    .from(players)
    .where(eq(players.id, playerId));

  return {
    paid,
    champions,
    title,
    levelsGained,
    arcCompleted,
    missions: build(ctx, rows, player?.title ?? null),
  };
}

/** Whether a reward's item key is still in the published catalogue. */
function knownItem(ctx: MissionContext): (itemKey: string) => boolean {
  const items = new Set(ctx.content.current().bundle.items.map((item) => item.key));
  return (itemKey) => items.has(itemKey);
}
