import { and, eq, inArray } from 'drizzle-orm';
import {
  advanceGoal,
  goalMatches,
  type Goal,
  type GoalEvent,
  type QuestDef,
} from '@mistvale/shared';
import { playerQuests, players } from '../../db/schema/index';
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
 * Missions and events subscribe here too, in P8c and P8d. They are deliberately absent
 * rather than stubbed: an empty subscriber that does nothing is a thing to maintain and a
 * thing to misread.
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

/** Whether every goal in a definition is at or past its target. */
export function questComplete(def: QuestDef, progress: readonly number[]): boolean {
  return def.goals.every((goal, index) => (progress[index] ?? 0) >= goal.target);
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

  // Which quests could possibly care. Decided in memory, before touching the database.
  const interested = activeQuests(ctx, level, now).filter(({ def }) =>
    def.goals.some((goal) => events.some((event) => goalMatches(goal, event))),
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
    const after = def.goals.map((goal, index) => applyEvents(goal, before[index] ?? 0, events));
    if (after.every((value, index) => value === before[index]) && existing) continue;

    const complete = questComplete(def, after);
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
