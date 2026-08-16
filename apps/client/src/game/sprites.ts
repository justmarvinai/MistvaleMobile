import { Assets, type Texture } from 'pixi.js';

/**
 * Unit sprite loading.
 *
 * Frames are published by `pnpm assets` from the owner's `assets/` tree, together with a
 * manifest that records how many frames each unit actually has. Reading the count from
 * the manifest rather than from content means a missing frame shows up as a build-time
 * mismatch instead of a hole in an idle loop.
 *
 * Textures are cached by Pixi and shared across every sprite that uses them, so four
 * copies of the same lizard cost one upload.
 */

export interface SpriteManifestEntry {
  basePath: string;
  idleFrames: number;
  hasStill: boolean;
  hasAvatar: boolean;
}

interface SpriteManifest {
  version: number;
  units: SpriteManifestEntry[];
}

const SPRITE_ROOT = 'sprites';

let manifest: Map<string, SpriteManifestEntry> | null = null;
let manifestLoad: Promise<Map<string, SpriteManifestEntry>> | null = null;

export async function loadSpriteManifest(): Promise<Map<string, SpriteManifestEntry>> {
  if (manifest) return manifest;
  manifestLoad ??= (async () => {
    const response = await fetch(`/${SPRITE_ROOT}/manifest.json`);
    if (!response.ok) throw new Error('Could not load the sprite manifest.');
    const data = (await response.json()) as SpriteManifest;
    manifest = new Map(data.units.map((unit) => [unit.basePath, unit]));
    return manifest;
  })();
  return manifestLoad;
}

export function spriteEntry(basePath: string): SpriteManifestEntry | undefined {
  return manifest?.get(basePath);
}

const framePath = (basePath: string, index: number): string =>
  `/${SPRITE_ROOT}/${basePath}/idle/frame_${String(index).padStart(3, '0')}.png`;

export const stillPath = (basePath: string): string => `/${SPRITE_ROOT}/${basePath}/still.png`;
export const avatarPath = (basePath: string): string => `/${SPRITE_ROOT}/${basePath}/avatar.png`;

/**
 * Loads a unit's idle frames.
 *
 * Falls back to the still image when a unit has no frames published yet, so an
 * art-pending champion renders as a static sprite rather than as nothing at all.
 */
export async function loadIdleFrames(basePath: string): Promise<Texture[]> {
  const entries = await loadSpriteManifest();
  const entry = entries.get(basePath);

  if (!entry || entry.idleFrames === 0) {
    const still = await Assets.load<Texture>(stillPath(basePath)).catch(() => null);
    return still ? [still] : [];
  }

  const urls = Array.from({ length: entry.idleFrames }, (_, index) => framePath(basePath, index));
  const textures = await Promise.all(
    urls.map((url) => Assets.load<Texture>(url).catch(() => null)),
  );
  return textures.filter((texture): texture is Texture => texture !== null);
}

/** Preloads every unit a battle needs, so the fight opens without a pop-in. */
export async function preloadUnits(basePaths: readonly string[]): Promise<void> {
  await loadSpriteManifest();
  await Promise.all([...new Set(basePaths)].map((path) => loadIdleFrames(path)));
}
