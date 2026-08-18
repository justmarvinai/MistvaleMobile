import { expect, test } from '@playwright/test';

/**
 * Installability, checked from the page rather than from the repo.
 *
 * A manifest is the kind of file that breaks silently: rename an icon, mistype a size,
 * serve it as `text/plain`, and nothing in the game misbehaves — the browser simply stops
 * offering to install, and nobody notices until somebody tries. Everything here is a
 * requirement a browser actually enforces before showing the prompt.
 *
 * The service worker is deliberately not exercised: it registers in production builds
 * only, because one that has claimed the page intercepts Vite's module requests and its
 * HMR socket — which would break this suite along with every developer.
 */

test.describe('the installable game', () => {
  test('offers a manifest a browser will accept', async ({ page }) => {
    await page.goto('/');

    const href = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(href, 'the page must link a manifest').toBe('/manifest.webmanifest');

    const response = await page.request.get('/manifest.webmanifest');
    expect(response.status()).toBe(200);

    const manifest = (await response.json()) as {
      name?: string;
      short_name?: string;
      start_url?: string;
      display?: string;
      background_color?: string;
      theme_color?: string;
      icons?: { src: string; sizes: string; type: string; purpose?: string }[];
    };

    // The five fields Chrome checks before it will show an install prompt.
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.start_url).toBeTruthy();
    expect(['standalone', 'fullscreen', 'minimal-ui']).toContain(manifest.display);
    expect(manifest.icons?.length ?? 0).toBeGreaterThan(0);

    // A 192 and a 512 are the sizes it insists on.
    const sizes = new Set((manifest.icons ?? []).map((icon) => icon.sizes));
    expect(sizes.has('192x192'), 'a 192px icon is required').toBe(true);
    expect(sizes.has('512x512'), 'a 512px icon is required').toBe(true);

    // And one maskable, or Android crops the mark to whatever shape it likes.
    const maskable = (manifest.icons ?? []).filter((icon) => icon.purpose === 'maskable');
    expect(maskable.length, 'a maskable icon keeps the gate out of the crop').toBeGreaterThan(0);
  });

  test('serves every icon the manifest promises', async ({ page }) => {
    await page.goto('/');
    const manifest = (await (await page.request.get('/manifest.webmanifest')).json()) as {
      icons?: { src: string; type: string }[];
    };

    for (const icon of manifest.icons ?? []) {
      const response = await page.request.get(icon.src);
      expect(response.status(), `${icon.src} must exist`).toBe(200);
      expect(response.headers()['content-type'], icon.src).toContain('image/png');
    }

    // iOS never reads the manifest; it reads this off the page.
    const apple = await page.getAttribute('link[rel="apple-touch-icon"]', 'href');
    expect(apple).toBeTruthy();
    expect((await page.request.get(apple as string)).status()).toBe(200);
  });

  test('ships a worker that leaves the server alone', async ({ page }) => {
    // Mistvale is server-authoritative: the client never computes an outcome, a roll or a
    // timer. A cached API response would be a lie about an account that a player could
    // act on, so `/api` must be untouched by the worker under every strategy.
    const source = await (await page.request.get('/sw.js')).text();
    expect(source).toContain("url.pathname.startsWith('/api')");

    const fetchHandler = /addEventListener\(\s*'fetch'/.test(source);
    expect(fetchHandler, 'a browser will not offer to install without one').toBe(true);
  });
});
