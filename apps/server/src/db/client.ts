import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index';

/**
 * PostgreSQL connection pool and Drizzle client.
 *
 * The pool is deliberately small: production is a single-core box where a large pool
 * only adds contention (docs/ARCHITECTURE.md §9).
 */

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: pg.Pool;
  close(): Promise<void>;
  /** Pool telemetry for the health endpoint. */
  stats(): { total: number; idle: number; waiting: number };
}

export function createDatabase(options: {
  connectionString: string;
  maxConnections: number;
  /** Reports pool-level problems; kept as a callback so this stays logger-agnostic. */
  log?: (message: string, error: unknown) => void;
}): DbHandle {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.maxConnections,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    // Fail fast rather than hanging a request behind a wedged query.
    statement_timeout: 15_000,
    query_timeout: 15_000,
  });

  pool.on('error', (error) => {
    // An idle client erroring out is recoverable — log it, never crash the process.
    options.log?.('idle postgres client error', error);
  });

  const db = drizzle(pool, { schema, casing: 'snake_case' });

  return {
    db,
    pool,
    async close() {
      await pool.end();
    },
    stats() {
      return {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount,
      };
    },
  };
}

export { schema };
