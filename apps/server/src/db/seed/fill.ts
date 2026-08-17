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
}

/**
 * Works out what is missing. Pure — the caller writes it, so a dry run costs no
 * transaction and the decision is testable without a database.
 */
export function planFill(
  seeds: readonly SeedGroup[],
  live: readonly { contentType: string; key: string }[],
  normalised?: Map<ContentType, Map<string, unknown>>,
): FillReport {
  const held = new Set(live.map((entry) => `${entry.contentType}:${entry.key}`));
  const added: FillReport['added'] = [];
  const perType = new Map<ContentType, number>();

  for (const seed of seeds) {
    for (const entity of seed.entities) {
      if (held.has(`${seed.contentType}:${entity.key}`)) continue;
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

  return { added, perType };
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
    await contentRepo.insertRevision(tx, {
      rev,
      publishedBy: 'seed',
      note: `Filled in ${report.added.length} missing entities: ${[...report.perType.keys()].join(', ')}`,
      summary: { added: report.added.length, modified: 0, removed: 0 },
      snapshot: await snapshotOf(tx),
    });
  });
  return rev;
}
