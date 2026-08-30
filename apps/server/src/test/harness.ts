import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../app';
import { contentEntries, contentRevisions } from '../db/schema/index';
import { buildSeedContent } from '../db/seed/seeders';
import * as contentRepo from '../content/repo';
import { validateAndNormalise, type ContentSet } from '../content/validate';
import { loadConfig, resetConfigCache, type AppConfig } from '../lib/config';

/**
 * Integration-test harness.
 *
 * Tests run against a real PostgreSQL database, never a mock: the schema, its
 * constraints, and the transaction behaviour are exactly what we are trying to verify
 * (docs/ARCHITECTURE.md §11). When no test database is configured the suites skip
 * themselves rather than failing, so a fresh checkout can still run `pnpm test`.
 */

export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  (process.env.NODE_ENV === 'test' ? process.env.DATABASE_URL : undefined) ??
  'postgresql://mistvale:mistvale_dev@127.0.0.1:5432/mistvale_test';

let databaseAvailable: boolean | null = null;

/** True when the test database can be reached; memoised across suites. */
export async function isDatabaseAvailable(): Promise<boolean> {
  if (databaseAvailable !== null) return databaseAvailable;
  const pg = await import('pg');
  const pool = new pg.default.Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    const client = await pool.connect();
    client.release();
    databaseAvailable = true;
  } catch {
    databaseAvailable = false;
  } finally {
    await pool.end().catch(() => undefined);
  }
  return databaseAvailable;
}

export function testConfig(): AppConfig {
  resetConfigCache();
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = TEST_DATABASE_URL;
  process.env.SESSION_PEPPER = 'test-pepper-value-at-least-16-chars';
  process.env.PUBLIC_ORIGIN = 'http://localhost:5173';
  // Rate limiting off: suites fire many logins in a row on purpose.
  process.env.RATE_LIMIT_ENABLED = 'false';
  process.env.LOG_LEVEL = 'silent';
  return loadConfig();
}

export async function buildTestApp(): Promise<FastifyInstance> {
  // `MISTVALE_TEST_LOGS=1` surfaces server-side errors while debugging a failing test;
  // silent by default so a normal run stays readable.
  return buildApp({
    config: testConfig(),
    logger: process.env.MISTVALE_TEST_LOGS ? { level: 'error' } : false,
  });
}

/**
 * Publishes the committed seeds as live content, and loads them into the cache.
 *
 * Any suite that fights a battle, reads a stage or resolves a champion needs the real
 * content behind it — a mock would be testing the mock. Suites share one database and each
 * of them starts by replacing what is there, so the revision numbering below is the only
 * one in play whatever ran before.
 *
 * Twenty-five suites carry their own copy of this, each written before there was a shared
 * one. New tests should use this; folding the existing copies in is a tidy-up worth doing
 * on its own rather than inside a pass about something else.
 */
export async function seedLiveContent(app: FastifyInstance): Promise<void> {
  const seeds = buildSeedContent();
  const set: ContentSet = new Map();
  for (const seed of seeds) {
    set.set(seed.contentType, new Map(seed.entities.map((entity) => [entity.key, entity.data])));
  }
  const { result, normalised } = validateAndNormalise(set);
  if (!result.ok) {
    throw new Error(`The seeds do not validate: ${JSON.stringify(result.errors.slice(0, 3))}`);
  }

  const flattened = seeds.flatMap((seed) =>
    seed.entities.map((entity) => ({
      contentType: seed.contentType,
      key: entity.key,
      data: normalised.get(seed.contentType)?.get(entity.key) ?? entity.data,
    })),
  );

  await app.db.transaction(async (tx) => {
    await tx.delete(contentEntries);
    await tx.delete(contentRevisions);
    await contentRepo.replaceLiveContent(tx, flattened);
    await contentRepo.insertRevision(tx, {
      rev: 1,
      publishedBy: 'test',
      note: 'test fixture',
      summary: { added: flattened.length, modified: 0, removed: 0 },
      snapshot: Object.fromEntries(
        seeds.map((seed) => [
          seed.contentType,
          Object.fromEntries(normalised.get(seed.contentType) ?? []),
        ]),
      ),
    });
  });

  await app.content.load();
  app.setContentRevision(app.content.rev);
}

/** Removes all rows created by tests, leaving the schema intact. */
export async function truncateAll(app: FastifyInstance): Promise<void> {
  await app.db.execute(
    sql`truncate table economy_log, audit_log, sessions, players, accounts restart identity cascade`,
  );
}

/** A unique account name per call, so parallel suites cannot collide. */
export function uniqueAccountName(prefix = 'test'): string {
  return `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 10)}`;
}

export function uniqueProfileName(prefix = 'Test'): string {
  return `${prefix}${randomUUID().replaceAll('-', '').slice(0, 8)}`;
}

/** Extracts the session cookie value from a Set-Cookie header list. */
export function extractSessionCookie(setCookie: string | string[] | undefined): string | undefined {
  if (!setCookie) return undefined;
  const headers = Array.isArray(setCookie) ? setCookie : [setCookie];
  for (const header of headers) {
    const match = /^mv_session=([^;]+)/.exec(header);
    if (match?.[1] && match[1] !== '') return match[1];
  }
  return undefined;
}
