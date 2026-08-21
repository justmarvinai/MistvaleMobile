import type { ContentType } from '@mistvale/shared';
import * as contentRepo from '../../content/repo';
import type { Database } from '../client';

/**
 * Filling in what an install is missing, without touching what it has.
 *
 * A plain `SEED.sh` on an install that already has content used to do nothing at all, on
 * the sound principle that after the first deploy the database is the source of truth. The
 * unsound consequence was that a release adding content could never deliver it: quests in
 * P8 arrived as an empty screen, and — far more often — the handful of `game_config` keys
 * every new feature brings never landed, so the feature ran on code fallbacks nobody chose.
 * The only escape was `--force-content`, which throws away an operator's tuning to deliver
 * rows they never had.
 *
 * So the rule is: **add what is absent, change nothing that is present.** The insert is
 * `on conflict do nothing`, which makes "cannot overwrite an edit" a property of the
 * statement rather than of the logic above it.
 *
 * The one thing this trades away is deletion: content an operator deleted comes back on
 * the next seed. Retiring content is what the `active` flag is for, and a flag survives a
 * seed where a deletion cannot.
 *
 * **The same argument, one level down.** A release that adds a *field* could not deliver it
 * either, and that failed just as quietly: the tutorial gained `portrait` and `sound`, the
 * two new music cues arrived because they were new *entities*, and the fifteen steps that
 * already existed kept a stored shape with neither key in it. Every one parsed cleanly — the
 * schema defaults a missing key to `''` — so nothing complained anywhere, and on the one
 * install that mattered the Wardenmaster had no face and no voice.
 *
 * So the fill also backfills: for an entity that is already live, any key the seed has and
 * the stored row does not. Safe for the same reason the insert is — a key that is *absent*
 * has never been authored, because everything written through Admin goes through the schema
 * and comes back with every key the schema knows. **Top level only.** A nested map like
 * `rewards` is a single authored value: an operator who emptied it meant to empty it, and
 * merging the seed's keys back in would be the overwrite this file exists to prevent. A new
 * field *inside* a nested object needs no help anyway — it is defaulted at read time like
 * every other missing key.
 */

export interface SeedGroup {
  contentType: ContentType;
  entities: { key: string; data: unknown }[];
}

export interface FillReport {
  /** Entities written, in seed order. */
  added: { contentType: ContentType; key: string; data: unknown }[];
  /** How many were added per content type, for the run log. */
  perType: Map<ContentType, number>;
  /** Live entities rewritten with the keys they were missing, and which keys those were. */
  patched: { contentType: ContentType; key: string; data: unknown; fields: string[] }[];
}

/** True for a plain `{}` — the only shape whose top-level keys are worth comparing. */
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Works out what is missing. Pure — the caller writes it, so a dry run costs no
 * transaction and the decision is testable without a database.
 */
export function planFill(
  seeds: readonly SeedGroup[],
  live: readonly { contentType: string; key: string; data?: unknown }[],
  normalised?: Map<ContentType, Map<string, unknown>>,
): FillReport {
  const held = new Map(live.map((entry) => [`${entry.contentType}:${entry.key}`, entry]));
  const added: FillReport['added'] = [];
  const patched: FillReport['patched'] = [];
  const perType = new Map<ContentType, number>();

  for (const seed of seeds) {
    for (const entity of seed.entities) {
      const existing = held.get(`${seed.contentType}:${entity.key}`);
      if (existing) {
        const wanted = normalised?.get(seed.contentType)?.get(entity.key) ?? entity.data;
        const stored = existing.data;
        if (!isRecord(wanted) || !isRecord(stored)) continue;
        const fields = Object.keys(wanted).filter((field) => !(field in stored));
        if (fields.length === 0) continue;
        patched.push({
          contentType: seed.contentType,
          key: entity.key,
          // The new keys first and the stored row spread over them, so a key that *is*
          // present wins even if this were ever rewritten carelessly.
          data: {
            ...Object.fromEntries(fields.map((field) => [field, wanted[field]])),
            ...stored,
          },
          fields,
        });
        continue;
      }
      added.push({
        contentType: seed.contentType,
        key: entity.key,
        // Normalised where available, so a filled-in entity is byte-identical to one the
        // same release would have published through Admin.
        data: normalised?.get(seed.contentType)?.get(entity.key) ?? entity.data,
      });
      perType.set(seed.contentType, (perType.get(seed.contentType) ?? 0) + 1);
    }
  }

  return { added, perType, patched };
}

/** The whole live set as a revision snapshot: `{ [contentType]: { [key]: data } }`. */
export async function snapshotOf(db: Database): Promise<Record<string, Record<string, unknown>>> {
  const live = await contentRepo.listByState(db, 'live');
  const snapshot: Record<string, Record<string, unknown>> = {};
  for (const entry of live) {
    (snapshot[entry.contentType] ??= {})[entry.key] = entry.data;
  }
  return snapshot;
}

/**
 * Writes a fill and records it as its own revision.
 *
 * The revision's snapshot is the *whole* live set after the addition rather than the
 * delta: a revision has to be revertible to on its own, and one holding only what was
 * added would revert an install to nothing but the new content.
 */
export async function applyFill(db: Database, report: FillReport): Promise<number> {
  const rev = (await contentRepo.latestRevision(db)) + 1;
  await db.transaction(async (tx) => {
    await contentRepo.addLiveContent(tx, report.added);
    await contentRepo.patchLiveContent(tx, report.patched);
    await contentRepo.insertRevision(tx, {
      rev,
      publishedBy: 'seed',
      note: fillNote(report),
      summary: { added: report.added.length, modified: report.patched.length, removed: 0 },
      snapshot: await snapshotOf(tx),
    });
  });
  return rev;
}

/** What the revision list says this run did — a backfill is not an addition. */
export function fillNote(report: FillReport): string {
  const parts: string[] = [];
  if (report.added.length > 0) {
    parts.push(
      `Filled in ${report.added.length} missing entities: ${[...report.perType.keys()].join(', ')}`,
    );
  }
  if (report.patched.length > 0) {
    parts.push(`Backfilled ${fieldsIn(report).join(', ')} on ${report.patched.length} existing`);
  }
  return parts.join('. ') || 'Nothing to fill';
}

/** Every key the backfill added, deduplicated — what the run log and the revision name. */
export function fieldsIn(report: FillReport): string[] {
  return [...new Set(report.patched.flatMap((entry) => entry.fields))].sort();
}
