/**
 * Argument parsing. Unknown flags and bad values are hard errors — a typo that silently
 * fetches the wrong set into the wrong directory is exactly the sort of "temporary hack"
 * this project does not ship.
 */

import { isIconKey, ICON_KEYS } from './icons.js';
import type { IconKey } from './icons.js';

export interface Options {
  readonly outDir: string;
  readonly cacheDir: string;
  readonly keys: readonly IconKey[];
  /** True when `--only` narrowed the set, so the outputs are partial. */
  readonly partial: boolean;
  readonly force: boolean;
  readonly dryRun: boolean;
  readonly concurrency: number;
}

export class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

export const DEFAULT_OUT_DIR = '../../apps/client/public/icons';
export const DEFAULT_CACHE_DIR = '.cache';
export const DEFAULT_CONCURRENCY = 6;
const MAX_CONCURRENCY = 16;

export const HELP_TEXT = `
icon-fetch — download, normalize and attribute the game-icons.net set for Mistvale.

Usage:
  pnpm --filter @mistvale/icon-fetch icons [options]

Options:
  --out <dir>          Output directory for icons.svg / icons.json / ATTRIBUTION.md
                       (default: ${DEFAULT_OUT_DIR}, relative to tools/icon-fetch)
  --only <key,key>     Fetch only these icon keys (see src/icons.ts). Outputs become partial.
  --cache <dir>        Cache directory (default: ${DEFAULT_CACHE_DIR})
  --concurrency <n>    Parallel downloads, 1-${String(MAX_CONCURRENCY)} (default: ${String(DEFAULT_CONCURRENCY)})
  --force              Ignore the cache and the stored repo index; re-download everything
  --dry-run            Resolve and report, write nothing
  -h, --help           Show this help

Environment:
  GITHUB_TOKEN         Optional. Raises the GitHub API rate limit used to build the icon index.
                       Never required: the tool falls back to probing raw.githubusercontent.com.
`.trimStart();

export function parseArgs(argv: readonly string[]): Options | 'help' {
  let outDir = DEFAULT_OUT_DIR;
  let cacheDir = DEFAULT_CACHE_DIR;
  let concurrency = DEFAULT_CONCURRENCY;
  let only: readonly IconKey[] | null = null;
  let force = false;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === undefined) continue;

    switch (arg) {
      case '-h':
      case '--help':
        return 'help';
      case '--force':
        force = true;
        break;
      case '--dry-run':
        dryRun = true;
        break;
      case '--out':
        outDir = takeValue(argv, (i += 1), '--out');
        break;
      case '--cache':
        cacheDir = takeValue(argv, (i += 1), '--cache');
        break;
      case '--concurrency':
        concurrency = parseConcurrency(takeValue(argv, (i += 1), '--concurrency'));
        break;
      case '--only':
        only = parseOnly(takeValue(argv, (i += 1), '--only'));
        break;
      default:
        throw new UsageError(`unknown argument "${arg}" (try --help)`);
    }
  }

  return {
    outDir,
    cacheDir,
    keys: only ?? ICON_KEYS,
    partial: only !== null,
    force,
    dryRun,
    concurrency,
  };
}

function takeValue(argv: readonly string[], index: number, flag: string): string {
  const value = argv[index];
  if (value === undefined || value.startsWith('-')) {
    throw new UsageError(`${flag} needs a value`);
  }
  return value;
}

function parseConcurrency(raw: string): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || value > MAX_CONCURRENCY) {
    throw new UsageError(
      `--concurrency must be an integer between 1 and ${String(MAX_CONCURRENCY)}`,
    );
  }
  return value;
}

function parseOnly(raw: string): readonly IconKey[] {
  const requested = raw
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  if (requested.length === 0) throw new UsageError('--only needs at least one icon key');

  const unknown = requested.filter((key) => !isIconKey(key));
  if (unknown.length > 0) {
    throw new UsageError(
      `unknown icon key(s): ${unknown.join(', ')}\nDeclare them in src/icons.ts or check the spelling.`,
    );
  }

  const selected = requested.filter(isIconKey);
  return ICON_KEYS.filter((key) => selected.includes(key));
}
