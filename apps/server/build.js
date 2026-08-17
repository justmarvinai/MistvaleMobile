import { build } from 'esbuild';
import { readFile, rm } from 'node:fs/promises';

/**
 * Production build.
 *
 * Our own TypeScript — including the `@mistvale/*` workspace packages, which ship as
 * source — is bundled into a few entrypoints. Real npm dependencies stay external so
 * native modules like argon2 keep working and the bundle stays small. One file per entry
 * means a fast cold start on the single-core VPS and no resolution work at runtime.
 *
 * Type checking is a separate step (`pnpm typecheck`) — esbuild only transpiles.
 */

const pkg = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'));

/**
 * Everything installed from the registry is external; workspace packages are not, since
 * their published entrypoint is TypeScript that Node cannot execute directly.
 */
const external = [
  ...Object.keys(pkg.dependencies ?? {}),
  ...Object.keys(pkg.devDependencies ?? {}),
].filter((name) => !name.startsWith('@mistvale/'));

const ENTRYPOINTS = {
  // The server itself.
  index: 'src/index.ts',
  // Operational one-shots, invoked by the deploy scripts.
  'db/migrate': 'src/db/migrate.ts',
  'db/seed': 'src/db/seed/index.ts',
  'scripts/set-rank': 'src/scripts/set-rank.ts',
  'scripts/seed-arena-bots': 'src/scripts/seed-arena-bots.ts',
};

await rm('dist', { recursive: true, force: true });

const results = await Promise.all(
  Object.entries(ENTRYPOINTS).map(([outName, entry]) =>
    build({
      entryPoints: [entry],
      outfile: `dist/${outName}.js`,
      bundle: true,
      platform: 'node',
      target: 'node22',
      format: 'esm',
      external,
      sourcemap: true,
      minify: false, // Readable stack traces matter more than a few hundred KB here.
      logLevel: 'info',
      // Node's ESM output needs these CJS interop shims for a few dependencies.
      banner: {
        js: [
          "import { createRequire as __createRequire } from 'node:module';",
          'const require = __createRequire(import.meta.url);',
        ].join('\n'),
      },
    }),
  ),
);

const warnings = results.flatMap((result) => result.warnings);
if (warnings.length > 0) {
  console.warn(`Build completed with ${warnings.length} warning(s).`);
}
console.log(`Built ${Object.keys(ENTRYPOINTS).length} entrypoints into dist/.`);
