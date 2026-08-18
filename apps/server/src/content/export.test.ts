import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { contentEntries, contentRevisions } from '../db/schema/index';
import { buildTestApp, isDatabaseAvailable, truncateAll } from '../test/harness';
import * as repo from './repo';
import { exportContent } from './export';

/**
 * The snapshot, and the one property that makes it worth having.
 *
 * A backup is the smaller half of what this is for. The larger half is that `git diff`
 * after an operator's evening should say what they changed — and that only works if two
 * exports of identical content are byte-identical. Row order out of PostgreSQL is not
 * guaranteed and `JSON.stringify` preserves whatever key order a JSONB column happens to
 * hand back, so without sorting, a snapshot would churn on every run and the diff would be
 * worthless within a week.
 */

const dbUp = await isDatabaseAvailable();

describe.skipIf(!dbUp)('the content snapshot', () => {
  let app: FastifyInstance;
  let directory: string;

  beforeAll(async () => {
    app = await buildTestApp();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(async () => {
    await truncateAll(app);
    await app.db.delete(contentEntries);
    await app.db.delete(contentRevisions);
    directory = await mkdtemp(join(tmpdir(), 'mistvale-snapshot-'));
  });

  /** Publishes a handful of entities whose keys and fields are deliberately out of order. */
  async function publish(): Promise<void> {
    await app.db.transaction(async (tx) => {
      await repo.replaceLiveContent(tx, [
        { contentType: 'faction', key: 'zephyr', data: { key: 'zephyr', name: 'Zephyr' } },
        { contentType: 'faction', key: 'ashen', data: { name: 'Ashen', key: 'ashen' } },
        { contentType: 'item', key: 'sigil', data: { key: 'sigil', name: 'Sigil' } },
      ]);
      await repo.insertRevision(tx, {
        rev: 7,
        publishedBy: 'test',
        note: 'snapshot fixture',
        summary: { added: 3, modified: 0, removed: 0 },
        snapshot: {},
      });
    });
  }

  it('writes one file per content type, and a manifest naming the revision', async () => {
    await publish();
    const summary = await exportContent(app.db, directory);

    expect(summary.rev).toBe(7);
    expect(summary.total).toBe(3);

    const files = (await readdir(directory)).sort();
    expect(files).toEqual(['faction.json', 'item.json', 'manifest.json']);

    const manifest = JSON.parse(await readFile(join(directory, 'manifest.json'), 'utf8'));
    expect(manifest.rev).toBe(7);
  });

  it('is byte-identical across two runs, which is the whole point', async () => {
    await publish();
    await exportContent(app.db, directory);
    const first = await readFile(join(directory, 'faction.json'), 'utf8');

    await exportContent(app.db, directory);
    const second = await readFile(join(directory, 'faction.json'), 'utf8');

    expect(second).toBe(first);
  });

  it('sorts entities by key, so a diff is about the change and not the order', async () => {
    await publish();
    await exportContent(app.db, directory);

    const factions = JSON.parse(await readFile(join(directory, 'faction.json'), 'utf8')) as {
      key: string;
    }[];
    expect(factions.map((entry) => entry.key)).toEqual(['ashen', 'zephyr']);
  });

  it('sorts the fields inside an entity too', async () => {
    // `data` is a JSONB column; two rows written a month apart can come back with their
    // keys in different orders, and an unsorted export would read as a content change.
    await publish();
    await exportContent(app.db, directory);

    const body = await readFile(join(directory, 'faction.json'), 'utf8');
    const ashen = JSON.parse(body)[0] as { data: Record<string, unknown> };
    expect(Object.keys(ashen.data)).toEqual(['key', 'name']);
  });

  it('clears a file for a type that no longer has content', async () => {
    // A file left behind reads exactly like current content, which is the worst way for a
    // snapshot to lie.
    await publish();
    await exportContent(app.db, directory);
    expect(await readdir(directory)).toContain('item.json');

    await app.db.transaction(async (tx) => {
      await repo.replaceLiveContent(tx, [
        { contentType: 'faction', key: 'ashen', data: { key: 'ashen', name: 'Ashen' } },
      ]);
    });
    await exportContent(app.db, directory);

    expect(await readdir(directory)).not.toContain('item.json');
  });

  it('leaves a file it did not write alone', async () => {
    // The directory holds a README explaining what a snapshot is; an export must not eat
    // its own documentation.
    await writeFile(join(directory, 'README.md'), '# Snapshot\n', 'utf8');
    await publish();
    await exportContent(app.db, directory);

    expect(await readdir(directory)).toContain('README.md');
  });

  it('exports what is live, never what is in draft', async () => {
    // An operator mid-edit must not have half-finished work committed on their behalf.
    await publish();
    await repo.upsertEntry(app.db, {
      contentType: 'faction',
      key: 'draftling',
      state: 'draft',
      data: { key: 'draftling', name: 'Draftling' },
      updatedBy: 'test',
    });

    const summary = await exportContent(app.db, directory);
    expect(summary.total).toBe(3);
    const body = await readFile(join(directory, 'faction.json'), 'utf8');
    expect(body).not.toContain('draftling');
  });
});
