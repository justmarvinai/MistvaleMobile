import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { CONTENT_TYPES } from '@mistvale/shared';
import type { ContentType } from '@mistvale/shared';
import { accounts } from './accounts';

/**
 * Content storage.
 *
 * Every content family lives in one table, discriminated by `contentType`, with the
 * entity itself in a JSONB `data` column that is validated against its Zod schema at
 * every boundary (write, seed, publish).
 *
 * A table per family would mean a migration for every new content type — exactly the
 * cost the "content is data" rule exists to avoid. The trade-off is that PostgreSQL
 * cannot type-check the payload, so validation is enforced in application code and by
 * publish, and nothing reads `data` without parsing it first.
 *
 * Each entity has at most two rows: the live one players see, and a draft an editor is
 * working on. Publishing copies drafts over live inside a transaction and bumps the
 * revision (docs/ARCHITECTURE.md §5.4).
 */

export const CONTENT_STATES = ['live', 'draft'] as const;
export type ContentState = (typeof CONTENT_STATES)[number];

export const contentEntries = pgTable(
  'content_entries',
  {
    contentType: text('content_type').notNull().$type<ContentType>(),
    key: text('key').notNull(),
    state: text('state').notNull().$type<ContentState>(),
    /** The entity, matching the Zod schema registered for `contentType`. */
    data: jsonb('data').notNull(),
    /**
     * A draft may be marked `deleted` to mean "this entity goes away on publish".
     * Removing the live row immediately would break anything still referencing it.
     */
    deleted: boolean('deleted').notNull().default(false),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.contentType, table.key, table.state] }),
    index('content_entries_type_state_idx').on(table.contentType, table.state),
    // Guards against a typo introducing a content type nothing can interpret.
    // `sql.raw` because DDL cannot carry bind parameters — the values must be
    // literals in the generated CHECK constraint.
    check(
      'content_entries_type_check',
      sql`${table.contentType} in (${sql.raw(CONTENT_TYPES.map((type) => `'${type}'`).join(', '))})`,
    ),
    check('content_entries_state_check', sql`${table.state} in ('live', 'draft')`),
  ],
);

/**
 * One row per publish.
 *
 * Holds a full snapshot of the live content at that revision, which is what makes
 * one-click revert possible and gives in-flight battles a stable view of the rules
 * they started under.
 */
export const contentRevisions = pgTable(
  'content_revisions',
  {
    rev: integer('rev').primaryKey(),
    publishedAt: timestamp('published_at', { withTimezone: true }).notNull().defaultNow(),
    publishedBy: text('published_by').notNull(),
    accountId: text('account_id'),
    note: text('note').notNull().default(''),
    /** `{ added, modified, removed }` counts for the revision list. */
    summary: jsonb('summary').notNull().default({}),
    /** Complete live content at this revision: `{ [contentType]: { [key]: data } }`. */
    snapshot: jsonb('snapshot').notNull(),
  },
  (table) => [index('content_revisions_published_at_idx').on(table.publishedAt)],
);

/**
 * Uploaded asset files.
 *
 * The bytes live on disk under UPLOADS_DIR and are served by nginx; this table records
 * what exists so the Admin asset manager can list, preview and reassign them.
 */
export const assetUploads = pgTable(
  'asset_uploads',
  {
    id: text('id').primaryKey(),
    assetKey: text('asset_key').notNull(),
    /** Track name for unit sprites (`idle`, `attack`, …), or `still` / `avatar`. */
    track: text('track').notNull(),
    path: text('path').notNull(),
    frames: integer('frames').notNull().default(1),
    width: integer('width').notNull().default(0),
    height: integer('height').notNull().default(0),
    bytes: integer('bytes').notNull().default(0),
    uploadedBy: text('uploaded_by'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('asset_uploads_key_track_key').on(table.assetKey, table.track),
    index('asset_uploads_asset_key_idx').on(table.assetKey),
  ],
);

export type ContentEntryRow = typeof contentEntries.$inferSelect;
export type NewContentEntryRow = typeof contentEntries.$inferInsert;
export type ContentRevisionRow = typeof contentRevisions.$inferSelect;
export type AssetUploadRow = typeof assetUploads.$inferSelect;

/** Re-exported so the audit trail can attribute content edits to an account. */
export { accounts };
