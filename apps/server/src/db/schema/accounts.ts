import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  type ACCOUNT_RANKS,
  type ACCOUNT_STATUSES,
  DEFAULT_PLAYER_SETTINGS,
} from '@mistvale/shared';
import type { PlayerSettings } from '@mistvale/shared';

/**
 * Case-insensitive text. Account and profile names must be unique regardless of case
 * ("Warden" and "warden" are the same name), and `citext` enforces that in the database
 * rather than relying on every call site to lower-case first.
 */
const citext = customType<{ data: string; driverData: string }>({
  dataType: () => 'citext',
});

/**
 * Login identity and permissions.
 *
 * One account system serves the whole project: `rank` decides whether an account is a
 * player, a moderator, or an admin who may open the Admin Suite (docs/DATA_MODEL.md).
 * There is no e-mail column anywhere by design — password resets go through an admin.
 */
export const accounts = pgTable(
  'accounts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountName: citext('account_name').notNull(),
    passwordHash: text('password_hash').notNull(),
    rank: text('rank').notNull().default('player').$type<(typeof ACCOUNT_RANKS)[number]>(),
    status: text('status').notNull().default('active').$type<(typeof ACCOUNT_STATUSES)[number]>(),
    banReason: text('ban_reason'),
    /** Set by an admin password reset; the client must change the password before playing. */
    forcePasswordChange: boolean('force_password_change').notNull().default(false),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
    createdIp: text('created_ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('accounts_account_name_key').on(table.accountName),
    index('accounts_rank_idx').on(table.rank),
    check('accounts_rank_check', sql`${table.rank} in ('player', 'gamemaster', 'admin')`),
    check('accounts_status_check', sql`${table.status} in ('active', 'banned')`),
  ],
);

/**
 * Active sessions.
 *
 * Only the SHA-256 hash of the token is stored: a database leak cannot be replayed as a
 * login. The same table serves the game and the Admin Suite — admin requests simply
 * additionally require `accounts.rank = 'admin'`.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    userAgent: text('user_agent'),
    ip: text('ip'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('sessions_token_hash_key').on(table.tokenHash),
    index('sessions_account_id_idx').on(table.accountId),
    index('sessions_expires_at_idx').on(table.expiresAt),
  ],
);

/**
 * The game profile attached to an account (1:1).
 *
 * Wallet currencies live here as columns because they are small, hot, and always read
 * together. Energy is stored as a value plus the timestamp it was last recomputed, so
 * regeneration is derived lazily instead of by a ticking job.
 */
export const players = pgTable(
  'players',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    profileName: citext('profile_name').notNull(),

    level: smallint('level').notNull().default(1),
    xp: bigint('xp', { mode: 'number' }).notNull().default(0),

    energy: smallint('energy').notNull().default(20),
    energyUpdatedAt: timestamp('energy_updated_at', { withTimezone: true }).notNull().defaultNow(),

    silver: bigint('silver', { mode: 'number' }).notNull().default(0),
    crystals: bigint('crystals', { mode: 'number' }).notNull().default(0),
    valorMedals: bigint('valor_medals', { mode: 'number' }).notNull().default(0),

    rosterCapacity: smallint('roster_capacity').notNull().default(60),
    /** 0 = not started; the tutorial script advances this (docs/CONTENT_PLAN_EA01.md §7). */
    tutorialStep: smallint('tutorial_step').notNull().default(0),

    settings: jsonb('settings').notNull().default(DEFAULT_PLAYER_SETTINGS).$type<PlayerSettings>(),

    /**
     * Mercy counters per pool, `{poolKey: {rarity: sinceCount}}`.
     *
     * Derivable from `summon_history`, cached here so the Mistgate's odds panel is one
     * row read rather than an aggregate over a table that only grows.
     */
    summonPity: jsonb('summon_pity')
      .notNull()
      .default({})
      .$type<Record<string, Record<string, number>>>(),

    /**
     * The last summon `actionId` applied.
     *
     * A retried pull returns what the first one produced instead of spending again —
     * the same idempotency guarantee a battle action has, and it matters more here,
     * because a dropped response could otherwise cost ten sigils twice.
     */
    lastSummonActionId: text('last_summon_action_id'),

    /**
     * The last multi-battle, kept whole: `{actionId, result}`.
     *
     * A batch of runs writes no `battle_sessions` rows — thirty states and thirty event
     * logs would be megabytes per farm, and there is nothing to resume — so the summary
     * has nowhere else to live, and a retried request has nothing else to replay. Stored
     * on the player row rather than in a table because exactly one is ever kept: the
     * moment the next batch runs, the previous one stops being replayable.
     */
    lastMultiBattle: jsonb('last_multi_battle').$type<{ actionId: string; result: unknown }>(),

    /** Bots are players too, so arena and leaderboards need no special cases. */
    isBot: boolean('is_bot').notNull().default(false),

    /**
     * Per-day allowances used, by counter name — multi-battle runs today, and every
     * quest counter a later phase adds.
     *
     * One map rather than a column per allowance: adding a counter must not be a
     * migration. Stamped with the game-day it belongs to, so a stale day reads as zero
     * and needs no reset job to clear it.
     */
    dailyCounters: jsonb('daily_counters').notNull().default({}).$type<Record<string, number>>(),
    dailyCountersDay: text('daily_counters_day'),

    /**
     * The last completion chest taken for each quest period: which period *instance* it
     * was, and the action that took it.
     *
     * A map rather than three columns, and an anchor rather than a boolean, for the same
     * reason `player_quests` carries one: a chest is claimable again when the anchor
     * stored here is no longer the current period's, so the daily chest re-opens at the
     * reset with nothing to reset it. The action id makes a retried claim replay rather
     * than fail — a dropped response on a phone must not cost the chest.
     */
    chestClaims: jsonb('chest_claims')
      .notNull()
      .default({})
      .$type<Record<string, { anchor: string; actionId: string }>>(),

    /**
     * An honorific the account has earned and may display beside its profile name.
     *
     * One column rather than a table of earned titles: at EA exactly one is awarded, by
     * the last step of the Valewarden's Path, and a table for a single row would be a
     * table to maintain. When a second source appears it becomes a list — the column is
     * the *displayed* title either way, which is the only thing the game reads.
     */
    title: text('title'),

    /**
     * The champions this account wants to be known by, in display order.
     *
     * `player_champions` ids rather than champion keys: the card shows *this* Aureleth at
     * her level and rank, not the definition. Empty means the player has never chosen, and
     * the card falls back to their strongest — so a card is never blank, and the picker is
     * something to reach for rather than something to get past.
     */
    showcase: jsonb('showcase').notNull().default([]).$type<string[]>(),

    lastDailyResetAt: timestamp('last_daily_reset_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('players_account_id_key').on(table.accountId),
    uniqueIndex('players_profile_name_key').on(table.profileName),
    index('players_is_bot_idx').on(table.isBot),
    check('players_level_check', sql`${table.level} >= 1 and ${table.level} <= 60`),
    check('players_energy_check', sql`${table.energy} >= 0`),
    check(
      'players_currency_check',
      sql`${table.silver} >= 0 and ${table.crystals} >= 0 and ${table.valorMedals} >= 0`,
    ),
  ],
);

export type AccountRow = typeof accounts.$inferSelect;
export type NewAccountRow = typeof accounts.$inferInsert;
export type SessionRow = typeof sessions.$inferSelect;
export type PlayerRow = typeof players.$inferSelect;
export type NewPlayerRow = typeof players.$inferInsert;
