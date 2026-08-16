import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

/** Copies one unit's sprites, normalising the names the client will ask for. */
async function publishUnit(entry: UnitManifestEntry): Promise<void> {
  const source = join(sourceRoot, entry.basePath);
  const target = join(targetRoot, entry.basePath);
  await mkdir(join(target, 'idle'), { recursive: true });

  const frames = (await readdir(join(source, 'idle'))).filter(isFrame).sort();
  for (const [index, frame] of frames.entries()) {
    // Renumbered from zero so the client can build a URL from an index rather than
    // needing to know how the artist happened to number the export.
    const name = `frame_${String(index).padStart(3, '0')}.png`;
    await cp(join(source, 'idle', frame), join(target, 'idle', name));
  }

  if (entry.hasStill) {
    const stills = (await readdir(join(source, 'still'))).filter(isPng).sort();
    await cp(join(source, 'still', stills[0]!), join(target, 'still.png'));
  }
  if (entry.hasAvatar) {
    const avatars = (await readdir(source)).filter(
      (name) => isPng(name) && name.toLowerCase().includes('avatar'),
    );
    await cp(join(source, avatars[0]!), join(target, 'avatar.png'));
  }
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

  // Rebuild from scratch so a unit deleted from assets/ disappears from the client too.
  await rm(targetRoot, { recursive: true, force: true });
  await mkdir(targetRoot, { recursive: true });

  for (const unit of units) await publishUnit(unit);
  await writeFile(manifestPath, json, 'utf8');

  const frames = units.reduce((sum, unit) => sum + unit.idleFrames, 0);
  console.log(`assets: published ${units.length} units (${frames} idle frames) → ${targetRoot}`);
}

main().catch((error: unknown) => {
  console.error('assets: sync failed.');
  console.error(error);
  process.exit(1);
});
