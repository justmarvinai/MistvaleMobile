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

    /** Bots are players too, so arena and leaderboards need no special cases. */
    isBot: boolean('is_bot').notNull().default(false),

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
