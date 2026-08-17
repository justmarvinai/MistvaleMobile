import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { loadConfig } from '../lib/config';
import { ContentCache } from '../content/cache';
import * as schema from '../db/schema/index';
import { census, refreshLadder, seedLadder } from '../modules/arena/bots';

/**
 * Fills the Arena's bot ladder from the command line.
 *
 * The content seed deliberately never writes player data — a seed run has to be safe
 * against production — and bots *are* player data. So they get their own entry point,
 * called by DEPLOY.sh after the content seed, and available to an operator any time the
 * ladder needs topping up before the nightly job would get to it.
 *
 * Idempotent: it creates only the difference between what each band should hold and what
 * it does, so running it twice is running it once.
 *
 * Usage: pnpm --filter @mistvale/server seed-bots [--refresh]
 *   --refresh  also rebuild every existing bot's roster and drift its rating, exactly as
 *              the nightly job does. Without it, bots already on the ladder are left alone.
 */
async function main(): Promise<void> {
  const refresh = process.argv.slice(2).includes('--refresh');
  const config = loadConfig();

  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema, casing: 'snake_case' });

  try {
    const content = new ContentCache(db);
    await content.load();
    if (content.rev === 0) {
      console.error('No content is published. Run the content seed first.');
      process.exit(1);
    }

    const ctx = { db, content };
    const report = refresh ? await refreshLadder(ctx) : await seedLadder(ctx);

    console.log(
      `Ladder: ${report.created} created, ${report.refreshed} refreshed, ${report.removed} removed.`,
    );
    for (const band of (await census(ctx)).bands) {
      console.log(
        `  ${band.band.padEnd(9)} ${String(band.present).padStart(3)}/${band.wanted}` +
          `  (${band.ratingMin}–${band.ratingMax})`,
      );
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Bot seeding failed:');
  console.error(error);
  process.exit(1);
});
