import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { accounts, players } from './accounts';

/**
 * Append-only trail of every administrative mutation.
 *
 * Written by the Admin API and by CLI tools (`SET_RANK.sh` records itself as
 * `admin:cli`). Nothing here is ever updated or deleted by application code.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    /** Null for automated/system actions that no human triggered. */
    accountId: uuid('account_id').references(() => accounts.id, { onDelete: 'set null' }),
    /** Human-readable actor label, e.g. "admin:marvin" or "admin:cli". */
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('audit_log_created_at_idx').on(table.createdAt),
    index('audit_log_entity_idx').on(table.entity, table.entityId),
    index('audit_log_account_id_idx').on(table.accountId),
  ],
);

/**
 * Append-only record of every resource grant and spend.
 *
 * Every reward in the game flows through one service that writes here, which is what
 * makes the Admin economy dashboards trustworthy (docs/DATA_MODEL.md §4).
 */
export const economyLog = pgTable(
  'economy_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),
    /** Where it came from: `battle:c01_s3`, `summon`, `quest:daily_1`, `admin:marvin`. */
    source: text('source').notNull(),
    /** Signed deltas per resource, e.g. `{ "silver": -1200, "crystals": 10 }`. */
    deltas: jsonb('deltas').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('economy_log_player_id_idx').on(table.playerId, table.createdAt),
    index('economy_log_created_at_idx').on(table.createdAt),
  ],
);

export type AuditLogRow = typeof auditLog.$inferSelect;
export type EconomyLogRow = typeof economyLog.$inferSelect;
