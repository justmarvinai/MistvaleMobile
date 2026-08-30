import { CONTENT_LOAD_ORDER, type ContentType } from '@mistvale/shared';
import type { Database } from '../db/client';
import * as repo from './repo';

/**
 * The live content, shaped as one reviewable document.
 *
 * Split out from `export.ts` — which is a CLI that writes files — so the Admin API can
 * hand an operator the same document the command puts on disk without importing a script
 * that opens its own database pool. Two tools producing two shapes of "the content,
 * exported" would be two things to keep in step, and the one somebody restores from would
 * be whichever they happened to use.
 */

export interface SnapshotSummary {
  rev: number;
  types: { type: ContentType; count: number }[];
  total: number;
}

/** One content type's entities, sorted and key-stable — a snapshot file's contents. */
export interface SnapshotFile {
  type: ContentType;
  entities: { key: string; data: unknown }[];
}

export interface Snapshot {
  summary: SnapshotSummary;
  files: SnapshotFile[];
}

/**
 * Sorts an object's keys, recursively.
 *
 * The point of the snapshot is the diff, and `JSON.stringify` preserves insertion order —
 * so two exports of identical content would differ wherever a row happened to come back
 * with its fields in another order. Sorting makes a diff mean "somebody changed this".
 */
export function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) sorted[key] = stable(source[key]);
    return sorted;
  }
  return value;
}

/** The live content at its current revision, in load order, every entity key-stable. */
export async function snapshotOf(db: Database): Promise<Snapshot> {
  const rev = await repo.latestRevision(db);
  const live = await repo.listByState(db, 'live');

  const byType = new Map<ContentType, { key: string; data: unknown }[]>();
  for (const row of live) {
    const type = row.contentType as ContentType;
    const bucket = byType.get(type) ?? [];
    bucket.push({ key: row.key, data: row.data });
    byType.set(type, bucket);
  }

  const files: SnapshotFile[] = [];
  for (const type of CONTENT_LOAD_ORDER) {
    const entities = (byType.get(type) ?? []).sort((a, b) => a.key.localeCompare(b.key));
    if (entities.length === 0) continue;
    files.push({
      type,
      entities: entities.map((entity) => ({ key: entity.key, data: stable(entity.data) })),
    });
  }

  return {
    summary: {
      rev,
      types: files.map((file) => ({ type: file.type, count: file.entities.length })),
      total: files.reduce((carry, file) => carry + file.entities.length, 0),
    },
    files,
  };
}
