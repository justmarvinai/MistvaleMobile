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

    /**
     * Whether this fight may be skipped — jumped to its end without watching.
     *
     * Decided once, when the fight opens, and stored rather than recomputed: the rule is
     * "had this stage been beaten *before* this fight", and by the time the last turn
     * resolves `recordClear` has already run, so asking again would answer about a clear
     * this very battle produced. Arena fights are always true — their stage key is an
     * opponent rather than a place (`canSkipBattle`).
     */
    canSkip: boolean('can_skip').notNull().default(false),

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

/**
 * What an account has managed against each Titan.
 *
 * One row per player per keep rather than a log of runs. A Titan pays *per run*, at the
 * rung that run reached, so nothing here is a claim ledger — there is no "already
 * collected" state to keep, which is exactly what makes it a record rather than progress.
 * What it holds is the two numbers the screen is about: the best you have ever managed,
 * and the last thing you did, so "did that change help" is a glance rather than a memory.
 *
 * Deliberately not a `titan_runs` table. A per-run log grows without bound for a fact
 * nobody reads twice, and the nightly prune would have to learn about it; a bounded row
 * per keep says everything the mode needs and costs one write a run.
 */
export const titanRecords = pgTable(
  'titan_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** `dungeon_defs` key of the Titan. */
    dungeonKey: text('dungeon_key').notNull(),
    /** Best damage ever dealt here, and the rung it reached. */
    bestDamage: bigint('best_damage', { mode: 'number' }).notNull().default(0),
    bestTierKey: text('best_tier_key'),
    /** The most recent run, whatever it was worth. */
    lastDamage: bigint('last_damage', { mode: 'number' }).notNull().default(0),
    runs: integer('runs').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('titan_records_player_dungeon_key').on(table.playerId, table.dungeonKey)],
);

/**
 * One wake of a world boss, and the **only shared mutable row in the game**.
 *
 * Every other table in Mistvale is partitioned by player. This one is the vale's: the
 * damage a warden did on Tuesday is still gone when somebody else opens the game on Friday,
 * which is the entire feature.
 *
 * `damage_taken` rather than `hp_remaining`, and that is load-bearing. It only ever goes
 * up, so a strike is `damage_taken = damage_taken + $1` — a single atomic statement with no
 * read-modify-write, no clamping race, and no lock held across a battle. Whether the boss
 * has fallen is that number against `max_hp`, read rather than stored; `felled_at` records
 * *when* for the screen, and is set by the strike that crossed the line.
 */
export const worldBossWakes = pgTable(
  'world_boss_wakes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** `dungeon_defs` key of the boss. */
    dungeonKey: text('dungeon_key').notNull(),
    /** The occurrence, as the game-day it woke on — the event scheduler's own anchor. */
    anchor: text('anchor').notNull(),
    /** Copied from content when the wake opens, so a retune mid-week cannot move the bar. */
    maxHp: bigint('max_hp', { mode: 'number' }).notNull(),
    damageTaken: bigint('damage_taken', { mode: 'number' }).notNull().default(0),
    /** Set by the strike that emptied the pool. Null while it still stands. */
    felledAt: timestamp('felled_at', { withTimezone: true }),
    felledBy: uuid('felled_by').references(() => players.id, { onDelete: 'set null' }),
    /** How many strikes it has taken, and by how many distinct wardens. */
    strikes: integer('strikes').notNull().default(0),
    wardens: integer('wardens').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex('world_boss_wakes_key').on(table.dungeonKey, table.anchor)],
);

/**
 * What one account did to one wake.
 *
 * The ladder is cumulative across the wake rather than per-run, which is what makes this a
 * row per *wake* rather than a record per account: last week's row simply stops matching
 * when the anchor moves on, so a weekly reset needs no job and loses no history.
 */
