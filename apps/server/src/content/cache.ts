import { createHash } from 'node:crypto';
import {
  CONTENT_LOAD_ORDER,
  CONTENT_REGISTRY,
  CONTENT_TYPES,
  type ContentBundle,
  type ContentDiff,
  type ContentDiffEntry,
  type ContentType,
  type ContentValidationResult,
  type GameConfigEntry,
} from '@mistvale/shared';
import type { Database } from '../db/client';
import { AppError } from '../lib/errors';
import * as repo from './repo';
import { validateAndNormalise, validateContentSet, type ContentSet } from './validate';

/**
 * The in-memory content cache.
 *
 * All live content is loaded once at boot into frozen structures and served from memory:
 * content is read on nearly every request and changes only on publish, so querying the
 * database for it would be pure waste on a one-core box.
 *
 * Publishing swaps the whole snapshot atomically. Readers hold a reference to one
 * immutable snapshot, so a publish can never show a request half of the old content and
 * half of the new (docs/ARCHITECTURE.md §5.4).
 */

/** An immutable view of all live content at one revision. */
export interface ContentSnapshot {
  rev: number;
  publishedAt: string | null;
  byType: ReadonlyMap<ContentType, ReadonlyMap<string, unknown>>;
  bundle: ContentBundle;
  /** ETag for the bundle endpoint. */
  etag: string;
  bundleJson: string;
}

const EMPTY_BUNDLE_TYPES = {
  factions: 'faction',
  statuses: 'status',
  skills: 'skill',
  assets: 'asset',
  champions: 'champion',
  enemies: 'enemy',
  gearSets: 'gearSet',
  gearSlots: 'gearSlot',
  gearStats: 'gearStat',
  items: 'item',
  campaignChapters: 'campaignChapter',
  dungeons: 'dungeon',
  stages: 'stage',
  summonPools: 'summonPool',
  shops: 'shop',
  masteries: 'mastery',
  quests: 'quest',
} as const satisfies Record<string, ContentType>;

export class ContentCache {
  private snapshot: ContentSnapshot;

  constructor(private readonly db: Database) {
    this.snapshot = buildSnapshot(new Map(), 0, null);
  }

  /** The current immutable snapshot. Cheap; call it per request. */
  current(): ContentSnapshot {
    return this.snapshot;
  }

  get rev(): number {
    return this.snapshot.rev;
  }

  /** Loads live content from the database and swaps it in. */
  async load(): Promise<ContentSnapshot> {
    const [rows, rev] = await Promise.all([
      repo.listByState(this.db, 'live'),
      repo.latestRevision(this.db),
    ]);

    const byType: ContentSet = new Map();
    for (const row of rows) {
      const entities = byType.get(row.contentType) ?? new Map<string, unknown>();
      entities.set(row.key, row.data);
      byType.set(row.contentType, entities);
    }

    const revision = rev > 0 ? await repo.findRevision(this.db, rev) : undefined;
    this.snapshot = buildSnapshot(byType, rev, revision?.publishedAt?.toISOString() ?? null);
    return this.snapshot;
  }

  /** Reads the draft state layered over live — what an editor is actually working on. */
  async draftSet(): Promise<ContentSet> {
    const [live, drafts] = await Promise.all([
      repo.listByState(this.db, 'live'),
      repo.listByState(this.db, 'draft'),
    ]);

    const merged: ContentSet = new Map();
    for (const row of live) {
      const entities = merged.get(row.contentType) ?? new Map<string, unknown>();
      entities.set(row.key, row.data);
      merged.set(row.contentType, entities);
    }
    for (const row of drafts) {
      const entities = merged.get(row.contentType) ?? new Map<string, unknown>();
      if (row.deleted) entities.delete(row.key);
      else entities.set(row.key, row.data);
      merged.set(row.contentType, entities);
    }
    return merged;
  }

  /** Validates the draft state without changing anything. */
  async validateDrafts(): Promise<ContentValidationResult> {
    return validateContentSet(await this.draftSet());
  }

