import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  advanceGoal,
  eventWindowAt,
  goalMatches,
  type Goal,
  type EventDef,
  type EventWindow,
  type GoalEvent,
  type MissionDef,
  type QuestDef,
} from '@mistvale/shared';
import { playerEvents, playerMissions, playerQuests, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { gameDayFrom } from '../../lib/game-day';

/**
 * `ProgressService` — the one place the game reports what a player did.
 *
 * Nothing in Mistvale knows what a quest is. The battle module reports that a battle was
 * won; the summon module reports that a pull happened; the forge reports an upgrade
 * attempt. Whatever is listening advances. That is the whole design, and it is worth being
 * strict about, because the alternative — every module importing the quest service, then
 * the mission service, then the event service — is how a codebase stops being able to add
 * a fourth thing (docs/DATA_MODEL.md §player_quests).
 *
 * Called **inside the transaction that did the thing**, always. A quest that advanced for
 * a battle that then rolled back would be a quest the player did not earn, and the
 * reverse — a battle paid for without its quest credit — is the same bug wearing a
 * different hat.
 *
 * Three listeners now — the periodic checklist, the Valewarden's Path, and whatever timed
 * events happen to be running. **None of the reporting modules changed to gain any of
 * them**, which is the property this whole design exists to buy: the battle module still
 * only knows that a battle was won.
 */

/**
 * A transaction, and deliberately not a `Database`.
 *
 * Typed this narrowly so "called inside the transaction that did the thing" is a rule the
 * compiler keeps rather than a sentence in a comment somebody skims.
 */
type Executor = Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ProgressContext {
  content: ContentCache;
}

/**
 * The period instance a quest belongs to right now.
 *
 * Daily is the game-day; weekly is the Monday that starts it; monthly is the first of the
 * month. All three are derived from the same game-day the rest of the game resets on, so a
 * player's day ends once rather than three times.
 */
export function periodAnchor(
  period: QuestDef['period'],
  config: Readonly<Record<string, unknown>>,
  now: Date,
): string {
  const today = gameDayFrom(config, now).date;
  if (period === 'daily') return today;

  const date = new Date(`${today}T00:00:00Z`);
  if (period === 'monthly') return `${today.slice(0, 7)}-01`;

  // Monday-based, matching the arena week: `getUTCDay` calls Sunday 0.
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

/** The quests an account of this level currently has, with their period anchors. */
export function activeQuests(
  ctx: ProgressContext,
  level: number,
  now: Date,
): { def: QuestDef; anchor: string }[] {
  const bundle = ctx.content.current().bundle;
  return bundle.quests
    .filter((def) => def.active && level >= def.unlockLevel)
    .map((def) => ({ def, anchor: periodAnchor(def.period, bundle.config, now) }));
}

/** Whether every goal in a list is at or past its target. */
export function goalsMet(goals: readonly Goal[], progress: readonly number[]): boolean {
  return goals.every((goal, index) => (progress[index] ?? 0) >= goal.target);
}

/** Whether a quest is finished. The same test, named for its caller. */
export function questComplete(def: QuestDef, progress: readonly number[]): boolean {
  return goalsMet(def.goals, progress);
}

/** Whether a mission is finished. */
export function missionComplete(def: MissionDef, progress: readonly number[]): boolean {
  return goalsMet(def.goals, progress);
}

/**
 * Records what a player did, and advances everything that was waiting for it.
 *
 * Takes a list because one action often *is* several reports — winning a campaign boss
 * stage is a `battleWin`, a `stageClear` and a `bossKill`, and reporting them separately
 * from three call sites would be three chances to forget one.
 *
 * Cheap when nothing matches: quests come from the in-memory content snapshot, so the
 * common case (an event no quest cares about) costs one query at most.
 */
export async function track(
  tx: Executor,
  ctx: ProgressContext,
  playerId: string,
  events: readonly GoalEvent[],
  options: { now?: Date } = {},
): Promise<void> {
  if (events.length === 0) return;
  const now = options.now ?? new Date();

  // Locking the player row does two jobs with one statement. It reads the level the quest
  // list is gated on, and it serialises every report for this account — which is what makes
  // the read-modify-write below safe. Two systems reporting at the same instant (a battle
  // settling while a purchase lands) would otherwise both read `3`, both write `4`, and one
  // of the two things the player did would simply not have happened.
  //
  // Nearly every caller already holds this lock, and a row lock is re-entrant inside its own
  // transaction, so taking it again costs a statement rather than a wait.
  const level = await lockAndReadLevel(tx, playerId);
  if (level === null) return;

  // The account level is not an *action*, so nothing reports it — but goals ask for it
  // ("reach level 20"), and a threshold goal is satisfied by the state rather than by the
  // change. Appending it to every report is what makes "reach level 20" complete on the
  // next thing the player does after levelling, rather than needing a level-up to be
  // spotted and forwarded from the four places XP is granted.
  const reports: GoalEvent[] = [...events, { type: 'accountLevel', amount: level }];

  await advanceQuests(tx, ctx, playerId, reports, level, now);
  await advanceMissions(tx, ctx, playerId, reports, now);
  await advanceEvents(tx, ctx, playerId, reports, level, now);
}

/**
 * Timed events, scored.
 *
 * Unlike a quest or a mission, an event does not ask "did you do the thing" — it asks
 * "how much", and pays points per unit. So the same report that advances a daily by one
 * can be worth five hundred points here, and both are correct.
 *
 * Only *running* events score. An event whose window has shut still shows up on the screen
 * while its claims are open, but the ladder it pays against is fixed the moment the window
 * closes — otherwise a grace period for collecting would be a grace period for scoring.
 */
async function advanceEvents(
  tx: Executor,
  ctx: ProgressContext,
  playerId: string,
  reports: readonly GoalEvent[],
  level: number,
  now: Date,
): Promise<void> {
  const live = liveEvents(ctx, level, now);
  if (live.length === 0) return;

  const earned = live
    .map(({ def, window }) => ({ def, window, points: pointsFor(def, reports) }))
    .filter((entry) => entry.points > 0);
  if (earned.length === 0) return;

  for (const { def, window, points } of earned) {
    // Added in SQL rather than read-then-written. The player lock above already serialises
    // this, but a score is the one number here that is pure accumulation, and expressing
    // that as an increment means it cannot be lost even if the lock ever moves.
    await tx
      .insert(playerEvents)
      .values({ playerId, eventKey: def.key, occurrence: window.anchor, points })
      .onConflictDoUpdate({
        target: [playerEvents.playerId, playerEvents.eventKey, playerEvents.occurrence],
        set: { points: sql`${playerEvents.points} + ${points}`, updatedAt: now },
      });
  }
}

/** Every event running right now that this account has reached. */
export function liveEvents(
  ctx: ProgressContext,
  level: number,
  now: Date,
): { def: EventDef; window: EventWindow }[] {
  const bundle = ctx.content.current().bundle;
  const day = gameDayFrom(bundle.config, now);
  return bundle.events.flatMap((def) => {
    if (!def.active || level < def.unlockLevel) return [];
    const window = eventWindowAt(def.schedule, day.date, day.weekday, now);
    return window ? [{ def, window }] : [];
  });
}

/** What one batch of reports is worth to one event. */
export function pointsFor(def: EventDef, reports: readonly GoalEvent[]): number {
  let total = 0;
  for (const rule of def.pointRules) {
    for (const report of reports) {
      // A rule is a goal in everything but name, so it matches the same way — which is
      // what lets an event count anything a quest can, including a report type added
      // after the event was authored.
      if (!goalMatches({ type: rule.type, target: 1, filters: rule.filters }, report)) continue;
      const amount = report.amount ?? 1;
      if (amount > 0) total += rule.points * amount;
    }
  }
  return total;
}

/** Today's quest instances, advanced. */
async function advanceQuests(
  tx: Executor,
  ctx: ProgressContext,
  playerId: string,
  reports: readonly GoalEvent[],
  level: number,
  now: Date,
): Promise<void> {
  // Which quests could possibly care. Decided in memory, before touching the database.
  const interested = activeQuests(ctx, level, now).filter(({ def }) =>
    def.goals.some((goal) => reports.some((event) => goalMatches(goal, event))),
  );
  if (interested.length === 0) return;

  const rows = await tx
    .select()
    .from(playerQuests)
    .where(
      and(
        eq(playerQuests.playerId, playerId),
        inArray(
          playerQuests.questKey,
          interested.map(({ def }) => def.key),
        ),
      ),
    );
  const held = new Map(rows.map((row) => [`${row.questKey}:${row.periodAnchor}`, row]));

  for (const { def, anchor } of interested) {
    const existing = held.get(`${def.key}:${anchor}`);
    // A claimed quest is finished for its period; advancing it further would let a
    // player bank progress against tomorrow's instance.
    if (existing?.claimedAt) continue;

    const before: number[] = def.goals.map((_, index) => existing?.progress[index] ?? 0);
    const after = def.goals.map((goal, index) => applyEvents(goal, before[index] ?? 0, reports));
    if (after.every((value, index) => value === before[index]) && existing) continue;

    const complete = goalsMet(def.goals, after);
    const completedAt = complete ? (existing?.completedAt ?? now) : null;

    if (existing) {
      await tx
        .update(playerQuests)
        .set({ progress: after, completedAt, updatedAt: now })
        .where(eq(playerQuests.id, existing.id));
    } else {
      // `onConflictDoUpdate` rather than a bare insert. The player lock above should mean
      // this row is ours to create, but "should" is doing work there — and the cost of
      // being wrong is a unique-index violation that takes a legitimate battle down with
      // it. Losing a report is survivable; losing the fight that produced it is not.
      await tx
        .insert(playerQuests)
        .values({
          playerId,
          questKey: def.key,
          periodAnchor: anchor,
          progress: after,
          completedAt,
        })
        .onConflictDoUpdate({
          target: [playerQuests.playerId, playerQuests.questKey, playerQuests.periodAnchor],
          set: { progress: after, completedAt, updatedAt: now },
        });
    }
  }
}

/**
 * The Valewarden's Path, advanced.
 *
 * **Every active mission accrues, whatever arc it is in.** The arc gate decides what a
 * player may *claim* and what the screen shows them next; it deliberately does not decide
 * what counts. A player who clears two hundred Depths floors while arc 4 is open should
 * not restart arc 8's "clear one hundred" from zero — the floors happened, and a chain
 * that pretended otherwise would be punishing the player for playing well.
 *
 * The cost of that is bounded by the cap: a mission at its target computes the same
 * progress it already holds, so it writes nothing. Steady state is one write per mission
 * genuinely in flight, not one per mission in the game.
 */
async function advanceMissions(
  tx: Executor,
  ctx: ProgressContext,
  playerId: string,
  reports: readonly GoalEvent[],
  now: Date,
): Promise<void> {
  const interested = ctx.content
    .current()
    .bundle.missions.filter(
      (def) =>
        def.active && def.goals.some((goal) => reports.some((event) => goalMatches(goal, event))),
    );
  if (interested.length === 0) return;

  const rows = await tx
    .select()
    .from(playerMissions)
    .where(
      and(
        eq(playerMissions.playerId, playerId),
        inArray(
          playerMissions.missionKey,
          interested.map((def) => def.key),
        ),
      ),
    );
  const held = new Map(rows.map((row) => [row.missionKey, row]));

  for (const def of interested) {
    const existing = held.get(def.key);
    // Claimed is finished: a mission is walked once, and there is no next instance to
    // bank progress against.
    if (existing?.claimedAt) continue;

    const before: number[] = def.goals.map((_, index) => existing?.progress[index] ?? 0);
    const after = def.goals.map((goal, index) => applyEvents(goal, before[index] ?? 0, reports));
    if (after.every((value, index) => value === before[index]) && existing) continue;

    const complete = goalsMet(def.goals, after);
    const completedAt = complete ? (existing?.completedAt ?? now) : null;

    if (existing) {
      await tx
        .update(playerMissions)
        .set({ progress: after, completedAt, updatedAt: now })
        .where(eq(playerMissions.id, existing.id));
    } else {
      await tx
        .insert(playerMissions)
        .values({ playerId, missionKey: def.key, progress: after, completedAt })
        .onConflictDoUpdate({
          target: [playerMissions.playerId, playerMissions.missionKey],
          set: { progress: after, completedAt, updatedAt: now },
        });
    }
  }
}

/** The account's level, with its row held for the rest of the transaction. */
async function lockAndReadLevel(tx: Executor, playerId: string): Promise<number | null> {
  const [row] = await tx
    .select({ level: players.level })
    .from(players)
    .where(eq(players.id, playerId))
    .for('update');
  return row?.level ?? null;
}

/** Applies every event that matches one goal, in order. */
function applyEvents(goal: Goal, before: number, events: readonly GoalEvent[]): number {
  let progress = before;
  for (const event of events) {
    if (goalMatches(goal, event)) progress = advanceGoal(goal, progress, event);
  }
  return progress;
}
