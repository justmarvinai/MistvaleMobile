import { Assets, type Texture } from 'pixi.js';
import { CHAMPION_PLACEHOLDER } from '../ui/championArt';

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
  // The latch is what stops eight units racing to fetch the same file. It is cleared on
  // failure, because a *rejected* promise left in it is permanent: one blocked request at
  // boot — a proxy hiccup, a deploy mid-flight — and every sprite for the rest of the
  // session fails instantly against a stale rejection, with no request ever made again.
  manifestLoad ??= (async () => {
    try {
      const response = await fetch(`/${SPRITE_ROOT}/manifest.json`);
      if (!response.ok) {
        throw new Error(`sprite manifest: ${response.status} ${response.statusText}`);
      }
      const data = (await response.json()) as SpriteManifest;
      manifest = new Map(data.units.map((unit) => [unit.basePath, unit]));
      return manifest;
    } catch (cause) {
      manifestLoad = null;
      throw cause;
    }
  })();
  return manifestLoad;
}

export function spriteEntry(basePath: string): SpriteManifestEntry | undefined {
  return manifest?.get(basePath);
}

export const framePath = (basePath: string, index: number): string =>
  `/${SPRITE_ROOT}/${basePath}/idle/frame_${String(index).padStart(3, '0')}.png`;

export const stillPath = (basePath: string): string => `/${SPRITE_ROOT}/${basePath}/still.png`;
export const avatarPath = (basePath: string): string => `/${SPRITE_ROOT}/${basePath}/avatar.png`;

/**
 * Every art path already reported as missing.
 *
 * A failed load must be visible — a champion that does not appear in a fight is the sort
 * of thing that reaches the owner as "the enemy was invisible" weeks later — but a battle
 * asks for the same eight units on every frame of playback, and the same warning six
 * hundred times is a console nobody reads. Once each.
 */
const reported = new Set<string>();

function reportMissing(url: string, cause: unknown): null {
  if (!reported.has(url)) {
    reported.add(url);
    console.warn(`Mistvale: no art at ${url}`, cause);
  }
  return null;
}

/**
 * Loads a unit's idle frames.
 *
 * Falls back to the still image when a unit has no frames published yet, so an
 * art-pending champion renders as a static sprite rather than as nothing at all.
 *
 * A frame that will not load is skipped rather than fatal — nine frames of a ten-frame
 * loop is a slightly quick animation, and no animation at all would be a slot with a
 * health bar hovering over nothing — but it is never silent.
 */
export async function loadIdleFrames(basePath: string): Promise<Texture[]> {
  // The manifest carries frame counts, which is an optimisation and not a dependency: if
  // it cannot be read, a unit still has a still image. Degrading to a static sprite beats
  // rejecting, which reaches `attachSprite` as an unhandled rejection and leaves a health
  // bar hovering over an empty slot.
  const entries = await loadSpriteManifest().catch((cause: unknown) => {
    reportMissing(`/${SPRITE_ROOT}/manifest.json`, cause);
    return new Map<string, SpriteManifestEntry>();
  });
  const entry = entries.get(basePath);

  if (!entry || entry.idleFrames === 0) {
    const url = stillPath(basePath);
    const still = await Assets.load<Texture>(url).catch((cause: unknown) =>
      reportMissing(url, cause),
    );
    return still ? [still] : [];
  }

  const urls = Array.from({ length: entry.idleFrames }, (_, index) => framePath(basePath, index));
  const textures = await Promise.all(
    urls.map((url) =>
      Assets.load<Texture>(url).catch((cause: unknown) => reportMissing(url, cause)),
    ),
  );
  const loaded = textures.filter((texture): texture is Texture => texture !== null);
  if (loaded.length === 0) reportMissing(`${SPRITE_ROOT}/${basePath}`, 'no frame loaded');
  return loaded;
}

/**
 * The stand-in every unit falls back to when its own art will not load.
 *
 * A champion that does not appear in a fight is the single worst thing this file can do —
 * it is what the owner was looking at on 2026-08-20: a full HUD, a turn order, health bars
 * moving, and an empty field. `attachSprite` used to give up when no frame loaded, which
 * turns any art problem at all (a stale release, a path nginx does not serve, a champion
 * whose frames were never drawn) into an invisible battle rather than a plain-looking one.
 *
 * So there is always a texture. The library's own hooded silhouette is the same figure
 * `championArt` puts on the card, which is what makes an art-pending champion recognisable
 * as the *same* art-pending champion in both places.
 *
 * The path is read from the theme's own CSS custom property rather than hard-coded: the art
 * lives under whichever theme folder is vendored, and `--fui-img-<id>` is the indirection
 * the library provides precisely so nothing downstream has to know that. If the property is
 * missing — a test environment with no stylesheet, a theme that drops the asset — the caller
 * draws its own shape instead, which is the one fallback that cannot itself fail.
 */
export async function loadPlaceholderTexture(): Promise<Texture | null> {
  if (placeholder !== undefined) return placeholder;

  const url = themeArtUrl(CHAMPION_PLACEHOLDER);
  if (!url) {
    placeholder = null;
    return placeholder;
  }

  placeholder = await Assets.load<Texture>(url).catch((cause: unknown) =>
    reportMissing(url, cause),
  );
  return placeholder;
}

/** Loaded once per session. `undefined` is "not tried yet"; `null` is "tried, no art". */
let placeholder: Texture | null | undefined;

/**
 * The URL behind a FantasyUIs art id, resolved through the theme.
 *
 * `--fui-img-<id>` holds a CSS `url("…")`; this unwraps it. Returns null off the DOM, or
 * when the theme does not declare the id.
 */
function themeArtUrl(id: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(`--fui-img-${id}`)
    .trim();
  const match = /^url\(\s*["']?(.+?)["']?\s*\)$/.exec(value);
  return match?.[1] ?? null;
}
