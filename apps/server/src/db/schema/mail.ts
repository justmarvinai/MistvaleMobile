import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { players } from './accounts';

/**
 * The mailbox.
 *
 * A row per message per player. An operator sending to everybody fans out at send time
 * rather than storing one message and a read-set: the player count at EA is small, the
 * fan-out makes "who has claimed it" a `count(*)` instead of a join against a set, and it
 * means a player's inbox is a single-table read on the hottest path this feature has
 * (docs/DATA_MODEL.md §mailbox).
 *
 * Attachments are a reward map — the same flat `{silver: 5000, sigil_gleaming: 1}` every
 * other payout in the game uses, paid through `RewardService` so a gift lands in
 * `economy_log` beside everything else. A message with no attachments is simply a message;
 * it is read and then it is done.
 */
export const mailbox = pgTable(
  'mailbox',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    playerId: uuid('player_id')
      .notNull()
      .references(() => players.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    body: text('body').notNull(),
    /** Reward map. Empty when the message is only words. */
    attachments: jsonb('attachments').notNull().default({}).$type<Record<string, number>>(),
    /**
     * Who sent it: `system` for anything the game itself raised, or `admin:<account name>`
     * so a support conversation can be traced back to the operator who had it.
     */
    sentBy: text('sent_by').notNull().default('system'),
    /**
     * Groups the rows one send created, so the composer's log can report "sent to 43,
     * claimed by 31" without guessing from titles and timestamps.
     */
    batchId: uuid('batch_id'),

    readAt: timestamp('read_at', { withTimezone: true }),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    /** The action that claimed it, so a retried claim replays instead of failing. */
    claimActionId: text('claim_action_id'),
    /** After this the message is gone, claimed or not. Null means it keeps. */
    expiresAt: timestamp('expires_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // The inbox read, and the badge count that rides on it.
    index('mailbox_player_idx').on(table.playerId, table.createdAt),
    // The composer's send log groups by batch.
    index('mailbox_batch_idx').on(table.batchId),
  ],
);

export type MailRow = typeof mailbox.$inferSelect;
