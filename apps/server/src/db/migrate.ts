import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadConfig } from '../lib/config';

/**
 * Applies pending migrations, then exits.
 *
 * Run by `UPDATE.sh` before the service restarts, and by developers via
 * `pnpm db:migrate`. Uses its own single connection rather than the app pool.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const migrationsFolder = resolve(dirname(fileURLToPath(import.meta.url)), '../../drizzle');

  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 1 });
  const db = drizzle(pool);

  try {
    // Case-insensitive account and profile names depend on this extension.
    await db.execute(sql`create extension if not exists citext`);

    console.log(`Applying migrations from ${migrationsFolder} …`);
    await migrate(db, { migrationsFolder });
    console.log('Migrations up to date.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Migration failed:');
  console.error(error);
  process.exit(1);
});
