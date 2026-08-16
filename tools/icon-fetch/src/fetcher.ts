/**
 * Downloading icon SVGs, with an on-disk cache.
 *
 * The cache mirrors the upstream layout (`.cache/svg/<author>/<name>.svg`) so a cached file is
 * self-describing, and every write is atomic — a failed or interrupted download can never leave
 * a truncated file that the next run mistakes for a cache hit.
 */

import { join } from 'node:path';

import { getText } from './http.js';
import { readFileOrNull, writeFileAtomic } from './fs-utils.js';
import type { ResolvedIcon } from './repo-index.js';

export interface FetchedIcon {
  readonly svg: string;
  readonly fromCache: boolean;
}

/** Shortest plausible game-icons SVG; anything smaller is a truncated or error body. */
const MIN_SVG_BYTES = 64;

export function svgCachePath(cacheDir: string, icon: ResolvedIcon): string {
  return join(cacheDir, 'svg', icon.author, `${icon.name}.svg`);
}

/**
 * Returns the icon's SVG, from cache when possible.
 *
 * @param force ignore any cached copy and re-download
 */
export async function fetchIcon(
  icon: ResolvedIcon,
  cacheDir: string,
  force: boolean,
): Promise<FetchedIcon> {
  const path = svgCachePath(cacheDir, icon);

  if (!force) {
    const cached = await readFileOrNull(path);
    if (cached !== null && isPlausibleSvg(cached)) return { svg: cached, fromCache: true };
  }

  const svg = await getText(icon.url);
  if (!isPlausibleSvg(svg)) {
    throw new Error(`${icon.author}/${icon.name}.svg: response was not an SVG document`);
  }

  await writeFileAtomic(path, svg);
  return { svg, fromCache: false };
}

function isPlausibleSvg(contents: string): boolean {
  return (
    contents.length >= MIN_SVG_BYTES &&
    contents.includes('<svg') &&
    contents.trimEnd().endsWith('</svg>')
  );
}
