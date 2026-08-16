import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildOpenApiDocument } from '@mistvale/shared';

/**
 * `pnpm openapi` — writes `docs/openapi/admin-api.json`.
 *
 * The artifact is committed, and CI regenerates it and fails on a diff, so the Admin
 * repo (which generates its client types from it) can never be looking at a contract the
 * server has since moved away from (docs/ADMIN_ARCHITECTURE.md §3).
 *
 * `--check` regenerates in memory and exits non-zero on drift, without writing.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const target = resolve(repoRoot, 'docs/openapi/admin-api.json');

async function main(): Promise<void> {
  const pkg = JSON.parse(await readFile(resolve(repoRoot, 'package.json'), 'utf8')) as {
    version: string;
  };

  const document = buildOpenApiDocument({ version: pkg.version });
  const json = `${JSON.stringify(document, null, 2)}\n`;

  if (process.argv.includes('--check')) {
    const existing = await readFile(target, 'utf8').catch(() => null);
    if (existing === null) {
      console.error(`openapi: ${target} is missing. Run \`pnpm openapi\`.`);
      process.exit(1);
    }
    if (existing !== json) {
      console.error(
        'openapi: the committed artifact is out of date.\n' +
          '  The Zod contracts in packages/shared have changed since it was generated.\n' +
          '  Run `pnpm openapi` and commit the result.',
      );
      process.exit(1);
    }
    console.log('openapi: artifact is up to date.');
    return;
  }

  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, json, 'utf8');

  const paths = Object.keys(document.paths as Record<string, unknown>).length;
  const schemas = Object.keys(
    (document.components as { schemas: Record<string, unknown> }).schemas,
  ).length;
  console.log(`openapi: wrote ${target} — ${paths} paths, ${schemas} schemas.`);
}

main().catch((error: unknown) => {
  console.error('openapi: generation failed.');
  console.error(error);
  process.exit(1);
});