  /** Computes the difference between live content and the pending drafts. */
  async diff(): Promise<ContentDiff> {
    const drafts = await repo.listByState(this.db, 'draft');
    const entries: ContentDiffEntry[] = [];
    const totals = { added: 0, modified: 0, removed: 0 };

    for (const draft of drafts) {
      const live = await repo.findEntry(this.db, draft.contentType, draft.key, 'live');

      if (draft.deleted) {
        if (!live) continue; // Drafted then deleted before ever going live.
        entries.push({
          contentType: draft.contentType,
          key: draft.key,
          change: 'removed',
          fields: [],
          risk: 'balance',
        });
        totals.removed += 1;
        continue;
      }

      if (!live) {
        entries.push({
          contentType: draft.contentType,
          key: draft.key,
          change: 'added',
          fields: [],
        });
        totals.added += 1;
        continue;
      }

      const fields = diffFields(live.data, draft.data);
      if (fields.length === 0) continue; // Saved without changing anything.

      entries.push({
        contentType: draft.contentType,
        key: draft.key,
        change: 'modified',
        fields,
        risk: assessRisk(draft.contentType, fields),
      });
      totals.modified += 1;
    }

    entries.sort(
      (a, b) => a.contentType.localeCompare(b.contentType) || a.key.localeCompare(b.key),
    );
    return { rev: this.snapshot.rev, entries, totals };
  }

  /**
   * Publishes the drafts.
   *
   * Validates first, then in one transaction: applies drafts over live, records a
   * revision with a full snapshot, and clears the drafts. The in-memory cache is only
   * swapped after the transaction commits, so a failed publish leaves players on exactly
   * the content they were already seeing.
   */
  async publish(options: {
    publishedBy: string;
    accountId?: string | null;
    note?: string;
  }): Promise<{
    rev: number;
    summary: ContentDiff['totals'];
    validation: ContentValidationResult;
  }> {
    const { result: validation, normalised } = validateAndNormalise(await this.draftSet());
    if (!validation.ok) {
      throw new AppError('VALIDATION', 'Content has errors and cannot be published.', {
        details: validation.errors,
      });
    }

    const diff = await this.diff();
    if (diff.entries.length === 0) {
      throw new AppError('VALIDATION', 'There is nothing to publish.');
    }

    // The parsed entities go to disk, not the drafts as typed: see ContentValidationPass.
    const merged = normalised;
    const nextRev = (await repo.latestRevision(this.db)) + 1;

    const flattened: { contentType: ContentType; key: string; data: unknown }[] = [];
    const snapshotJson: Record<string, Record<string, unknown>> = {};
    for (const contentType of CONTENT_LOAD_ORDER) {
      const entities = merged.get(contentType);
      if (!entities) continue;
      snapshotJson[contentType] = {};
      for (const [key, data] of entities) {
        flattened.push({ contentType, key, data });
        snapshotJson[contentType][key] = data;
      }
    }

    await this.db.transaction(async (tx) => {
      await repo.replaceLiveContent(tx, flattened);
      await repo.insertRevision(tx, {
        rev: nextRev,
        publishedBy: options.publishedBy,
        accountId: options.accountId ?? null,
        note: options.note ?? '',
        summary: diff.totals,
        snapshot: snapshotJson,
      });
      await repo.deleteAllDrafts(tx);
    });

    await repo.pruneRevisions(this.db).catch(() => undefined);
    await this.load();

    return { rev: nextRev, summary: diff.totals, validation };
  }

  /**
   * Restores a previous revision.
   *
   * Recorded as a new revision rather than by rewinding history, so the audit trail
   * stays append-only and you can always see that a revert happened.
   */
  async revert(options: {
    targetRev: number;
    publishedBy: string;
    accountId?: string | null;
  }): Promise<{ rev: number }> {
    const revision = await repo.findRevision(this.db, options.targetRev);
    if (!revision) throw AppError.notFound(`No revision ${options.targetRev}.`);

    const snapshot = revision.snapshot as Record<string, Record<string, unknown>>;
    const flattened: { contentType: ContentType; key: string; data: unknown }[] = [];
    for (const contentType of CONTENT_LOAD_ORDER) {
      for (const [key, data] of Object.entries(snapshot[contentType] ?? {})) {
        flattened.push({ contentType, key, data });
      }
    }

    const nextRev = (await repo.latestRevision(this.db)) + 1;

    await this.db.transaction(async (tx) => {
      await repo.replaceLiveContent(tx, flattened);
      await repo.insertRevision(tx, {
        rev: nextRev,
        publishedBy: options.publishedBy,
        accountId: options.accountId ?? null,
        note: `Reverted to revision ${options.targetRev}`,
        summary: { added: 0, modified: flattened.length, removed: 0 },
        snapshot,
      });
      await repo.deleteAllDrafts(tx);
    });

    await this.load();
    return { rev: nextRev };
  }
}

