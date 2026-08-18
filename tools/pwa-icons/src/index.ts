import { chromium } from '@playwright/test';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * The PWA icons, rendered from the mark the repo already holds.
 *
 * `favicon.svg` is the one Mistvale mark and it stays the source of truth — these are an
 * *export* of it rather than new artwork, which matters given the brief's rule about
 * where icons may come from. Written as a script rather than checked in by hand so the
 * relationship survives: change the mark, run `pnpm icons:pwa`, and every size follows.
 *
 * Rendered through the Chromium that already drives the browser suite rather than by
 * adding an image dependency. The mark is `shape-rendering="crispEdges"` pixel art on a
 * 32-unit grid, so the sizes below are deliberately integer multiples of 32 — 192 is ×6
 * and 512 is ×16 — and every edge lands exactly on a pixel boundary.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = resolve(HERE, '../../../apps/client/public');

interface IconSpec {
  size: number;
  file: string;
  /**
   * Maskable icons are cropped to whatever shape the platform prefers, so the mark has to
   * sit inside the safe zone — 80% of the width, centred — or Android will shave the gate.
   */
  padded?: boolean;
}

const ICONS: IconSpec[] = [
  { size: 192, file: 'icon-192.png' },
  { size: 512, file: 'icon-512.png' },
  { size: 512, file: 'icon-maskable-512.png', padded: true },
  // iOS ignores the manifest and reads this one off the page.
  { size: 180, file: 'apple-touch-icon.png' },
];

async function main(): Promise<void> {
  const markup = await readFile(resolve(PUBLIC, 'favicon.svg'), 'utf8');
  const browser = await chromium.launch({
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
  });

  try {
    for (const icon of ICONS) {
      const page = await browser.newPage({
        viewport: { width: icon.size, height: icon.size },
        deviceScaleFactor: 1,
      });
      const inset = icon.padded ? Math.round(icon.size * 0.1) : 0;
      await page.setContent(
        `<!doctype html><style>
           html,body{margin:0;padding:0;background:#0b0e14;image-rendering:pixelated}
           svg{position:absolute;inset:${inset}px;width:${icon.size - inset * 2}px;height:${icon.size - inset * 2}px}
         </style>${markup}`,
      );
      const png = await page.screenshot({ omitBackground: false });
      await mkdir(PUBLIC, { recursive: true });
      await writeFile(resolve(PUBLIC, icon.file), png);
      await page.close();
      console.log(`icons: wrote ${icon.file} (${icon.size}×${icon.size})`);
    }
  } finally {
    await browser.close();
  }
}

main().catch((error: unknown) => {
  console.error('icon export failed:');
  console.error(error);
  process.exit(1);
});
