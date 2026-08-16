/**
 * Resolving an icon name to its author folder.
 *
 * Primary path: the GitHub tree API lists every path in `game-icons/icons` in one request; we
 * reduce it to `name -> authors[]` and cache it as `.cache/icon-index.json`.
 *
 * Fallback path: the tree API is rate-limited to 60 requests/hour for anonymous callers and is
 * blocked outright on some networks, while `raw.githubusercontent.com` stays reachable. When the
 * API is unavailable we probe raw URLs per author folder (most-populated first) for just the
 * icons we need. Results merge into the same cache file, so the cost is paid once.
 */

import { join } from 'node:path';

import { exists, getText, mapLimit, HttpError } from './http.js';
import { readFileOrNull, writeFileAtomic } from './fs-utils.js';
import { AUTHOR_FOLDERS, EXCLUDED_FOLDERS, REPO_REF, TREE_API_URL, rawUrlFor } from './source.js';

export type IndexSource = 'github-api' | 'raw-probe' | 'cache';

export interface RepoIndex {
  /** How the entries were obtained. `cache` means "read back from disk unchanged". */
  source: IndexSource;
  ref: string;
  generatedAt: string;
  /** Icon basename → author folders that publish it, in repo order. */
  icons: Record<string, string[]>;
}

export interface IndexLoadResult {
  readonly index: RepoIndex;
  /** Human-readable note for the run log, e.g. why the fallback kicked in. */
  readonly note: string;
}

const INDEX_FILENAME = 'icon-index.json';
const PROBE_CONCURRENCY = 8;

export function indexPath(cacheDir: string): string {
  return join(cacheDir, INDEX_FILENAME);
}

function emptyIndex(source: IndexSource): RepoIndex {
  return { source, ref: REPO_REF, generatedAt: new Date().toISOString(), icons: {} };
}

function isRepoIndex(value: unknown): value is RepoIndex {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<RepoIndex>;
  if (typeof candidate.ref !== 'string' || typeof candidate.generatedAt !== 'string') return false;
  if (typeof candidate.icons !== 'object' || candidate.icons === null) return false;
  return Object.values(candidate.icons).every(
    (authors) => Array.isArray(authors) && authors.every((a) => typeof a === 'string'),
  );
}

/** Reads the cached index, ignoring anything corrupt or built for a different ref. */
export async function readCachedIndex(cacheDir: string): Promise<RepoIndex | null> {
  const raw = await readFileOrNull(indexPath(cacheDir));
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRepoIndex(parsed) || parsed.ref !== REPO_REF) return null;
    return { ...parsed, source: 'cache' };
  } catch {
    return null;
  }
}

export async function writeIndex(cacheDir: string, index: RepoIndex): Promise<void> {
  await writeFileAtomic(indexPath(cacheDir), `${JSON.stringify(index, null, 2)}\n`);
}

interface TreeResponse {
  readonly tree?: readonly { readonly path?: unknown; readonly type?: unknown }[];
}

/**
 * Reduces a GitHub tree listing to `name -> authors[]`. Pure, so it can be exercised without
 * network access. Non-icon paths (`README.md`, nested folders, the excluded `badges/` set)
 * are ignored rather than being an error — upstream is free to add files.
 */
export function buildIndexFromTree(body: string): RepoIndex {
  const parsed: unknown = JSON.parse(body);
  const tree = (parsed as TreeResponse).tree;
  if (!Array.isArray(tree)) {
    throw new HttpError('GitHub tree response had no `tree` array', TREE_API_URL, undefined);
  }

  const index = emptyIndex('github-api');
  for (const entry of tree) {
    if (entry.type !== 'blob' || typeof entry.path !== 'string') continue;
    const match = /^([^/]+)\/([^/]+)\.svg$/.exec(entry.path);
    if (match === null) continue;
    const [, author, name] = match;
    if (author === undefined || name === undefined || EXCLUDED_FOLDERS.has(author)) continue;
    (index.icons[name] ??= []).push(author);
  }

  if (Object.keys(index.icons).length === 0) {
    throw new HttpError('GitHub tree contained no icon SVGs', TREE_API_URL, undefined);
  }
  return index;
}

