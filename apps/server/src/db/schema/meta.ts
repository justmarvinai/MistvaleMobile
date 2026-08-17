import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { players } from './accounts';

/**
 * The retention layer's progress: quests, missions, events.
 *
 * All three are the same shape — a player, a content key, how far along, and when it was
 * claimed — because all three are goals from the same DSL advanced by the same
 * `ProgressService.track` fan-out. Three tables rather than one because their *lifetimes*
 * differ: a quest instance belongs to a period and is replaced, a mission is permanent and
 * ordered, an event window opens and shuts. One table with a discriminator would need a
 * partial index per lifetime anyway, and every query would carry a `where kind = …` that
 * the planner has to be told about.
 *
 * `progress` is a jsonb array parallel to the definition's goals, so a quest with two goals
 * stores `[2, 0]`. Positional rather than keyed: goals have no identity of their own, and
 * an operator reordering them in the editor should not silently rebind a player's progress
 * to a different goal.
 */

/**
 * One quest instance, for one player, for one period.
 *
 * `periodAnchor` is the game-day the instance belongs to — the daily reset date for a
 * daily, the week's Monday for a weekly, the month's first for a monthly. It is what makes
 * "today's dailies" a lookup rather than a job: yesterday's row simply stops matching, so
 * nothing has to go round at 04:00 deleting things (docs/ARCHITECTURE.md §5.1).
 */
export const playerQuests = pgTable(
  'player_quests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** `quest_defs` key. */
    questKey: text('quest_key').notNull(),
    /** `YYYY-MM-DD` of the period this instance belongs to. */
    periodAnchor: text('period_anchor').notNull(),

    /** Progress per goal, in the definition's order. */
    progress: jsonb('progress').notNull().default([]).$type<number[]>(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /** The action that claimed it, so a retried claim replays instead of failing. */
    claimActionId: text('claim_action_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // One instance per quest per period, enforced rather than assumed: the fan-out runs
    // inside whatever transaction reported the activity, and two battles resolving at once
    // must not each create today's row.
    uniqueIndex('player_quests_instance_key').on(
      table.playerId,
      table.questKey,
      table.periodAnchor,
    ),
    // The hot read is "everything this player has open in this period".
    index('player_quests_period_idx').on(table.playerId, table.periodAnchor),
  ],
);

/**
 * One mission, for one player.
 *
 * No period: the Valewarden's Path is a single chain walked once, so a row is created when
 * the step becomes reachable and lives forever.
 */
export const playerMissions = pgTable(
  'player_missions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** `mission_defs` key. */
    missionKey: text('mission_key').notNull(),

    progress: jsonb('progress').notNull().default([]).$type<number[]>(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /** The action that claimed it, so a retried claim replays instead of failing. */
    claimActionId: text('claim_action_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('player_missions_key').on(table.playerId, table.missionKey),
    index('player_missions_player_idx').on(table.playerId),
  ],
);

/**
 * One player's standing in one event.
 *
 * Events are point ladders rather than goal lists: activity earns points by the event's own
 * rules, and milestones are claimed as the total crosses them. `claimedMilestones` holds
 * the indices already taken, so claiming is idempotent and a milestone list an operator
 * extends mid-event does not re-open what was already paid.
 */
export const playerEvents = pgTable(
  'player_events',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** `event_defs` key. */
    eventKey: text('event_key').notNull(),
    /**
     * Which *occurrence* this score belongs to — the game-day the window opened on.
     *
     * A weekly event runs again next week and the ladder starts over, so points need the
     * same treatment a quest's period gets: last week's row simply stops matching, and
     * there is nothing to reset. A one-off carries the day it was scheduled to open, so an
     * operator who re-runs the same event later gets a fresh score rather than a total
     * somebody has been sitting on since March.
     */
    occurrence: text('occurrence').notNull(),

    points: integer('points').notNull().default(0),
    claimedMilestones: jsonb('claimed_milestones').notNull().default([]).$type<number[]>(),
    /** The action that took the last milestone, so a retried claim replays. */
    claimActionId: text('claim_action_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('player_events_key').on(table.playerId, table.eventKey, table.occurrence),
    check('player_events_points_check', sql`${table.points} >= 0`),
  ],
);

/**
 * The login calendar, and the newcomer track beside it.
 *
 * A row per claimed day rather than a counter, because the two tracks advance
 * independently and a player who misses a day does not lose their place — the calendar
 * gives day N on the Nth *claim*, not on the Nth day of the month.
 */
export const loginClaims = pgTable(
  'login_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** `calendar` for the 30-day cycle, `welcome` for the 7-day newcomer track. */
    track: text('track').notNull(),
    /** Which day of that track this claim was. */
    day: smallint('day').notNull(),
    /** The game-day it was claimed on — one claim per track per day. */
    claimedOn: text('claimed_on').notNull(),
    /** The action that took it, so a retried claim replays instead of failing. */
    claimActionId: text('claim_action_id'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('login_claims_day_key').on(table.playerId, table.track, table.claimedOn),
    index('login_claims_player_idx').on(table.playerId, table.track),
  ],
);

export type PlayerQuestRow = typeof playerQuests.$inferSelect;
export type PlayerMissionRow = typeof playerMissions.$inferSelect;
export type PlayerEventRow = typeof playerEvents.$inferSelect;
export type LoginClaimRow = typeof loginClaims.$inferSelect;
