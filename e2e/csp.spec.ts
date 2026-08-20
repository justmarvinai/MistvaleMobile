import { expect, test } from '@playwright/test';
import { createServer, type Server } from 'node:http';
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PASSWORD, chooseStarter, leaveTutorial, pickTeam, unique } from './support';

/**
 * The battlefield under the policy the live site actually sends.
 *
 * This file exists because of the longest-running bug in the project. For four rounds the
 * owner's battles rendered a correct HUD over a black rectangle — no champions, no enemies,
 * no ground, not even the ambient fog — and it never reproduced in development once. The
 * cause was not the art, not the graphics card, and not the browser. It was Mistvale's own
 * `Content-Security-Policy`.
 *
 * Pixi builds its shader programs with `new Function`, and nginx sends `script-src \'self\'`,
 * which refuses that. `Application.init` rejected, every scene was held pending forever, and
 * the DOM half of the game carried on perfectly. **The dev server sends no CSP at all**, so
 * the one environment nobody could test was the only one where it happened.
 *
 * Which is why this spec does not use the dev server. It serves the real production build
 * over a throwaway static server, with the policy read straight out of the nginx config that
 * is actually deployed — so the test cannot drift from the header, and a change that
 * reintroduces something the policy forbids goes red here rather than on the owner\'s screen.
 *
 * Requires `apps/client/dist`. `pnpm verify` builds it; the spec says so plainly rather than
 * passing vacuously if it is missing.
 */

const DIST = fileURLToPath(new URL('../apps/client/dist', import.meta.url));

/** The site policy, lifted from the deployed nginx config rather than copied into a string. */
function sitePolicy(): string {
  const conf = readFileSync(
    new URL('../scripts/deploy-assets/nginx-mistvale.conf', import.meta.url),
    'utf8',
  );
  // The first `add_header Content-Security-Policy "…"` is the site-wide one; the later ones
  // narrow single locations (the admin index, the uploads sandbox).
  const policy = /add_header Content-Security-Policy "([^"]+)"/.exec(conf)?.[1];
  if (!policy) throw new Error('no Content-Security-Policy in nginx-mistvale.conf');
  return policy;
}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

/**
 * nginx, in forty lines: the built client with the policy on it, and the API proxied through.
 *
 * Deliberately not a dependency. What is being tested is the shape of the deployment — a
 * static bundle under a strict header — and anything that changed that shape to be
 * convenient would test something else.
 */
async function serveBuild(
  apiOrigin: string,
  policy: string,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? '/', 'http://localhost');

    if (url.pathname.startsWith('/api/')) {
      const upstream = new URL(url.pathname + url.search, apiOrigin);
      const body: Buffer[] = [];
      request.on('data', (chunk: Buffer) => body.push(chunk));
      request.on('end', () => {
        void fetch(upstream, {
          method: request.method,
          headers: { ...(request.headers as Record<string, string>), host: upstream.host },
          body: body.length > 0 ? Buffer.concat(body) : undefined,
          redirect: 'manual',
        })
          .then(async (proxied) => {
            const headers: Record<string, string | string[]> = {};
            proxied.headers.forEach((value, key) => {
              if (key !== 'content-encoding' && key !== 'content-length') headers[key] = value;
            });
            const cookies = proxied.headers.getSetCookie?.() ?? [];
            if (cookies.length > 0) headers['set-cookie'] = cookies;
            response.writeHead(proxied.status, headers);
            response.end(Buffer.from(await proxied.arrayBuffer()));
          })
          .catch(() => {
            response.writeHead(502).end();
          });
      });
      return;
    }

    // Static, with the SPA fallback the site uses.
    const asked = normalize(join(DIST, decodeURIComponent(url.pathname)));
    const file =
      asked.startsWith(DIST) && existsSync(asked) && statSync(asked).isFile()
        ? asked
        : join(DIST, 'index.html');
    response.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'content-security-policy': policy,
    });
    createReadStream(file).pipe(response);
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('no port');
  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test.describe('the site security policy', () => {
  test('lets the battlefield draw', async ({ page, baseURL }) => {
    test.slow();
    test.skip(
      !existsSync(join(DIST, 'index.html')),
      'needs the client build — run `pnpm build` (or `pnpm verify`) first',
    );

    const policy = sitePolicy();
    expect(policy, 'the policy under test forbids eval, as the real one does').not.toContain(
      'unsafe-eval',
    );

    const site = await serveBuild(baseURL ?? 'http://127.0.0.1:5173', policy);
    const violations: string[] = [];
    page.on('console', (message) => {
      const text = message.text();
      if (/Content Security Policy|unsafe-eval/i.test(text)) violations.push(text.slice(0, 200));
    });

    try {
      // Registration inline rather than through `registerRaw`, which navigates to the
      // config's `baseURL` — the dev server, which is the one place this bug cannot happen.
      await page.goto(site.url);
      await page.getByRole('tab', { name: 'New warden' }).click();
      await page.getByLabel('Account name').fill(unique('e2ecsp'));
      await page.getByLabel('Profile name').fill(unique('Warden'));
      await page.getByLabel('Password').fill(PASSWORD);
      await page.getByRole('button', { name: 'Take up the lantern' }).click();
      await leaveTutorial(page);
      await chooseStarter(page);

      await page
        .getByRole('button', { name: /^campaign$/i })
        .first()
        .click();
      await page.getByRole('button', { name: '1-1', exact: false }).first().click();
      const teamDialog = page.getByRole('dialog', { name: /stage 1/i });
      await pickTeam(teamDialog);
      await teamDialog.getByRole('button', { name: /into the mist/i }).click();

      await expect(page.locator('.fui-actionbar [role="button"]').first()).toBeVisible({
        timeout: 30_000,
      });

      // The screen\'s own verdict on whether it managed to draw. It knew all along; under the
      // old code it was saying so to nobody, because the message was never rendered.
      await page.waitForTimeout(4_000);
      await expect(
        page.getByText(/graphics acceleration|battlefield/i),
        'the battlefield draws under the site policy',
      ).toHaveCount(0);

      expect(violations, 'nothing the policy forbids was attempted').toEqual([]);
    } finally {
      await site.close();
    }
  });
});
