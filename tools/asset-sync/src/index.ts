import { mkdir, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * `pnpm assets` — publishes the unit sprites the client renders.
 *
 * The owner's art lives in `assets/`, organised for authoring: one folder per unit, a
 * GIF next to the frames, and still images named after the champion. The client needs
 * something else entirely — predictable URLs under its own public tree. This bridges the
 * two rather than making either side compromise (docs/ASSET_GUIDE.md).
 *
 * It also writes a manifest, which is what makes frame counts a fact rather than a
 * promise: the client reads the number of frames that actually exist instead of trusting
 * a content field that could drift.
 *
 * `--check` verifies the published tree is current without writing, for CI.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const sourceRoot = resolve(repoRoot, 'assets');
const targetRoot = resolve(repoRoot, 'apps/client/public/sprites');

/** Folders under `assets/` that hold animated units. */
const UNIT_KINDS = ['champions', 'enemies'] as const;

interface UnitManifestEntry {
  /** Path the content `asset_defs.basePath` uses, e.g. `champions/epic_anuria`. */
  basePath: string;
  idleFrames: number;
  hasStill: boolean;
  hasAvatar: boolean;
}

export interface SpriteManifest {
  /** Bumped when the layout changes, so a stale cache is detectable. */
  version: 1;
  units: UnitManifestEntry[];
}

const isFrame = (name: string): boolean => /^frame_\d+\.png$/i.test(name);
const isPng = (name: string): boolean => name.toLowerCase().endsWith('.png');

async function readUnit(kind: string, folder: string): Promise<UnitManifestEntry | null> {
  const source = join(sourceRoot, kind, folder);
  const idleDir = join(source, 'idle');
  if (!existsSync(idleDir)) return null;

  const frames = (await readdir(idleDir)).filter(isFrame).sort();
  if (frames.length === 0) return null;

  const stillDir = join(source, 'still');
  const still = existsSync(stillDir) ? (await readdir(stillDir)).filter(isPng).sort() : [];
  const avatar = (await readdir(source)).filter(
    (name) => isPng(name) && name.toLowerCase().includes('avatar'),
  );

  return {
    basePath: `${kind}/${folder}`,
    idleFrames: frames.length,
    hasStill: still.length > 0,
    hasAvatar: avatar.length > 0,
  };
}

/**
 * Copies one file, and only if it would change anything.
 *
 * Rewriting a file that is already correct is not free here: the Vite dev server keeps an
 * index of the public directory built at start-up and maintained from the watcher, so
 * every needless write is a watcher event, and — before this was written in place —
 * every *delete* took a path out of that index for good. Returns the published path so
 * the caller knows what to keep.
 */
async function publishFile(from: string, to: string): Promise<string> {
  const source = await readFile(from);
  const existing = await readFile(to).catch(() => null);
  if (!existing || !existing.equals(source)) await writeFile(to, source);
  return to;
}

/** Copies one unit's sprites, normalising the names the client will ask for. */
async function publishUnit(entry: UnitManifestEntry): Promise<string[]> {
  const source = join(sourceRoot, entry.basePath);
  const target = join(targetRoot, entry.basePath);
  await mkdir(join(target, 'idle'), { recursive: true });
  const written: string[] = [];

  const frames = (await readdir(join(source, 'idle'))).filter(isFrame).sort();
  for (const [index, frame] of frames.entries()) {
    // Renumbered from zero so the client can build a URL from an index rather than
    // needing to know how the artist happened to number the export.
    const name = `frame_${String(index).padStart(3, '0')}.png`;
    written.push(await publishFile(join(source, 'idle', frame), join(target, 'idle', name)));
  }

  if (entry.hasStill) {
    const stills = (await readdir(join(source, 'still'))).filter(isPng).sort();
    written.push(await publishFile(join(source, 'still', stills[0]!), join(target, 'still.png')));
  }
  if (entry.hasAvatar) {
    const avatars = (await readdir(source)).filter(
      (name) => isPng(name) && name.toLowerCase().includes('avatar'),
    );
    written.push(await publishFile(join(source, avatars[0]!), join(target, 'avatar.png')));
  }
  return written;
}

/**
 * Deletes everything under the published tree that this run did not write, then any
 * directory left empty — so a unit removed from `assets/` disappears from the client
 * without the whole tree being rebuilt.
 */
async function prune(dir: string, keep: ReadonlySet<string>): Promise<boolean> {
  let empty = true;
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, item.name);
    if (item.isDirectory()) {
      if (await prune(path, keep)) await rmdir(path);
      else empty = false;
    } else if (keep.has(path)) {
      empty = false;
    } else {
      await rm(path);
    }
  }
  return empty;
}

async function collect(): Promise<UnitManifestEntry[]> {
  const units: UnitManifestEntry[] = [];
  for (const kind of UNIT_KINDS) {
    const kindDir = join(sourceRoot, kind);
    if (!existsSync(kindDir)) continue;
    for (const folder of (await readdir(kindDir, { withFileTypes: true }))
      .filter((item) => item.isDirectory())
      .map((item) => item.name)
      .sort()) {
      const entry = await readUnit(kind, folder);
      if (entry) units.push(entry);
    }
  }
  return units;
}

async function main(): Promise<void> {
  const units = await collect();
  if (units.length === 0) {
    console.error(`assets: nothing to publish — no unit folders under ${sourceRoot}.`);
    process.exit(1);
  }

  const manifest: SpriteManifest = { version: 1, units };
  const json = `${JSON.stringify(manifest, null, 2)}\n`;
  const manifestPath = join(targetRoot, 'manifest.json');

  if (process.argv.includes('--check')) {
    const existing = await readFile(manifestPath, 'utf8').catch(() => null);
    if (existing !== json) {
      console.error(
        'assets: the published sprites are out of date with assets/.\n' +
          '  Run `pnpm assets` and commit the result.',
      );
      process.exit(1);
    }
    console.log(`assets: ${units.length} units published and current.`);
    return;
  }

  // Published in place rather than rebuilt from scratch. Wiping the directory first is the
  // obvious way to make a deleted unit disappear, and it also silently breaks every sprite
  // in the running dev server: Vite indexes the public directory once at start-up and keeps
  // it from the watcher, so a wipe takes every path out of that index and the re-adds do not
  // reliably put them back. The symptom is `/sprites/**` answering with the SPA's HTML — an
  // empty champion card and no error anywhere. Deletions are handled by pruning instead.
  await mkdir(targetRoot, { recursive: true });

  const keep = new Set<string>([manifestPath]);
  for (const unit of units) for (const file of await publishUnit(unit)) keep.add(file);
  if ((await readFile(manifestPath, 'utf8').catch(() => null)) !== json) {
    await writeFile(manifestPath, json, 'utf8');
  }
  await prune(targetRoot, keep);

  const frames = units.reduce((sum, unit) => sum + unit.idleFrames, 0);
  console.log(`assets: published ${units.length} units (${frames} idle frames) → ${targetRoot}`);
}

main().catch((error: unknown) => {
  console.error('assets: sync failed.');
  console.error(error);
  process.exit(1);
});
