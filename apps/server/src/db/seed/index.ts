import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { validateAndNormalise } from '../../content/validate';
import * as contentRepo from '../../content/repo';
import { loadConfig } from '../../lib/config';
import * as schema from '../schema/index';
import { buildSeedContent, parseSeedContent } from './seeders';
import { applyFill, planFill } from './fill';
import type { ContentSet } from '../../content/validate';
import type { ContentType } from '@mistvale/shared';

/**
 * Seed harness.
 *
 * Loads the committed content into an empty install. Player data is never touched,
 * whatever the flags — a seed run must be safe to execute against production.
 *
 * By default it refuses to overwrite content that already exists, because after the
 * first deploy the database (edited through the Admin Suite) is the source of truth.
 * `--force-content` replaces it deliberately, and `UPDATE.sh` takes a backup first.
 *
 * It does, however, **fill in whatever the install is missing**. A release that adds a
 * content family (quests in P8) or — far more often — a handful of `game_config` keys for
 * a new feature would otherwise be invisible on every existing server: the guard sees
 * content, skips everything, and the feature runs on fallbacks nobody chose. The only way
 * out was `--force-content`, which discards an operator's tuning to deliver rows they
 * never had.
 *
 * The rule is simple and worth keeping simple: **a plain seed adds what is absent and
 * changes nothing that is present.** Insertion is `on conflict do nothing`, so an
 * operator's edit can never be overwritten, and every addition is printed and recorded as
 * its own revision. The cost is that content deliberately *deleted* comes back on the next
 * seed — retiring content is what the `active` flag is for, and a flag survives this where
 * a deletion does not.
 */

interface SeedOptions {
  forceContent: boolean;
  dryRun: boolean;
}

function parseArgs(argv: string[]): SeedOptions {
  return {
    forceContent: argv.includes('--force-content'),
    dryRun: argv.includes('--dry-run'),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const config = loadConfig();

  const seeds = buildSeedContent();

  // 1. Shape: every entity must satisfy its own schema.
  const parsed = parseSeedContent(seeds);
  if (!parsed.ok) {
    console.error(`Seed data is invalid (${parsed.problems.length} problem(s)):`);
    for (const problem of parsed.problems.slice(0, 40)) console.error(`  - ${problem}`);
    if (parsed.problems.length > 40) {
      console.error(`  … and ${parsed.problems.length - 40} more`);
    }
    process.exit(1);
  }

  // 2. Cross-references and engine registry, exactly as a publish would check them.
  const contentSet: ContentSet = new Map();
  for (const seed of seeds) {
    contentSet.set(
      seed.contentType,
      new Map(seed.entities.map((entity) => [entity.key, entity.data])),
    );
  }

  const { result: validation, normalised } = validateAndNormalise(contentSet);
  if (!validation.ok) {
    console.error(`Seed content failed validation (${validation.errors.length} error(s)):`);
    for (const issue of validation.errors.slice(0, 40)) {
      console.error(
        `  - ${issue.contentType}/${issue.key}${issue.path ? `.${issue.path}` : ''}: ${issue.message}`,
      );
    }
    process.exit(1);
  }
  for (const warning of validation.warnings) {
    console.warn(`  ! ${warning.contentType}/${warning.key}: ${warning.message}`);
  }

  console.log(
    `Seed content validated: ${parsed.total} entities, ${validation.warnings.length} warning(s).`,
  );

  if (options.dryRun) {
    console.log('--dry-run: nothing written.');
    return;
  }

  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: 1 });
  const db = drizzle(pool, { schema, casing: 'snake_case' });

  try {
    const existing = await contentRepo.listByState(db, 'live');

    if (existing.length > 0 && !options.forceContent) {
      console.log(
        `Content already present (${existing.length} live entities at revision ${await contentRepo.latestRevision(db)}).`,
      );

      const fill = planFill(seeds, existing, normalised);

      if (fill.added.length === 0) {
        console.log(
          'Nothing missing. Use --force-content to replace what is there (player data is never touched).',
        );
        return;
      }

      const rev = await applyFill(db, fill);
      for (const [contentType, count] of fill.perType) console.log(`  + ${contentType}: ${count}`);
      console.log(
        `Filled in ${fill.added.length} missing entities at revision ${rev}. Nothing existing was changed.`,
      );
      console.log('Restart the server (or publish from Admin) to load it into the cache.');
      return;
    }

    // Written from the normalised set, so a seeded install and an Admin-published one
    // store byte-identical content (see ContentValidationPass).
    const flattened = seeds.flatMap((seed) =>
      seed.entities.map((entity) => ({
        contentType: seed.contentType satisfies ContentType,
        key: entity.key,
        data: normalised.get(seed.contentType)?.get(entity.key) ?? entity.data,
      })),
    );

    const rev = (await contentRepo.latestRevision(db)) + 1;

    await db.transaction(async (tx) => {
      await contentRepo.replaceLiveContent(tx, flattened);
      await contentRepo.insertRevision(tx, {
        rev,
        publishedBy: 'seed',
        note: existing.length > 0 ? 'Re-seeded from committed content' : 'Initial content seed',
        summary: { added: flattened.length, modified: 0, removed: 0 },
        snapshot: Object.fromEntries(
          seeds.map((seed) => [
            seed.contentType,
            Object.fromEntries(normalised.get(seed.contentType) ?? []),
          ]),
        ),
      });
      // Drafts describe changes against the previous content; they would be
      // meaningless — and possibly destructive — against a freshly seeded set.
      await contentRepo.deleteAllDrafts(tx);
    });

    for (const seed of seeds) {
      console.log(`  ✓ ${seed.contentType}: ${seed.entities.length}`);
    }
    console.log(`Seed complete — ${flattened.length} entities live at revision ${rev}.`);
    console.log('Restart the server (or publish from Admin) to load it into the cache.');
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:');
  console.error(error);
  process.exit(1);
});