/** Fetches the full repository tree and reduces it to `name -> authors[]`. */
export async function fetchIndexFromApi(token: string | undefined): Promise<RepoIndex> {
  const headers: Record<string, string> = { accept: 'application/vnd.github+json' };
  if (token !== undefined && token.length > 0) headers.authorization = `Bearer ${token}`;

  const body = await getText(TREE_API_URL, { headers, timeoutMs: 30_000, attempts: 3 });
  return buildIndexFromTree(body);
}

/**
 * Loads the index, preferring the cache. Returns an empty `raw-probe` index (rather than
 * throwing) when the API is unreachable — resolution then falls back to probing.
 */
export async function loadIndex(
  cacheDir: string,
  options: { readonly force: boolean; readonly token: string | undefined },
): Promise<IndexLoadResult> {
  if (!options.force) {
    const cached = await readCachedIndex(cacheDir);
    if (cached !== null) {
      const count = Object.keys(cached.icons).length;
      return { index: cached, note: `cached index (${String(count)} icon names)` };
    }
  }

  try {
    const index = await fetchIndexFromApi(options.token);
    await writeIndex(cacheDir, index);
    const count = Object.keys(index.icons).length;
    return { index, note: `GitHub tree API (${String(count)} icon names)` };
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    return {
      index: emptyIndex('raw-probe'),
      note: `GitHub tree API unavailable (${reason}) — falling back to raw URL probing`,
    };
  }
}

export interface ResolvedIcon {
  readonly author: string;
  readonly name: string;
  readonly url: string;
}

export type Resolution =
  | { readonly ok: true; readonly value: ResolvedIcon }
  | { readonly ok: false; readonly reason: string };

/**
 * Resolves one icon. A pinned author is verified rather than trusted blindly; an unpinned name
 * published by several authors is an error, never a silent guess — CC BY attribution has to
 * name the right person.
 */
export async function resolveIcon(
  name: string,
  pinnedAuthor: string | undefined,
  index: RepoIndex,
): Promise<Resolution> {
  const known = index.icons[name];

  if (pinnedAuthor !== undefined) {
    if (known !== undefined && !known.includes(pinnedAuthor)) {
      return {
        ok: false,
        reason: `pinned author "${pinnedAuthor}" does not publish "${name}.svg" (available: ${known.join(', ')})`,
      };
    }
    if (known === undefined) {
      if (!(await exists(rawUrlFor(pinnedAuthor, name)))) {
        return { ok: false, reason: `"${pinnedAuthor}/${name}.svg" does not exist in the mirror` };
      }
      // Remember the verified pin so the next run does not re-probe it. Recorded only when the
      // index had nothing: an API-built list is authoritative and must not be narrowed.
      index.icons[name] = [pinnedAuthor];
    }
    return { ok: true, value: makeResolved(pinnedAuthor, name) };
  }

  if (known !== undefined && known.length === 1) {
    const author = known[0];
    if (author !== undefined) return { ok: true, value: makeResolved(author, name) };
  }

  if (known !== undefined && known.length > 1) {
    return {
      ok: false,
      reason: `"${name}" is published by ${known.length} authors (${known.join(', ')}) — pin one with \`author\` in src/icons.ts`,
    };
  }

  const probed = await probeAuthor(name);
  if (probed === null) {
    return { ok: false, reason: `"${name}.svg" was not found in any known author folder` };
  }
  index.icons[name] = [probed];
  return { ok: true, value: makeResolved(probed, name) };
}

function makeResolved(author: string, name: string): ResolvedIcon {
  return { author, name, url: rawUrlFor(author, name) };
}

/** Probes author folders in popularity order and returns the first that has the icon. */
async function probeAuthor(name: string): Promise<string | null> {
  const candidates = AUTHOR_FOLDERS.filter((folder) => !EXCLUDED_FOLDERS.has(folder));

  for (let offset = 0; offset < candidates.length; offset += PROBE_CONCURRENCY) {
    const batch = candidates.slice(offset, offset + PROBE_CONCURRENCY);
    const hits = await mapLimit(batch, PROBE_CONCURRENCY, async (folder) =>
      (await exists(rawUrlFor(folder, name))) ? folder : null,
    );
    const found = hits.find((folder): folder is string => folder !== null);
    if (found !== undefined) return found;
  }
  return null;
}
