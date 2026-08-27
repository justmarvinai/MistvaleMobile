import { mkdir, readFile, readdir, rm, rmdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decode, downscale, encode } from './png';

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
 *
 * **Avatars are published smaller than they are delivered** (Q6). The exports are
 * 1254×1254 and the game draws them at 150px on a champion card and 44px on an arena
 * portrait, so the eight of them were 14 MB of the 15 MB sprite tree — on a 1-core box, the
 * largest single thing a player downloads by an order of magnitude, growing with every
 * champion that gets a face. They go out at 320px, which is twice the largest place any of
 * them is drawn, and `assets/` keeps the masters untouched. Nothing else is resized: an
 * idle frame is 4 KB and drawn at its own size, and shrinking one would be a change to how
 * the game looks rather than to what it weighs.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const sourceRoot = resolve(repoRoot, 'assets');
const targetRoot = resolve(repoRoot, 'apps/client/public/sprites');

/** Folders under `assets/` that hold animated units. */
const UNIT_KINDS = ['champions', 'enemies'] as const;

/**
 * Flat folders of finished media, published under their own names.
 *
 * Sprites are *transformed* on the way through — renumbered, renamed, counted into a
 * manifest — because the client builds their URLs from an index. These are the opposite:
 * content points at them **by filename**, so the one thing this must not do is rename them.
 * `background_music_outside_combat.mp3` is what the seeded cue names, and what an operator
 * retyping that cue in Admin will type.
 *
 * Every one is optional. A folder that is not there publishes nothing and says so, which
 * is what makes silence a supported state rather than an error path — three of the fifteen
 * tutorial steps have no recording on purpose.
 */
interface MediaSet {
  label: string;
  /** Where the owner's files are, relative to `assets/`. */
  from: string;
  /** Published under `apps/client/public/<to>`. */
  to: string;
  extensions: readonly string[];
}

const AUDIO = ['.mp3', '.ogg', '.m4a', '.wav'] as const;
const IMAGES = ['.png', '.webp', '.jpg', '.jpeg'] as const;

const MEDIA: readonly MediaSet[] = [
  {
    label: 'music',
    from: 'music_and_sounds/background_music',
    to: 'audio/music',
    extensions: AUDIO,
  },
  {
    label: 'tutorial lines',
    from: 'music_and_sounds/tutorial_sounds',
    to: 'audio/tutorial',
    extensions: AUDIO,
  },
  { label: 'portraits', from: 'ui/misc_avatars', to: 'portraits', extensions: IMAGES },
];

const publicRoot = resolve(repoRoot, 'apps/client/public');

interface MediaFile {
  from: string;
  to: string;
}

async function collectMedia(set: MediaSet): Promise<MediaFile[]> {
  const source = join(sourceRoot, set.from);
  if (!existsSync(source)) return [];
  const target = join(publicRoot, set.to);
  return (await readdir(source, { withFileTypes: true }))
    .filter((item) => item.isFile())
    .map((item) => item.name)
    .filter((name) => set.extensions.some((ext) => name.toLowerCase().endsWith(ext)))
    .sort()
    .map((name) => ({ from: join(source, name), to: join(target, name) }));
}

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

/**
 * The longest side an avatar is published at.
 *
 * Twice the largest place one is drawn (150px on a champion card), so it still has pixels
 * to spare on a high-density display and none to waste anywhere else.
 */
const AVATAR_MAX_SIDE = 320;

/**
 * Publishes an image at a ceiling on its longest side, re-encoding it on the way.
 *
 * Compares the bytes it *would* write rather than the source's, which is what keeps the
 * `publishFile` contract: an unchanged master must not touch the published file, or the
 * dev server's watcher fires on every start. `encode` is deterministic for exactly this
 * reason.
 *
 * A file it cannot read is a hard error rather than a silent copy: an avatar published at
 * full size would be a 2 MB regression nobody would notice until the next budget pass.
 */
async function publishImage(from: string, to: string, maxSide: number): Promise<string> {
  const source = await readFile(from);
  let wanted: Buffer;
  try {
    wanted = encode(downscale(decode(source), maxSide));
  } catch (cause) {
    throw new Error(
      `cannot resize ${from}: ${cause instanceof Error ? cause.message : String(cause)}`,
    );
  }
  const existing = await readFile(to).catch(() => null);
  if (!existing || !existing.equals(wanted)) await writeFile(to, wanted);
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
    written.push(
      await publishImage(join(source, avatars[0]!), join(target, 'avatar.png'), AVATAR_MAX_SIDE),
    );
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

/**
 * Publishes one media folder and prunes whatever it did not write.
 *
 * The prune is scoped to that folder's own target, so removing a track from `assets/`
 * removes it from the client and nothing else is touched. A set with no source folder
 * publishes nothing and prunes nothing — it must not empty a tree it knows nothing about.
 */
async function publishMedia(set: MediaSet, files: MediaFile[]): Promise<void> {
  if (files.length === 0) return;
  const target = join(publicRoot, set.to);
  await mkdir(target, { recursive: true });
  const keep = new Set<string>();
  for (const file of files) keep.add(await publishFile(file.from, file.to));
  await prune(target, keep);
}

/** True when every file is published byte-for-byte and nothing extra sits beside it. */
async function mediaIsCurrent(set: MediaSet, files: MediaFile[]): Promise<boolean> {
  const target = join(publicRoot, set.to);
  if (files.length === 0) {
    // Nothing to publish. An absent or empty target is current; anything in it is stale — a
    // track deleted from `assets/` must stop being served rather than linger.
    if (!existsSync(target)) return true;
    return (await readdir(target)).length === 0;
  }
  const published = existsSync(target) ? new Set(await readdir(target)) : new Set<string>();
  for (const file of files) {
    const name = file.to.slice(target.length + 1);
    if (!published.delete(name)) return false;
    const [wanted, actual] = await Promise.all([readFile(file.from), readFile(file.to)]);
    if (!wanted.equals(actual)) return false;
  }
  return published.size === 0;
}

const countMedia = (media: readonly { files: MediaFile[] }[]): number =>
  media.reduce((sum, entry) => sum + entry.files.length, 0);

async function main(): Promise<void> {
  const units = await collect();
  const media = await Promise.all(
    MEDIA.map(async (set) => ({ set, files: await collectMedia(set) })),
  );
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
    for (const { set, files } of media) {
      if (!(await mediaIsCurrent(set, files))) {
        console.error(
          `assets: published ${set.label} are out of date with assets/${set.from}/.\n` +
            '  Run `pnpm assets` and commit the result.',
        );
        process.exit(1);
      }
    }
    console.log(`assets: ${units.length} units and ${countMedia(media)} media files current.`);
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

  for (const { set, files } of media) await publishMedia(set, files);

  const frames = units.reduce((sum, unit) => sum + unit.idleFrames, 0);
  console.log(`assets: published ${units.length} units (${frames} idle frames) → ${targetRoot}`);
  for (const { set, files } of media) {
    console.log(
      files.length === 0
        ? `assets: no ${set.label} — nothing in assets/${set.from}/.`
        : `assets: published ${files.length} ${set.label} → ${join(publicRoot, set.to)}`,
    );
  }
}

main().catch((error: unknown) => {
  console.error('assets: sync failed.');
  console.error(error);
  process.exit(1);
});