export const playerWorldBoss = pgTable(
  'player_world_boss',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    dungeonKey: text('dungeon_key').notNull(),
    anchor: text('anchor').notNull(),
    damage: bigint('damage', { mode: 'number' }).notNull().default(0),
    strikes: integer('strikes').notNull().default(0),
    /** Contribution rungs already collected. Each is claimable once per wake. */
    claimedTiers: jsonb('claimed_tiers').notNull().default([]).$type<string[]>(),
    /** Whether the felling chest has been collected — only ever true on a felled wake. */
    spoilsClaimed: boolean('spoils_claimed').notNull().default(false),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('player_world_boss_key').on(table.playerId, table.dungeonKey, table.anchor),
    // The board is "top damage for this wake", which is exactly this index read backwards.
    index('player_world_boss_board_idx').on(table.dungeonKey, table.anchor, table.damage),
  ],
);

/**
 * One descent, live or finished.
 *
 * The only *resumable* state in the game besides a battle, and unlike a battle it spans
 * several: a run is a dozen floors, and a player who closes the tab on floor 7 must find
 * floor 7 when they come back. So everything a descent is made of lives on the row — the
 * party's health, who has fallen, the boons taken, the doors currently open, the boons
 * currently offered — rather than being recomputed from anything.
 *
 * `seed` is what makes it honest. Doors and boon offers are drawn from the run's own seeded
 * stream rather than from `Math.random`, so a descent replays identically and an offer
 * cannot be re-rolled by refusing it and asking again. `offer_nonce` counts the draws taken
 * so far, which is what turns one seed into a sequence rather than one number.
 */
export const playerDeepRuns = pgTable(
  'player_deep_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** `deep_run_defs` key. */
    runKey: text('run_key').notNull(),
    seed: integer('seed').notNull(),
    /** How many draws have been taken from the seed, so each is a fresh one. */
    offerNonce: integer('offer_nonce').notNull().default(0),

    status: text('status').notNull().default('active'),
    /** `choosingDoor` · `inBattle` · `choosingBoon` · `ended`. */
    phase: text('phase').notNull().default('choosingDoor'),
    floor: integer('floor').notNull().default(1),
    deepest: integer('deepest').notNull().default(0),

    /** `[{ championId, hpPct, alive }]` — the party as it stands, health carried forward. */
    party: jsonb('party').notNull().default([]).$type<
      { championId: string; hpPct: number; alive: boolean }[]
    >(),
    /** Boon keys taken, in order. A boon that stacks appears more than once. */
    boons: jsonb('boons').notNull().default([]).$type<string[]>(),
    /** Room keys currently behind the doors. */
    doors: jsonb('doors').notNull().default([]).$type<string[]>(),
    /** Boon keys currently on offer. */
    boonOffer: jsonb('boon_offer').notNull().default([]).$type<string[]>(),
    /** The room being fought, so a resumed battle knows what it was for. */
    currentRoom: text('current_room'),
    battleId: uuid('battle_id'),

    /** What the run paid when it ended. Empty while it is still going. */
    rewards: jsonb('rewards').notNull().default({}).$type<Record<string, number>>(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
  },
  (table) => [
    // At most one live descent per account per run, enforced rather than assumed: two would
    // mean two sets of doors and a battle that could be filed against either.
    uniqueIndex('player_deep_runs_active_key')
      .on(table.playerId, table.runKey)
      .where(sql`status = 'active'`),
    index('player_deep_runs_player_idx').on(table.playerId, table.startedAt),
  ],
);

export type StageProgressRow = typeof stageProgress.$inferSelect;
export type ChapterRewardRow = typeof chapterRewards.$inferSelect;
export type TitanRecordRow = typeof titanRecords.$inferSelect;
export type WorldBossWakeRow = typeof worldBossWakes.$inferSelect;
export type PlayerDeepRunRow = typeof playerDeepRuns.$inferSelect;
export type PlayerWorldBossRow = typeof playerWorldBoss.$inferSelect;
