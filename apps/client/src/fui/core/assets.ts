// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.
/**
 * Asset resolution.
 *
 * Artwork is addressed by id. By default every id resolves against the hosted
 * FantasyUIs CDN, which means a snippet copied off the website renders straight
 * away with zero setup. Ship a game for real and you call `setAssetBase()` once
 * to point at your own `public/` folder instead.
 *
 *   import { setAssetBase } from 'fantasyuis';
 *   setAssetBase('/fui');      // now resolves to /fui/stone-vine/panel-stone.png
 */

export const CDN_BASE = 'https://fantasy-u-is.vercel.app/fui';

let base = CDN_BASE;

/** Point every asset lookup at a new root (no trailing slash). */
export function setAssetBase(next: string): void {
  base = next.replace(/\/+$/, '');
}

/** The root every asset currently resolves against. */
export function getAssetBase(): string {
  return base;
}

/** Resolve a manifest-relative path, e.g. "stone-vine/panel-stone.png". */
export function assetUrl(file: string): string {
  return `${base}/${file.replace(/^\/+/, '')}`;
}

/**
 * The CSS custom property holding an asset's `url()`, e.g. `var(--fui-img-panel-stone)`.
 * Themes and generated CSS declare these, so components can reference art without
 * hard-coding any path.
 */
export function imgVar(id: string): string {
  return `var(--fui-img-${id})`;
}

/** The CSS custom property holding an asset's 9-slice border widths. */
export function borderVar(id: string): string {
  return `var(--fui-bw-${id})`;
}

/** The CSS custom property holding an asset's unitless 9-slice numbers. */
export function sliceVar(id: string): string {
  return `var(--fui-slice-${id})`;
}
