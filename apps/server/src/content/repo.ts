import { and, eq, sql } from 'drizzle-orm';
import type { ContentType } from '@mistvale/shared';
import type { Database } from '../db/client';
import { contentEntries, contentRevisions } from '../db/schema/index';
import type { ContentEntryRow, ContentState } from '../db/schema/index';

/**
 * Data access for content rows. Queries only — the rules live in the service.
 */

export async function listByState(
  db: Database,
  state: ContentState,
  contentType?: ContentType,
): Promise<ContentEntryRow[]> {
  const where = contentType
    ? and(eq(contentEntries.state, state), eq(contentEntries.contentType, contentType))
    : eq(contentEntries.state, state);
  return db.select().from(contentEntries).where(where);
}

export async function findEntry(
  db: Database,
  contentType: ContentType,
  key: string,
  state: ContentState,
): Promise<ContentEntryRow | undefined> {
  const rows = await db
    .select()
    .from(contentEntries)
    .where(
      and(
        eq(contentEntries.contentType, contentType),
        eq(contentEntries.key, key),
        eq(contentEntries.state, state),
      ),
    )
    .limit(1);
  return rows[0];
}

/** Inserts or replaces one row of a given state. */
export async function upsertEntry(
  db: Database,
  values: {
    contentType: ContentType;
    key: string;
    state: ContentState;
    data: unknown;
    deleted?: boolean;
    updatedBy?: string | null;
  },
): Promise<void> {
  await db
    .insert(contentEntries)
    .values({
      contentType: values.contentType,
      key: values.key,
      state: values.state,
      data: values.data,
      deleted: values.deleted ?? false,
      updatedBy: values.updatedBy ?? null,
    })
    .onConflictDoUpdate({
      target: [contentEntries.contentType, contentEntries.key, contentEntries.state],
      set: {
        data: values.data,
        deleted: values.deleted ?? false,
        updatedBy: values.updatedBy ?? null,
        updatedAt: new Date(),
      },
    });
}

export async function deleteEntry(
  db: Database,
  contentType: ContentType,
  key: string,
  state: ContentState,
): Promise<void> {
  await db
    .delete(contentEntries)
    .where(
      and(
        eq(contentEntries.contentType, contentType),
        eq(contentEntries.key, key),
        eq(contentEntries.state, state),
      ),
    );
}

/** Removes every draft row — used by "discard drafts" and after a publish. */
export async function deleteAllDrafts(db: Database): Promise<number> {
  const removed = await db
    .delete(contentEntries)
    .where(eq(contentEntries.state, 'draft'))
    .returning({ key: contentEntries.key });
  return removed.length;
}

export async function countDrafts(db: Database): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(contentEntries)
    .where(eq(contentEntries.state, 'draft'));
  return rows[0]?.count ?? 0;
}

export async function replaceLiveContent(
  db: Database,
  entries: { contentType: ContentType; key: string; data: unknown }[],
): Promise<void> {
  await db.delete(contentEntries).where(eq(contentEntries.state, 'live'));
  if (entries.length === 0) return;

  // Chunked so a large publish cannot exceed the parameter limit.
  const CHUNK = 200;
  for (let i = 0; i < entries.length; i += CHUNK) {
    await db.insert(contentEntries).values(
      entries.slice(i, i + CHUNK).map((entry) => ({
        contentType: entry.contentType,
        key: entry.key,
        state: 'live' as const,
        data: entry.data,
      })),
    );
  }
}

export async function latestRevision(db: Database): Promise<number> {
  const rows = await db
    .select({ rev: sql<number>`coalesce(max(${contentRevisions.rev}), 0)::int` })
    .from(contentRevisions);
  return rows[0]?.rev ?? 0;
}

export async function insertRevision(
  db: Database,
  values: {
    rev: number;
    publishedBy: string;
    accountId?: string | null;
    note: string;
    summary: unknown;
    snapshot: unknown;
  },
): Promise<void> {
  await db.insert(contentRevisions).values({
    rev: values.rev,
    publishedBy: values.publishedBy,
    accountId: values.accountId ?? null,
    note: values.note,
    summary: values.summary,
    snapshot: values.snapshot,
  });
}

export async function listRevisions(db: Database, limit = 25) {
  return db
    .select({
      rev: contentRevisions.rev,
      publishedAt: contentRevisions.publishedAt,
      publishedBy: contentRevisions.publishedBy,
      note: contentRevisions.note,
      summary: contentRevisions.summary,
    })
    .from(contentRevisions)
    .orderBy(sql`${contentRevisions.rev} desc`)
    .limit(limit);
}

export async function findRevision(db: Database, rev: number) {
  const rows = await db
    .select()
    .from(contentRevisions)
    .where(eq(contentRevisions.rev, rev))
    .limit(1);
  return rows[0];
}

/** Prunes old snapshots, keeping the most recent `keep` revisions. */
export async function pruneRevisions(db: Database, keep = 20): Promise<number> {
  const removed = await db
    .delete(contentRevisions)
    .where(
      sql`${contentRevisions.rev} <= (
        select coalesce(max(rev), 0) - ${keep} from ${contentRevisions}
      )`,
    )
    .returning({ rev: contentRevisions.rev });
  return removed.length;
}
