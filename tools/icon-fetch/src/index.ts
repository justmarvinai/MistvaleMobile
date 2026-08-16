#!/usr/bin/env node
/**
 * icon-fetch — downloads the game-icons.net icons declared in `src/icons.ts`, normalizes them,
 * and emits the client sprite, the manifest and the CC BY 3.0 attribution document.
 *
 * Run: `pnpm --filter @mistvale/icon-fetch icons [--help]`
 *
 * Exit codes: 0 on success, 1 when any icon fails to resolve, download or normalize (a partial
 * icon set must never be published silently), 2 on a usage error.
 */

import { fileURLToPath } from 'node:url';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';

import { HELP_TEXT, UsageError, parseArgs } from './cli.js';
import type { Options } from './cli.js';
import { specFor, symbolIdFor } from './icons.js';
import type { IconKey } from './icons.js';
import { EXPECTED_VIEW_BOX, normalizeSvg } from './normalize.js';
import { fetchIcon } from './fetcher.js';
import { loadIndex, resolveIcon, writeIndex } from './repo-index.js';
import type { RepoIndex, ResolvedIcon } from './repo-index.js';
import { mapLimit } from './http.js';
import { ensureDir, writeFileAtomic } from './fs-utils.js';
import { formatBytes, log } from './log.js';
import {
  ATTRIBUTION_FILENAME,
  MANIFEST_FILENAME,
  SPRITE_FILENAME,
  buildAttribution,
  buildManifest,
  buildSprite,
} from './emit.js';
import type { IconEntry } from './emit.js';

/** Package root, so relative `--out` / `--cache` values do not depend on the shell's cwd. */
const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

interface Failure {
  readonly key: IconKey;
  readonly stage: 'resolve' | 'download' | 'normalize';
  readonly message: string;
}

interface Outcome {
  readonly entry: IconEntry | null;
  readonly failure: Failure | null;
  readonly fromCache: boolean;
}

