/**
 * Filesystem helpers. Every write is atomic (temp file in the destination directory, then
 * rename) so an interrupted or failed run can never leave a half-written SVG in `.cache/`
 * that a later run would happily treat as a valid cache hit.
 */

import { randomBytes } from 'node:crypto';
import { mkdir, rename, rm, writeFile, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export async function ensureDir(dir: string): Promise<void> {
  await mkdir(dir, { recursive: true });
}

/** Writes `contents` to `path` atomically, creating parent directories as needed. */
export async function writeFileAtomic(path: string, contents: string): Promise<void> {
  const dir = dirname(path);
  await ensureDir(dir);
  const tmp = join(dir, `.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(tmp, contents, 'utf8');
    await rename(tmp, path);
  } catch (error: unknown) {
    await rm(tmp, { force: true });
    throw error;
  }
}

/** Reads a UTF-8 file, or returns `null` when it does not exist. Other errors propagate. */
export async function readFileOrNull(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf8');
  } catch (error: unknown) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'ENOENT'
  );
}
