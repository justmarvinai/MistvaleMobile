import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { validateAndNormalise } from '../../content/validate';
import * as contentRepo from '../../content/repo';
import { loadConfig } from '../../lib/config';
import * as schema from '../schema/index';
import { buildSeedContent, parseSeedContent } from './seeders';
import { applyFill, fieldsIn, planFill } from './fill';
import { CONTENT_TYPES, type ContentType } from '@mistvale/shared';
import type { Database } from '../client';
import type { ContentSet } from '../../content/validate';

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
 *
 * **`--replace <type>[,<type>]` is the middle ground**, and it exists because the
 * alternatives are both wrong for the commonest kind of content revision. A release that
 * *rewrites* something already published — the tutorial's script, a set of quest
 * descriptions — cannot reach an existing install through a plain seed, which only adds;
 * and `--force-content` delivers it by discarding every other tuning the operator has done
 * since launch. Naming the types keeps the blast radius the size of the change:
 *
 *   pnpm db:seed --replace tutorialStep
 *
 * It is still a *replace*, so an operator who has tuned the named type loses that tuning —
 * which is why it names types rather than defaulting to all of them, prints exactly what it
 * is about to overwrite, and is recorded as its own revision with the types in the note so
 * the change is revertable from Admin like any other publish.
 */

interface SeedOptions {
  forceContent: boolean;
  dryRun: boolean;
  /** Content types to overwrite wholesale, from `--replace a,b`. Empty means none. */
  replace: ContentType[];
}

function parseArgs(argv: string[]): SeedOptions {
  const flag = argv.indexOf('--replace');
  const named = flag >= 0 ? (argv[flag + 1] ?? '') : '';
  const replace = named
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  const unknown = replace.filter((entry) => !CONTENT_TYPES.includes(entry as ContentType));
  if (unknown.length > 0) {
    console.error(`--replace: unknown content type(s): ${unknown.join(', ')}`);
    console.error(`Known types: ${CONTENT_TYPES.join(', ')}`);
    process.exit(1);
  }

  return {
    forceContent: argv.includes('--force-content'),
    dryRun: argv.includes('--dry-run'),
    replace: replace as ContentType[],
  };
}

/**
 * Overwrites every entity of the named content types with what this release ships.
 *
 * Deliberately whole-type rather than field-level: a revision that rewrites a script is
 * rewriting *entities*, and patching a `body` while leaving a `title` from two releases ago
 * is a half-published change nobody asked for. What it never touches is a type nobody
 * named, which is the entire point of it existing beside `--force-content`.
 *
 * Returns how many rows it wrote, so the caller can tell "nothing to do" from "done".
 */
async function replaceTypes(
  db: Database,
  seeds: readonly {
    contentType: ContentType;
    entities: readonly { key: string; data: unknown }[];
  }[],
  normalised: Map<ContentType, Map<string, unknown>>,
  types: readonly ContentType[],
): Promise<number> {
  if (types.length === 0) return 0;

  const wanted = new Set(types);
  const rows = seeds
    .filter((seed) => wanted.has(seed.contentType))
    .flatMap((seed) =>
      seed.entities.map((entity) => ({
        contentType: seed.contentType,
        key: entity.key,
        data: normalised.get(seed.contentType)?.get(entity.key) ?? entity.data,
      })),
    );

  if (rows.length === 0) {
    console.log(`  ! --replace ${types.join(', ')}: this release ships no such entities.`);
    return 0;
  }

  const rev = (await contentRepo.latestRevision(db)) + 1;
  await db.transaction(async (tx) => {
    await contentRepo.patchLiveContent(tx, rows);
    await contentRepo.insertRevision(tx, {
      rev,
      publishedBy: 'seed',
      note: `Replaced ${types.join(', ')} from committed content`,
      summary: { added: 0, modified: rows.length, removed: 0 },
      snapshot: Object.fromEntries(
        seeds.map((seed) => [
          seed.contentType,
          Object.fromEntries(normalised.get(seed.contentType) ?? []),
        ]),
      ),
    });
  });

  for (const type of types) {
    const count = rows.filter((row) => row.contentType === type).length;
    console.log(`  ~ replaced ${type}: ${count} entities at revision ${rev}`);
  }
  return rows.length;
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

      if (fill.added.length > 0 || fill.patched.length > 0) {
        const rev = await applyFill(db, fill);
        for (const [contentType, count] of fill.perType) {
          console.log(`  + ${contentType}: ${count}`);
        }
        if (fill.added.length > 0) {
          console.log(`Filled in ${fill.added.length} missing entities at revision ${rev}.`);
        }
        if (fill.patched.length > 0) {
          // Named rather than counted: a backfill writes to rows an operator may have
          // edited, and "which keys, on how many" is the sentence that makes that
          // reviewable.
          console.log(
            `  ~ backfilled ${fieldsIn(fill).join(', ')} on ${fill.patched.length} existing entities at revision ${rev}`,
          );
        }
        console.log('No value that was already stored was changed.');
      }

      // **After the fill, not before it.** The fill plans against the snapshot read at the
      // top of this function and rebuilds each patched row as `{...missingFields,
      // ...stored}` — so a replace that ran first was silently undone by a backfill
      // writing the pre-replace row back over it. Running last also means a named type
      // that was only just *added* by the fill is replaced with the same content rather
      // than skipped, which is a no-op and the right one.
      const replaced = await replaceTypes(db, seeds, normalised, options.replace);

      if (fill.added.length === 0 && fill.patched.length === 0 && replaced === 0) {
        console.log(
          'Nothing missing. Use --replace <type> for one family, or --force-content for all of it (player data is never touched).',
        );
      }
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
