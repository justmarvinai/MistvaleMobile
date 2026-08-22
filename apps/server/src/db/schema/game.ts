import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
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
 * The player's own game state: the champions they own and the battles they are fighting.
 *
 * Content lives in `content_entries` and is shared by everyone; these tables hold what is
 * *personal* — which champion a player owns, how far they have levelled it, and the
 * in-flight battle they are three turns into (docs/DATA_MODEL.md).
 */

/**
 * One owned champion.
 *
 * A roster row references a `champion_defs` key rather than copying its stats, so a
 * balance change published in Admin reaches every copy of that champion immediately.
 * Level, rank and ascension are the per-instance tier the engine scales the definition's
 * anchor down to.
 */
export const playerChampions = pgTable(
  'player_champions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** `champion_defs` key. Not a foreign key: content lives in a JSONB table. */
    championKey: text('champion_key').notNull(),

    level: smallint('level').notNull().default(1),
    /** Star rank 1–6; caps the level (LEVEL_CAP_BY_RANK). */
    rank: smallint('rank').notNull().default(1),
    ascension: smallint('ascension').notNull().default(0),
    /**
     * Awakening 0–6 — the ladder that opens once every other one is finished.
     *
     * Its own column rather than more ascension, because the two are gated on different
     * things and pay out differently: ascension is essences from the Springs and it stops
     * where the star rank stops, awakening is a single deep-game material and it stops
     * nowhere but its own top.
     */
    awakening: smallint('awakening').notNull().default(0),
    xp: bigint('xp', { mode: 'number' }).notNull().default(0),

    /**
     * Tome levels applied per skill key.
     *
     * Kept as a map rather than a column per skill because a champion's kit is content:
     * adding a fifth skill in Admin must not need a migration.
     */
    skillUpgrades: jsonb('skill_upgrades').notNull().default({}).$type<Record<string, number>>(),

    /**
     * Mastery nodes learned, as `mastery_defs` keys.
     *
     * A list rather than a table for the same reason skill upgrades are a map: the shape
     * of a tree is content, and rebalancing one into seventeen nodes must not be a
     * migration. The build rules are re-checked on every spend, so a list that content
     * has moved on from simply stops being extendable rather than becoming invalid.
     */
    masteries: jsonb('masteries').notNull().default([]).$type<string[]>(),

    /** Resets already paid for. The first is free; the rest cost crystals. */
    masteryResets: smallint('mastery_resets').notNull().default(0),

    /** Locked champions cannot be fed away or sold — the guard against a misclick. */
    locked: boolean('locked').notNull().default(false),
    favourite: boolean('favourite').notNull().default(false),

    acquiredAt: timestamp('acquired_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('player_champions_player_id_idx').on(table.playerId),
    index('player_champions_key_idx').on(table.championKey),
    check('player_champions_level_check', sql`${table.level} >= 1 and ${table.level} <= 60`),
    check('player_champions_rank_check', sql`${table.rank} >= 1 and ${table.rank} <= 6`),
    check(
      'player_champions_ascension_check',
      sql`${table.ascension} >= 0 and ${table.ascension} <= 6`,
    ),
    check('player_champions_xp_check', sql`${table.xp} >= 0`),
  ],
);

/**
 * A battle in progress, or a finished one kept for its replay.
 *
 * The whole `BattleState` is stored as JSONB: it is plain data by construction, so a
 * session survives a server restart and resumes on exactly the turn it paused at. The
 * seed is stored alongside it so a finished battle can be replayed from scratch and
 * produce the same log, which is what the Admin inspector and share links read
 * (docs/COMBAT_SYSTEM.md §13).
 */
