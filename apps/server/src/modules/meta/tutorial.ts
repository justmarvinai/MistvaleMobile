import { randomInt } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { createRng } from '@mistvale/engine';
import {
  advanceGoal,
  goalMatches,
  type GearInstance,
  type GoalEvent,
  type TutorialStanding,
  type TutorialStepDef,
  type TutorialView,
} from '@mistvale/shared';
import { gearInstances, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import { createGearBatch, gearContextFrom, toDto } from '../gear/service';
import * as rewards from '../rewards/service';

/**
 * The scripted tutorial (CONTENT_PLAN §7).
 *
 * Strictly one step at a time, and each step's completion condition is **a goal** — the
 * same `{type, target, filters}` a quest, a mission and an event milestone use. That makes
 * the tutorial the fourth subscriber to `ProgressService.track` rather than a parallel
 * mechanism that has to be told about battles and summons separately, and it means "the
 * step where you equip a relic" is authored exactly like "the daily where you equip a
 * relic". The goal DSL predicted this listener by name a phase before it existed.
 *
 * A step with no goal is a *beat*: the Wardenmaster says something and the player presses
 * on. Most of the script is beats — the tutorial's job is mostly to point at things.
 *
 * State is four columns on the player row rather than a table — where the player is, how
 * far into that step, the action that completed the last one, and whether they left. Since
 * exactly one step is ever open, a row per step would be a join to answer something the
 * player row already holds.
 */

type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface TutorialContext {
  db: Database;
  content: ContentCache;
}

/** Facts the view needs, however they were read. */
export interface TutorialState {
  tutorialStep: number;
  tutorialProgress: number;
  tutorialSkipped: boolean;
}

/** The script, in order, with anything deactivated left out. */
export function script(content: ContentCache): TutorialStepDef[] {
  return [...content.current().bundle.tutorialSteps]
    .filter((def) => def.active)
    .sort((a, b) => a.step - b.step);
}

/** The step a player is on, or undefined once they are past the end. */
function stepAt(steps: TutorialStepDef[], step: number): TutorialStepDef | undefined {
  // Positional rather than keyed on `step`: an operator who renumbers a script must not
  // strand everybody mid-way through it on a number that no longer exists.
  return steps[step];
}

export function build(ctx: TutorialContext, state: TutorialState): TutorialView {
  const steps = script(ctx.content);
  const def = state.tutorialSkipped ? undefined : stepAt(steps, state.tutorialStep);

  if (!def) {
    return {
      current: null,
      finished: !state.tutorialSkipped && state.tutorialStep >= steps.length,
      skipped: state.tutorialSkipped,
    };
  }

  const progress = state.tutorialProgress;
  const current: TutorialStanding = {
    step: state.tutorialStep + 1,
    total: steps.length,
    screen: def.screen,
    highlight: def.highlight,
    title: def.title,
    body: def.body,
    portrait: def.portrait,
    sound: def.sound,
    ...(def.goal ? { goal: def.goal } : {}),
    progress,
    // A beat is ready the moment it opens; a goal step when its target is met.
    ready: !def.goal || progress >= def.goal.target,
    rewards: def.rewards,
  };

  return { current, finished: false, skipped: false };
}

export async function overview(ctx: TutorialContext, playerId: string): Promise<TutorialView> {
  const state = await read(ctx.db, playerId);
  return build(ctx, state);
}

async function read(db: Database | Executor, playerId: string): Promise<TutorialState> {
  const [row] = await db
    .select({
      tutorialStep: players.tutorialStep,
      tutorialProgress: players.tutorialProgress,
      tutorialSkipped: players.tutorialSkipped,
    })
    .from(players)
    .where(eq(players.id, playerId));
  if (!row) throw AppError.notFound('No such player.');
  return row;
}

// ── The subscriber ──────────────────────────────────────────────────────────

/**
 * Advances the open step's goal, if the reports touch it.
 *
 * Called from `ProgressService.track` inside whatever transaction reported the activity,
 * under the player lock it already takes — so a battle settling while a summon lands
 * cannot lose one of the two. Writes only when something actually moved.
 */
export async function advanceTutorial(
  tx: Executor,
  ctx: { content: ContentCache },
  playerId: string,
  reports: readonly GoalEvent[],
  now: Date,
): Promise<void> {
  const state = await read(tx, playerId);
  if (state.tutorialSkipped) return;

  const def = stepAt(script(ctx.content), state.tutorialStep);
  if (!def?.goal) return;

  let progress = state.tutorialProgress;
  for (const report of reports) {
    if (!goalMatches(def.goal, report)) continue;
    progress = advanceGoal(def.goal, progress, report);
  }
  if (progress === state.tutorialProgress) return;

  await tx
    .update(players)
    .set({ tutorialProgress: Math.min(progress, def.goal.target), updatedAt: now })
    .where(eq(players.id, playerId));
}

// ── Advancing ───────────────────────────────────────────────────────────────

export interface AdvanceResult {
  paid: Record<string, number>;
  /** Relics the opening step handed over, ready to show before the overlay moves on. */
  relics: GearInstance[];
  levelsGained: number;
  tutorial: TutorialView;
}

/**
 * Completes the open step and opens the next.
 *
 * Pays the step's rewards, then hands over whatever the *next* step needs before it asks
 * for it — `grantsBefore` and `grantsRelics` are how "here are two sigils, now go and pull"
 * and "here is a relic, now put it on" are one step each rather than two.
 *
 * A retried advance replays what it paid rather than paying twice, relics included: the
 * pieces are read back by the source they were stamped with rather than rolled again, so
 * a dropped response cannot turn one relic into two or into a different one.
 */
export async function advance(
  ctx: TutorialContext,
  playerId: string,
  actionId: string,
  now = new Date(),
): Promise<AdvanceResult> {
  return ctx.db.transaction(async (tx) => {
    const [player] = await tx
      .select({
        tutorialStep: players.tutorialStep,
        tutorialProgress: players.tutorialProgress,
        tutorialSkipped: players.tutorialSkipped,
        tutorialActionId: players.tutorialActionId,
      })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');

    const steps = script(ctx.content);
    const def = stepAt(steps, player.tutorialStep);

    if (player.tutorialActionId === actionId) {
      // A retried advance: answer as before, pay nothing again. The step it completed is
      // the one *behind* the cursor now, and the step it opened — the one the cursor is on
      // — is where the `grantsBefore` went, so the two together are what the first response
      // said. Rebuilt rather than stored: the only thing that has to survive a retry is
      // "was this action already applied", and that is one column rather than a payload.
      return finish(
        ctx,
        tx,
        playerId,
        sum(stepAt(steps, player.tutorialStep - 1)?.rewards, def?.grantsBefore),
        def ? await relicsFrom(ctx, tx, playerId, def) : [],
        0,
      );
    }
    if (player.tutorialSkipped) throw new AppError('LOCKED_CONTENT', 'The tutorial is over.');
    if (!def) throw new AppError('LOCKED_CONTENT', 'The tutorial is finished.');
    if (def.goal && player.tutorialProgress < def.goal.target) {
      throw new AppError('VALIDATION', 'That step is not finished yet.');
    }

    const paid = await rewards.payRewards(
      tx,
      playerId,
      def.rewards,
      `tutorial:${def.key}`,
      knownItem(ctx),
    );

    // What the next step needs, before it asks. Paid separately so the ledger says which
    // step handed it over rather than folding it into the one being completed.
    const next = stepAt(steps, player.tutorialStep + 1);
    let granted = { applied: {} as Record<string, number>, levelsGained: 0 };
    if (next && Object.keys(next.grantsBefore).length > 0) {
      granted = await rewards.payRewards(
        tx,
        playerId,
        next.grantsBefore,
        `tutorial:${next.key}:grant`,
        knownItem(ctx),
      );
    }
    const relics = next ? await grantRelics(ctx, tx, playerId, next) : [];

    await tx
      .update(players)
      .set({
        tutorialStep: player.tutorialStep + 1,
        tutorialProgress: 0,
        tutorialActionId: actionId,
        updatedAt: now,
      })
      .where(eq(players.id, playerId));

    return finish(
      ctx,
      tx,
      playerId,
      sum(paid.applied, granted.applied),
      relics,
      paid.levelsGained + granted.levelsGained,
    );
  });
}

/**
 * Rolls and hands over the relics a step opens with.
 *
 * Rolled rather than fixed, like every other relic in the game: what the content names is
 * the set, slot, rank and rarity, and the substats are the game's to decide. Two players
 * are given the same *kind* of piece and not the same piece.
 */
async function grantRelics(
  ctx: TutorialContext,
  tx: Executor,
  playerId: string,
  step: TutorialStepDef,
): Promise<GearInstance[]> {
  if (step.grantsRelics.length === 0) return [];

  const context = gearContextFrom(ctx.content.current().bundle);
  const created = await createGearBatch(
    tx,
    playerId,
    step.grantsRelics.map((relic) => ({ ...relic, source: `tutorial:${step.key}` })),
    // Seeded from the process CSPRNG rather than from anything in the request: a relic a
    // player could predict is a relic worth re-rolling by retrying.
    createRng(randomInt(1, 2 ** 31 - 1)),
    context,
  );
  return created.map((row) => toDto(row, context));
}

/** The relics a step already handed this player, read back by the source they carry. */
async function relicsFrom(
  ctx: TutorialContext,
  tx: Executor,
  playerId: string,
  step: TutorialStepDef,
): Promise<GearInstance[]> {
  if (step.grantsRelics.length === 0) return [];

  const context = gearContextFrom(ctx.content.current().bundle);
  const rows = await tx
    .select()
    .from(gearInstances)
    .where(
      and(eq(gearInstances.playerId, playerId), eq(gearInstances.source, `tutorial:${step.key}`)),
    );
  return rows.map((row) => toDto(row, context));
}

/**
 * Two payouts as one line.
 *
 * Added rather than spread, because a step that pays silver and then hands the next step
 * more silver has paid the total — a spread would report the second amount and quietly
 * lose the first, which is the kind of wrong number a player checks their wallet against.
 */
function sum(
  first: Record<string, number> = {},
  second: Record<string, number> = {},
): Record<string, number> {
  const total = { ...first };
  for (const [key, amount] of Object.entries(second)) total[key] = (total[key] ?? 0) + amount;
  return total;
}

/**
 * Leaves the script for good.
 *
 * Nothing already earned is taken back, and nothing further is paid — a player who skips
 * has chosen to find things themselves, not to be compensated for it. Irreversible on
 * purpose: a tutorial that could be re-entered would need to decide what to do about the
 * steps already paid for, and the honest answer is that nobody wants it back.
 */
export async function skip(ctx: TutorialContext, playerId: string): Promise<TutorialView> {
  await ctx.db
    .update(players)
    .set({ tutorialSkipped: true, updatedAt: new Date() })
    .where(eq(players.id, playerId));
  return overview(ctx, playerId);
}

async function finish(
  ctx: TutorialContext,
  tx: Executor,
  playerId: string,
  paid: Record<string, number>,
  relics: GearInstance[],
  levelsGained: number,
): Promise<AdvanceResult> {
  return { paid, relics, levelsGained, tutorial: build(ctx, await read(tx, playerId)) };
}

/** Whether a reward's item key is still in the published catalogue. */
function knownItem(ctx: TutorialContext): (itemKey: string) => boolean {
  const items = new Set(ctx.content.current().bundle.items.map((item) => item.key));
  return (itemKey) => items.has(itemKey);
}
