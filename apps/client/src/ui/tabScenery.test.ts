import { describe, expect, it } from 'vitest';
import { DOCK_SCREENS, SCREENS, dockSlotFor } from '../app/screens';
import { EMBER_SMOKE, tabScenery, wallpaperUrl } from './tabScenery';

/**
 * What each tab looks like behind everything else.
 *
 * Pure and tested here rather than walked in a browser, because what can actually go wrong
 * is a *mapping* rather than a picture: a dock entry with no painting, a screen that lands
 * on somebody else's tab, or a palette the owner asked to differ that quietly does not.
 * Whether the art reaches the screen is `e2e/wallpaper.spec.ts`'s job.
 */

describe('tabScenery', () => {
  it('gives every tab in the dock a painting of its own', () => {
    // Six dock entries, six wallpapers — an entry with none would be a tab that goes back
    // to a bare ground while its five neighbours are painted, which reads as a bug.
    const wallpapers = DOCK_SCREENS.map((screen) => tabScenery(screen.id).wallpaper);
    expect(
      wallpapers.every((name) => name !== null),
      'every dock tab is painted',
    ).toBe(true);
    expect(new Set(wallpapers).size, 'and no two share a painting').toBe(DOCK_SCREENS.length);
  });

  it('paints every screen in the game, through the tab it lives in', () => {
    // The rule that keeps this map six entries rather than twenty-four: a player in the
    // Depths is inside the Battle tab, so `dockSlotFor` is what decides the backdrop.
    // A screen that resolved to nothing would drop to a bare ground on arrival.
    const unpainted = SCREENS.filter(
      (screen) => tabScenery(dockSlotFor(screen.id)).wallpaper === null,
    );
    expect(
      unpainted.map((screen) => screen.id),
      'screens with no tab painting',
    ).toEqual([]);
  });

  it('drifts the fog the owner asked for, tab by tab', () => {
    // The owner's own list (2026-08-28): Combat, Champions and the Bazaar keep the ember
    // fog the game shipped with; the Haven, the Mistgate and Errands each get their own.
    expect(tabScenery('battleHub').smoke).toBe(EMBER_SMOKE);
    expect(tabScenery('championsHub').smoke).toBe(EMBER_SMOKE);
    expect(tabScenery('bazaar').smoke).toBe(EMBER_SMOKE);
    for (const tab of ['haven', 'mistgate', 'errandsHub'] as const) {
      expect(tabScenery(tab).smoke, `${tab} has its own fog`).not.toBe(EMBER_SMOKE);
    }
  });

  it('hands back the same palette object for a tab, so the fog is not repainted', () => {
    // Identity, not equality: the shell re-tints on every change of tab and `setPalette`
    // skips a palette it is already drawing. A map that built a fresh object per call would
    // redraw twelve ellipses on every render of the shell rather than on every tab change.
    expect(tabScenery('haven').smoke).toBe(tabScenery('haven').smoke);
  });

  it('falls back to the fog the game shipped with, and no painting', () => {
    // A seventh tab added to the dock before anyone has painted it: the fog still drifts
    // and the ground shows through, which is exactly what the game looked like before.
    expect(tabScenery(null)).toEqual({ wallpaper: null, smoke: EMBER_SMOKE });
  });

  it('serves a wallpaper as the JPEG the pipeline publishes', () => {
    // `pnpm assets` re-encodes this set: the six come to 12.9 MB as PNG against 1.45 MB as
    // JPEG, and a URL that still said `.png` would 404 into the SPA's own HTML with a 200.
    expect(wallpaperUrl('tab_haven_wallpaper')).toBe('/wallpapers/tab_haven_wallpaper.jpg');
  });
});
