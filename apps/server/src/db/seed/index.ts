import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { loadConfig } from '../../lib/config';
import * as schema from '../schema/index';

/**
 * Seed harness.
 *
 * Loads content definitions into empty content tables. Player data is never touched,
 * whatever the flags — a seed run must be safe against production.
 *
 * Phase P0 establishes the harness and its safety rules; the actual content seeds
 * (champions, skills, stages, config) arrive with the content schema in Phase P1.
 */

interface SeedOptions {
  /** Re-seed content definitions even when rows already exist. */
  forceContent: boolean;
}

function parseArgs(argv: string[]): SeedOptions {
  return { forceContent: argv.includes('--force-content') };
}

/** A seeder owns one content area; each reports what it did for the run summary. */
interface Seeder {
  name: string;
  run(db: ReturnType<typeof drizzle<typeof schema>>, options: SeedOptions): Promise<string>;
}

const SEEDERS: Seeder[] = [
  // Phase P1 registers champion, skill, enemy, stage and game_config seeders here.
];

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema, casing: 'snake_case' });

  try {
    if (SEEDERS.length === 0) {
      console.log('No content seeders registered yet (content schema lands in Phase P1).');
      console.log('Database is reachable and migrations can be verified — nothing to seed.');
      return;
    }

    console.log(
      `Seeding ${SEEDERS.length} content area(s)${options.forceContent ? ' (force)' : ''} …`,
    );
    for (const seeder of SEEDERS) {
      const summary = await seeder.run(db, options);
      console.log(`  ✓ ${seeder.name}: ${summary}`);
    }
    console.log('Seed complete.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:');
  console.error(error);
  process.exit(1);
});
