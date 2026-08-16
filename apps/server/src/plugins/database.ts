import fp from 'fastify-plugin';
import { createDatabase, type Database, type DbHandle } from '../db/client';

declare module 'fastify' {
  interface FastifyInstance {
    db: Database;
    dbHandle: DbHandle;
  }
}

/**
 * Attaches the Drizzle client to the Fastify instance and closes the pool on shutdown.
 * A failed connection check at boot stops the process — better than serving 500s.
 */
export const databasePlugin = fp(
  async (app) => {
    const handle = createDatabase({
      connectionString: app.config.DATABASE_URL,
      maxConnections: app.config.DATABASE_POOL_MAX,
      log: (message, error) => app.log.error({ err: error }, message),
    });

    // Verify connectivity before we start accepting traffic.
    const probe = await handle.pool.connect();
    probe.release();

    app.decorate('db', handle.db);
    app.decorate('dbHandle', handle);

    app.addHook('onClose', async () => {
      await handle.close();
    });

    app.log.info(
      { maxConnections: app.config.DATABASE_POOL_MAX },
      'database connection established',
    );
  },
  { name: 'database' },
);
