import type { AdminImportRequest, AdminImportResult, ContentType } from '@mistvale/shared';
import { CONTENT_LOAD_ORDER, CONTENT_REGISTRY, IMPORT_MAX_ENTITIES } from '@mistvale/shared';
import { AppError } from '../lib/errors';
import type { Database } from '../db/client';
import * as repo from '../content/repo';

/**
 * Importing a content snapshot (ADMIN_SUITE_DESIGN §2.16).
 *
 * The export half already exists: `pnpm content:export` has written the live content into
 * the repository as reviewable JSON since P10e, and `snapshotOf` now shapes the same
 * document for the wire. This is the way back in.
 *
 * **It writes drafts and never live**, which is the whole safety story. A bundle arrives as
 * pending edits and then goes through the validate → diff → publish flow every other edit
 * takes: an operator sees exactly what an import would change, field by field since C30,
 * before any of it reaches a player. That is the dry-run the design asks for, built out of
 * machinery that already has their trust rather than a second review path that would need
 * its own.
 *
 * Two refusals rather than a best effort. A type this server does not know is **named**,
 * not dropped — a snapshot from a newer build silently losing a content type is how a
 * restore ends up incomplete and nobody finds out until a player does. And an entity
 * identical to what is already live writes **no draft at all**, because a publish diff
 * full of rows that change nothing is one nobody reads.
 */

const KNOWN = new Set<string>(CONTENT_LOAD_ORDER);

/** Deep equality by shape rather than by key order, the way the diff compares. */
function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
}

function sorted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sorted);
  if (value && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) out[key] = sorted(source[key]);
    return out;
  }
  return value;
}

export async function importSnapshot(
  db: Database,
  request: AdminImportRequest,
  actor: string,
): Promise<AdminImportResult> {
  const only = request.only ? new Set(request.only) : null;
  const wanted = request.files.filter((file) => !only || only.has(file.type));

  const total = wanted.reduce((sum, file) => sum + file.entities.length, 0);
  if (total > IMPORT_MAX_ENTITIES) {
    throw new AppError(
      'VALIDATION',
      `That bundle carries ${total} entities; the ceiling is ${IMPORT_MAX_ENTITIES}.`,
    );
  }

  const unknownTypes = [...new Set(wanted.map((file) => file.type))].filter(
    (type) => !KNOWN.has(type),
  );

  const live = await repo.listByState(db, 'live');
  const liveByKey = new Map(live.map((row) => [`${row.contentType}:${row.key}`, row.data]));

  const drafted: { type: string; count: number }[] = [];
  let unchanged = 0;

  // In load order rather than the bundle's own, so a type that references another is
  // written after it — which matters not for the write itself but for reading the diff,
  // where a champion appearing above the faction it belongs to reads backwards.
  for (const type of CONTENT_LOAD_ORDER) {
    const file = wanted.find((entry) => entry.type === type);
    if (!file) continue;

    let count = 0;
    for (const entity of file.entities) {
      if (same(liveByKey.get(`${type}:${entity.key}`), entity.data)) {
        unchanged += 1;
        continue;
      }
      await repo.upsertEntry(db, {
        contentType: type as ContentType,
        key: entity.key,
        state: 'draft',
        data: entity.data,
        updatedBy: actor,
      });
      count += 1;
    }
    if (count > 0) drafted.push({ type, count });
  }

  return {
    drafted,
    total: drafted.reduce((sum, entry) => sum + entry.count, 0),
    unknownTypes,
    unchanged,
  };
}

/** The label a type is known by, for an operator reading the result. */
export function typeLabel(type: string): string {
  return KNOWN.has(type) ? CONTENT_REGISTRY[type as ContentType].label : type;
}