export const battleSessions = pgTable(
  'battle_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    mode: text('mode').notNull(),
    /** `stage_defs` key, or the opponent id in Arena. */
    stageKey: text('stage_key').notNull(),
    /** Content revision the battle was started against, so a replay uses the right kits. */
    contentRev: integer('content_rev').notNull(),

    /**
     * The `player_champions` ids that fought, in formation order.
     *
     * The engine works in slots, not roster ids, so the mapping has to be recorded here
     * for the payout to know which champions earned XP.
     */
    teamIds: jsonb('team_ids').notNull().default([]),

    seed: bigint('seed', { mode: 'number' }).notNull(),
    /** The engine's `BattleState`. */
    state: jsonb('state').notNull(),
    /** Everything emitted so far, appended per step. */
    events: jsonb('events').notNull().default([]),

    /** `active` while it can still take actions; anything else is terminal. */
    status: text('status').notNull().default('active'),
    outcome: text('outcome'),

    /**
     * The client-supplied id of the last action applied.
     *
     * A retried request carrying the same id returns the recorded result instead of
     * taking a second turn, which is what makes a dropped response safe on mobile
     * (CLAUDE.md conventions).
     */
    lastActionId: text('last_action_id'),

    energySpent: smallint('energy_spent').notNull().default(0),
    /** What victory paid out, recorded when the battle resolves. */
    rewards: jsonb('rewards'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  (table) => [
    // One active battle per player: the "resume your fight" lookup, and the guard that
    // stops a second start from stranding the first battle's spent energy.
    uniqueIndex('battle_sessions_active_key')
      .on(table.playerId)
      .where(sql`${table.status} = 'active'`),
    index('battle_sessions_player_idx').on(table.playerId, table.createdAt),
    check(
      'battle_sessions_status_check',
      sql`${table.status} in ('active', 'finished', 'abandoned')`,
    ),
  ],
);

export type PlayerChampionRow = typeof playerChampions.$inferSelect;
export type BattleSessionRow = typeof battleSessions.$inferSelect;

/**
 * What a player has cleared, and how well.
 *
 * One row per stage per player, covering every mode — campaign, dungeon floor, spring,
 * proving. Keeping them in one table rather than one per mode is what lets the unlock
 * check, the star total and the "farm this again" affordance be written once.
 *
 * `stars` is the *best* result, never the latest: a three-star clear followed by a sloppy
 * one must not take a star away, or nobody would ever re-farm a stage.
 */
export const stageProgress = pgTable(
  'stage_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** `stage_defs` key. */
    stageKey: text('stage_key').notNull(),
    /** Denormalised from the stage so the campaign map can total stars per chapter. */
    parentKey: text('parent_key').notNull().default(''),
    mode: text('mode').notNull().default('campaign'),

    stars: smallint('stars').notNull().default(0),
    clears: integer('clears').notNull().default(0),
    /** Fewest turns any clear took — the bragging number, and a multi-battle input. */
    bestTurns: smallint('best_turns'),

    firstClearedAt: timestamp('first_cleared_at', { withTimezone: true }),
    lastClearedAt: timestamp('last_cleared_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('stage_progress_player_stage_key').on(table.playerId, table.stageKey),
    index('stage_progress_parent_idx').on(table.playerId, table.parentKey),
    check('stage_progress_stars_check', sql`${table.stars} >= 0 and ${table.stars} <= 3`),
  ],
);

/**
 * Star-chest tiers already paid out, per chapter.
 *
 * Separate from `stage_progress` because a chest is claimed against a *chapter* total,
 * and storing which tiers have been taken is what stops a player re-earning the same
 * chest by losing and regaining a star.
 */
export const chapterRewards = pgTable(
  'chapter_rewards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    chapterKey: text('chapter_key').notNull(),
    /** Star thresholds already granted. */
    claimedTiers: jsonb('claimed_tiers').notNull().default([]).$type<number[]>(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('chapter_rewards_player_chapter_key').on(table.playerId, table.chapterKey),
  ],
);

export type StageProgressRow = typeof stageProgress.$inferSelect;
export type ChapterRewardRow = typeof chapterRewards.$inferSelect;
