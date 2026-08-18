import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { CONTENT_LOAD_ORDER, type ContentType } from '@mistvale/shared';
import { loadConfig } from '../lib/config';
import type { Database } from '../db/client';
import * as repo from './repo';

/**
 * The live content, written into the repository as reviewable JSON.
 *
 * Content is data and the database is its source of truth — which is right, and which
 * also means the whole game's balance, copy and structure lives somewhere `git log` cannot
 * see. An operator retunes a drop table on a Sunday and there is no record anybody can
 * read, no diff to review, and nothing to restore from but a database dump.
 *
 * So: `pnpm content:export`, then commit. Two things fall out of it, and both matter more
 * than the backup does:
 *
 * - **A review.** `git diff` after an operator's evening says exactly what changed, in
 *   the words the content uses, next to the code that reads it.
 * - **A way back that is not a dump.** A restore from `BACKUP.sh` returns player accounts
 *   as well as content; this returns content alone, at a revision somebody chose.
 *
 * Deliberately whole-file-per-type rather than one file per entity: 372 stages would be
 * 372 files, and the question a reader asks is "what changed in the campaign", not "what
 * changed in stage c07_s3_hard".
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_DIR = resolve(HERE, '../../../../content-snapshot');

export interface SnapshotSummary {
  rev: number;
  types: { type: ContentType; count: number }[];
  total: number;
}

/**
 * Sorts an object's keys, recursively.
 *
 * The point of the snapshot is the diff, and `JSON.stringify` preserves insertion order —
 * so two exports of identical content would differ wherever a row happened to come back
 * with its fields in another order. Sorting makes a diff mean "somebody changed this".
 */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = stable(source[key]);
    return sorted;
  }
  return value;
}

/** Writes the snapshot and returns what it wrote. */
export async function exportContent(
  db: Database,
  directory = SNAPSHOT_DIR,
): Promise<SnapshotSummary> {
  const rev = await repo.latestRevision(db);
  const live = await repo.listByState(db, 'live');

  const byType = new Map<ContentType, { key: string; data: unknown }[]>();
  for (const row of live) {
    const type = row.contentType as ContentType;
    const bucket = byType.get(type) ?? [];
    bucket.push({ key: row.key, data: row.data });
    byType.set(type, bucket);
  }

  await mkdir(directory, { recursive: true });

  // Clear stale files first: a content type deleted upstream must not linger as a file
  // that reads like current content. Scoped to `.json` so the directory's own README —
  // the thing that explains what a snapshot is — survives its own export.
  const existing = await readdir(directory).catch(() => [] as string[]);
  for (const file of existing) {
    if (file.endsWith('.json')) await rm(resolve(directory, file));
  }

  const types: SnapshotSummary['types'] = [];
  for (const type of CONTENT_LOAD_ORDER) {
    const entities = (byType.get(type) ?? []).sort((a, b) => a.key.localeCompare(b.key));
    if (entities.length === 0) continue;
    const body = entities.map((entity) => ({ key: entity.key, data: stable(entity.data) }));
    await writeFile(
      resolve(directory, `${type}.json`),
      `${JSON.stringify(body, null, 2)}\n`,
      'utf8',
    );
    types.push({ type, count: entities.length });
  }

  const summary: SnapshotSummary = {
    rev,
    types,
    total: types.reduce((carry, entry) => carry + entry.count, 0),
  };

  // The manifest carries the revision, which is the one thing a file-per-type layout
  // cannot say — and the thing somebody restoring will want to know first.
  await writeFile(
    resolve(directory, 'manifest.json'),
    `${JSON.stringify(stable(summary), null, 2)}\n`,
    'utf8',
  );

  return summary;
}

async function main(): Promise<void> {
  const config = loadConfig();
  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 1 });
  const db = drizzle(pool) as unknown as Database;
  try {
    const summary = await exportContent(db);
    console.log(`content: exported revision ${summary.rev} — ${summary.total} entities`);
    for (const entry of summary.types) {
      console.log(`  ${entry.type.padEnd(18)} ${String(entry.count).padStart(4)}`);
    }
    console.log(`\nWritten to content-snapshot/. Commit it: that is the point.`);
  } finally {
    await pool.end();
  }
}

// Run only when invoked directly, so the exporter stays importable by a test.
if (process.argv[1] && process.argv[1].endsWith('export.ts')) {
  main().catch((error: unknown) => {
    console.error('content export failed:');
    console.error(error);
    process.exit(1);
  });
}