/** Builds the immutable snapshot and its serialised bundle. */
function buildSnapshot(
  byType: ContentSet,
  rev: number,
  publishedAt: string | null,
): ContentSnapshot {
  const frozen = new Map<ContentType, ReadonlyMap<string, unknown>>();
  for (const contentType of CONTENT_TYPES) {
    frozen.set(contentType, new Map(fillDefaults(contentType, byType.get(contentType))));
  }

  const sorted = (contentType: ContentType): unknown[] =>
    [...(frozen.get(contentType)?.values() ?? [])].sort((a, b) => {
      const left = a as { sortOrder?: number; key?: string };
      const right = b as { sortOrder?: number; key?: string };
      return (
        (left.sortOrder ?? 0) - (right.sortOrder ?? 0) ||
        (left.key ?? '').localeCompare(right.key ?? '')
      );
    });

  const config: Record<string, GameConfigEntry['value']> = {};
  for (const entry of frozen.get('gameConfig')?.values() ?? []) {
    const typed = entry as GameConfigEntry;
    config[typed.key] = typed.value;
  }

  const bundle = {
    rev,
    publishedAt,
    config,
  } as ContentBundle;

  for (const [bundleKey, contentType] of Object.entries(EMPTY_BUNDLE_TYPES)) {
    // Each bundle field is the sorted list of its content type; the cast is safe
    // because the registry and the bundle interface are kept in step by the mapping.
    (bundle as unknown as Record<string, unknown[]>)[bundleKey] = sorted(contentType);
  }

  const bundleJson = JSON.stringify(bundle);
  const etag = `W/"content-${rev}-${createHash('sha1').update(bundleJson).digest('hex').slice(0, 16)}"`;

  return { rev, publishedAt, byType: frozen, bundle, bundleJson, etag };
}

/**
 * Parses stored content through its schema on the way into the snapshot.
 *
 * Content is normalised when it is *written*, which makes every row complete as of the
 * schema it was written under — and incomplete the moment a later release adds a field
 * with a default. That gap is a real deploy, not a hypothetical: new code goes live and
 * runs against the last published revision until an operator publishes again, and until
 * then `drops.gearSetKeys` is simply absent.
 *
 * Parsing here closes it, and makes the promise the entity contracts already make — that
 * anything read out of the bundle is a complete `…Def` — true by construction rather than
 * by convention. An entity that cannot be parsed at all is passed through untouched: the
 * publish validator is the gate that keeps broken content out, and a snapshot that
 * refused to build would take the whole game down over one bad row.
 */
function fillDefaults(
  contentType: ContentType,
  entities: ReadonlyMap<string, unknown> | undefined,
): Map<string, unknown> {
  const schema = CONTENT_REGISTRY[contentType].schema;
  const parsed = new Map<string, unknown>();
  for (const [key, data] of entities ?? []) {
    const result = schema.safeParse(data);
    parsed.set(key, result.success ? result.data : data);
  }
  return parsed;
}

/** Shallow field-level diff; nested objects are compared as wholes. */
function diffFields(
  before: unknown,
  after: unknown,
): { path: string; before: unknown; after: unknown }[] {
  const left = (before ?? {}) as Record<string, unknown>;
  const right = (after ?? {}) as Record<string, unknown>;
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  const changes: { path: string; before: unknown; after: unknown }[] = [];

  for (const key of keys) {
    if (JSON.stringify(left[key]) === JSON.stringify(right[key])) continue;
    changes.push({ path: key, before: left[key], after: right[key] });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

/** Flags changes that deserve a second look in the publish diff. */
function assessRisk(
  contentType: ContentType,
  fields: { path: string }[],
): ContentDiffEntry['risk'] {
  const paths = new Set(fields.map((field) => field.path));
  if (contentType === 'champion' && (paths.has('baseStats') || paths.has('skills'))) {
    return 'balance';
  }
  if (contentType === 'gameConfig' && paths.has('value')) return 'economy';
  if (contentType === 'stage' && (paths.has('rewards') || paths.has('waves'))) return 'economy';
  return undefined;
}

/** Human label for a content type, used in messages. */
export function contentLabel(contentType: ContentType): string {
  return CONTENT_REGISTRY[contentType].label;
}