async function main(argv: readonly string[]): Promise<number> {
  const parsed = parseArgs(argv);
  if (parsed === 'help') {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  const options = parsed;
  const outDir = fromPackageRoot(options.outDir);
  const cacheDir = fromPackageRoot(options.cacheDir);

  printHeader(options, outDir, cacheDir);
  await ensureDir(cacheDir);

  const index = await loadRepoIndex(cacheDir, options);
  const resolutions = await resolveAll(options, index);
  await writeIndex(cacheDir, index).catch((error: unknown) => {
    log.warn(`could not persist the icon index: ${describe(error)}`);
  });

  const outcomes = await processAll(options, cacheDir, resolutions);
  const entries = outcomes.map((o) => o.entry).filter((e): e is IconEntry => e !== null);
  const failures = outcomes.map((o) => o.failure).filter((f): f is Failure => f !== null);

  // A run that lost even one icon publishes nothing: a sprite missing symbols would fail
  // silently at runtime as blank chips, which is far worse than a red build.
  if (failures.length === 0 && entries.length > 0) await emit(options, outDir, entries);

  return report(options, outDir, outcomes, entries, failures);
}

function fromPackageRoot(path: string): string {
  return isAbsolute(path) ? path : resolve(PACKAGE_ROOT, path);
}

function printHeader(options: Options, outDir: string, cacheDir: string): void {
  log.step(`icon-fetch — ${String(options.keys.length)} icons`);
  log.detail(
    `out    ${displayPath(outDir)}${options.dryRun ? '  (dry run — nothing is written)' : ''}`,
  );
  log.detail(`cache  ${displayPath(cacheDir)}${options.force ? '  (--force: ignored)' : ''}`);
  log.blank();
}

function displayPath(absolute: string): string {
  const rel = relative(process.cwd(), absolute);
  return rel.length > 0 && !rel.startsWith('..') ? rel : absolute;
}

async function loadRepoIndex(cacheDir: string, options: Options): Promise<RepoIndex> {
  log.step('Resolving author folders');
  const { index, note } = await loadIndex(cacheDir, {
    force: options.force,
    token: process.env.GITHUB_TOKEN,
  });
  if (index.source === 'raw-probe') log.warn(note);
  else log.detail(note);
  return index;
}

type ResolutionRow = {
  readonly key: IconKey;
  readonly resolved: ResolvedIcon | null;
  readonly reason: string;
};

async function resolveAll(options: Options, index: RepoIndex): Promise<ResolutionRow[]> {
  // Resolution is sequential so probe results land in the shared index before the next lookup
  // and identical names are never probed twice.
  const rows: ResolutionRow[] = [];
  for (const key of options.keys) {
    const spec = specFor(key);
    const result = await resolveIcon(spec.name, spec.author, index);
    rows.push(
      result.ok
        ? { key, resolved: result.value, reason: '' }
        : { key, resolved: null, reason: result.reason },
    );
  }

  const failed = rows.filter((row) => row.resolved === null);
  if (failed.length === 0) log.ok(`resolved ${String(rows.length)} icons`);
  else log.error(`${String(failed.length)} of ${String(rows.length)} icons could not be resolved`);
  log.blank();
  return rows;
}

async function processAll(
  options: Options,
  cacheDir: string,
  rows: readonly ResolutionRow[],
): Promise<Outcome[]> {
  log.step('Downloading and normalizing');
  let done = 0;

  const outcomes = await mapLimit(rows, options.concurrency, async (row) => {
    const outcome = await processOne(options, cacheDir, row);
    done += 1;
    logProgress(done, rows.length, row.key, outcome);
    return outcome;
  });

  log.blank();
  return outcomes;
}

async function processOne(
  options: Options,
  cacheDir: string,
  row: ResolutionRow,
): Promise<Outcome> {
  if (row.resolved === null) {
    return {
      entry: null,
      failure: { key: row.key, stage: 'resolve', message: row.reason },
      fromCache: false,
    };
  }

  const spec = specFor(row.key);
  let fromCache = false;

  try {
    const fetched = await fetchIcon(row.resolved, cacheDir, options.force);
    fromCache = fetched.fromCache;
    const normalized = normalizeSvg(fetched.svg, `${row.resolved.author}/${row.resolved.name}`);

    if (normalized.viewBox !== EXPECTED_VIEW_BOX) {
      log.warn(`${row.key}: viewBox "${normalized.viewBox}" differs from ${EXPECTED_VIEW_BOX}`);
    }

    return {
      entry: {
        key: row.key,
        symbolId: symbolIdFor(row.key),
        group: spec.group,
        use: spec.use,
        sourceName: row.resolved.name,
        author: row.resolved.author,
        viewBox: normalized.viewBox,
        body: normalized.body,
        sourceUrl: row.resolved.url,
      },
      failure: null,
      fromCache,
    };
  } catch (error: unknown) {
    const stage =
      error instanceof Error && error.name === 'NormalizeError' ? 'normalize' : 'download';
    return { entry: null, failure: { key: row.key, stage, message: describe(error) }, fromCache };
  }
}

function logProgress(done: number, total: number, key: IconKey, outcome: Outcome): void {
  const counter = `[${String(done).padStart(String(total).length, ' ')}/${String(total)}]`;
  if (outcome.failure !== null) {
    log.error(`${counter} ${key} — ${outcome.failure.message}`);
    return;
  }
  const source = outcome.fromCache ? 'cached ' : 'fetched';
  const entry = outcome.entry;
  const origin = entry === null ? '' : ` ${entry.author}/${entry.sourceName}`;
  log.detail(`${counter} ${source} ${key}${origin}`);
}

async function emit(
  options: Options,
  outDir: string,
  entries: readonly IconEntry[],
): Promise<void> {
  const generatedAt = new Date().toISOString();
  const files = [
    { name: SPRITE_FILENAME, contents: buildSprite(entries) },
    { name: MANIFEST_FILENAME, contents: buildManifest(entries, generatedAt) },
    { name: ATTRIBUTION_FILENAME, contents: buildAttribution(entries, generatedAt) },
  ];

  log.step(options.dryRun ? 'Outputs (dry run — not written)' : 'Writing outputs');
  for (const file of files) {
    const size = formatBytes(Buffer.byteLength(file.contents, 'utf8'));
    if (!options.dryRun) await writeFileAtomic(join(outDir, file.name), file.contents);
    log.info(`${file.name.padEnd(ATTRIBUTION_FILENAME.length)}  ${size}`);
  }
  log.blank();
}

function report(
  options: Options,
  outDir: string,
  outcomes: readonly Outcome[],
  entries: readonly IconEntry[],
  failures: readonly Failure[],
): number {
  const fetched = outcomes.filter((o) => o.entry !== null && !o.fromCache).length;
  const cached = outcomes.filter((o) => o.entry !== null && o.fromCache).length;
  const authors = new Set(entries.map((e) => e.author)).size;

  log.step('Summary');
  log.info(
    `fetched ${String(fetched)} · cached ${String(cached)} · failed ${String(failures.length)} · ${String(authors)} authors credited`,
  );

  if (failures.length > 0) {
    log.blank();
    for (const failure of failures)
      log.error(`${failure.stage}: ${failure.key} — ${failure.message}`);
    log.blank();
    log.error('No icon set was published. Fix the entries above in src/icons.ts and re-run.');
    return 1;
  }

  if (options.partial) {
    log.warn(
      `--only was used: ${displayPath(outDir)} now holds ${String(entries.length)} icons, not the full set.`,
    );
    log.warn('Re-run without --only before committing or deploying.');
  }

  if (!options.dryRun) log.ok(`icon set published to ${displayPath(outDir)}`);
  return 0;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

try {
  process.exitCode = await main(process.argv.slice(2));
} catch (error: unknown) {
  if (error instanceof UsageError) {
    log.error(error.message);
    process.stderr.write(`\n${HELP_TEXT}`);
    process.exitCode = 2;
  } else {
    log.error(describe(error));
    process.exitCode = 1;
  }
}
