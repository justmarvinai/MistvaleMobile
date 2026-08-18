/**
 * Vendors the FantasyUIs component library into the client.
 *
 * The library is the owner's own (`justmarvinai/FantasyUIs`): vanilla TypeScript and CSS
 * with no runtime dependencies, published as a static site with a machine-readable
 * registry. Every component has a `/r/<Name>.json` record whose `copy` field is the
 * transitive closure of its real import statements — copy exactly those paths and it
 * compiles untouched. That contract is what this script consumes.
 *
 * **Why vendor rather than depend.** Three reasons, in order of how much they matter:
 *
 *  1. The art must be self-hosted. Mistvale's nginx sends
 *     `Content-Security-Policy: img-src 'self' data: blob:`, so a component streaming its
 *     panel fill from a third-party origin renders nothing in production. `setAssetBase`
 *     exists for exactly this and the library documents it as the shipping path.
 *  2. A game must not have a runtime dependency on somebody else's uptime.
 *  3. There is no npm package — the library is consumed by copying, by design.
 *
 * The copies are byte-identical to upstream, so re-vendoring a newer library is a clean
 * overwrite and `git diff` says precisely what changed. Nothing here rewrites imports;
 * the client's tsconfig allows the `.ts` extensions the library uses instead.
 *
 * Usage:
 *   pnpm fui:vendor --from /path/to/fantasyuis     # copy
 *   pnpm fui:vendor --from /path/to/fantasyuis --check   # fail if anything differs
 *
 * The library's own `npm run gen` must have been run in that checkout first: `public/r/`
 * is generated and gitignored there.
 */
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FUI_COMPONENTS, FUI_PACKS } from './components';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '../../..');
const codeOut = join(repoRoot, 'apps/client/src/fui');
const artOut = join(repoRoot, 'apps/client/public/fui');

interface Record_ {
  id: string;
  copy: string[];
}

/**
 * Files every component needs regardless of which ones are picked.
 *
 * `assets.css` declares `--fui-img-*` for every asset in the library, including packs
 * Mistvale does not vendor. That costs nothing: a custom property whose `url()` nothing
 * reads is never fetched, and keeping the file whole means a pack added to `FUI_PACKS`
 * later works without regenerating anything.
 *
 * Only `dark-ember` comes across. Stone & Vine is the library's other theme and Mistvale
 * is not it.
 */
const ALWAYS = [
  'src/lib/styles/base.css',
  'src/lib/styles/assets.css',
  'src/lib/styles/theme-dark-ember.css',
  // `setAssetBase` lives here. No component imports it — it is the library's public API
  // for a consumer repointing the art at their own origin, which Mistvale must do — so it
  // appears in no record's `copy` list and has to be named.
  'src/lib/core/assets.ts',
];

/**
 * The line written at the top of every vendored `.ts`.
 *
 * Mistvale compiles with `noUncheckedIndexedAccess`, which the library does not; held to
 * this repo's config its ninety-nine components raise thirty-seven "possibly undefined"
 * errors on array and record reads that are provably in range. Those are not bugs and
 * they are not ours to fix: patching them would make the next `pnpm fui:vendor` a merge
 * instead of a copy, and the fixes would vanish with it.
 *
 * Suppressing the *check* does not suppress the *types* — `useFui(Panel, …)` still gets
 * `PanelOptions`, and Mistvale's own code keeps full strictness. The library runs its own
 * `npm run typecheck` upstream, which is where these files are answerable.
 */
const BANNER =
  '// @ts-nocheck — vendored verbatim from FantasyUIs by tools/fui-vendor. See VENDORED.md.\n';

function fail(message: string): never {
  process.stderr.write(`fui-vendor: ${message}\n`);
  process.exit(1);
}

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check');
  const from = resolve(arg('from') ?? process.env.FUI_SOURCE ?? join(repoRoot, '../fantasyuis'));

  if (!existsSync(join(from, 'public/r'))) {
    fail(
      `no registry at ${join(from, 'public/r')} — clone justmarvinai/FantasyUIs and run ` +
        `\`npm install && npm run gen\` there first, then pass --from <path>.`,
    );
  }

  // ── The code ───────────────────────────────────────────────────────────────
  // Resolved through the records rather than by listing files, so a component that grows
  // a dependency upstream brings it along without anyone noticing it had to.
  const wanted = new Set<string>(ALWAYS);
  for (const name of FUI_COMPONENTS) {
    const recordPath = join(from, 'public/r', `${name}.json`);
    if (!existsSync(recordPath)) fail(`no registry record for ${name} (${recordPath})`);
    const record = JSON.parse(await readFile(recordPath, 'utf8')) as Record_;
    for (const path of record.copy) wanted.add(path);
  }

  const mismatched: string[] = [];
  let copied = 0;
  for (const path of [...wanted].sort()) {
    const source = join(from, path);
    if (!existsSync(source)) fail(`the record names a file that does not exist: ${path}`);
    // `src/lib/components/X.ts` → `fui/components/X.ts`, `src/lib/core/…` → `fui/core/…`,
    // `src/lib/styles/…` → `fui/styles/…`. The shape is kept because the library's own
    // imports are `../core/component.ts`; flattening would mean rewriting every one.
    const target = join(codeOut, path.replace(/^src\/lib\//, ''));
    const banner = path.endsWith('.ts') ? BANNER : '';
    if (check) {
      const current = existsSync(target) ? await readFile(target, 'utf8') : null;
      if (current === null || current !== banner + (await readFile(source, 'utf8'))) {
        mismatched.push(relative(repoRoot, target));
      }
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    if (banner) await writeFile(target, banner + (await readFile(source, 'utf8')));
    else await cp(source, target);
    copied += 1;
  }

  // ── The art ────────────────────────────────────────────────────────────────
  // Two sources, because a pack is not a closed set. `FUI_PACKS` names the packs Mistvale
  // ships whole; on top of that, **a theme reaches across packs**. Dark Ember's own
  // stylesheet points its divider, its three icon buttons, two bar fills and one panel at
  // Stone & Vine files — seven images out of that pack's several hundred. Vendoring by
  // pack alone left those seven slots pointing at 404s, which is not a broken image but
  // an *absent* one: the ornament under every screen title was simply 40px of nothing,
  // and the close button on every modal was a blank square.
  //
  // So the art set is the listed packs plus whatever the vendored themes actually
  // reference, resolved through `assets.css`. Adding a pack, or a theme growing a
  // reference, both come out right on the next run with nobody maintaining a list.
  const artWanted = new Set<string>();
  for (const pack of FUI_PACKS) {
    const source = join(from, 'public/fui', pack);
    if (!existsSync(source)) fail(`no art pack "${pack}" in ${join(from, 'public/fui')}`);
    for (const name of await readdir(source)) {
      if (name.startsWith('.')) continue;
      if ((await stat(join(source, name))).isDirectory()) continue;
      artWanted.add(`${pack}/${name}`);
    }
  }
  for (const path of themeArtReferences(from)) artWanted.add(path);

  let artFiles = 0;
  let artBytes = 0;
  for (const rel of [...artWanted].sort()) {
    const file = join(from, 'public/fui', rel);
    if (!existsSync(file)) fail(`theme references /fui/${rel}, which the library does not have`);
    artBytes += (await stat(file)).size;
    artFiles += 1;
    const target = join(artOut, rel);
    if (check) {
      if (!existsSync(target)) mismatched.push(relative(repoRoot, target));
      continue;
    }
    await mkdir(dirname(target), { recursive: true });
    await cp(file, target);
  }

  // Art dropped from the set must not linger: `public/` is served wholesale, so a stale
  // file is dead weight in every deploy.
  if (!check && existsSync(artOut)) {
    for (const pack of await readdir(artOut)) {
      const dir = join(artOut, pack);
      if (!(await stat(dir)).isDirectory()) continue;
      for (const name of await readdir(dir)) {
        if (!artWanted.has(`${pack}/${name}`)) await rm(join(dir, name), { force: true });
      }
      if ((await readdir(dir)).length === 0) await rm(dir, { recursive: true, force: true });
    }
  }

  if (check) {
    if (mismatched.length > 0) {
      process.stderr.write(
        `fui-vendor: ${mismatched.length} vendored file(s) differ from the library:\n` +
          mismatched
            .slice(0, 12)
            .map((path) => `  ${path}\n`)
            .join('') +
          (mismatched.length > 12 ? `  …and ${mismatched.length - 12} more\n` : '') +
          'Run `pnpm fui:vendor` to bring them back in line.\n',
      );
      process.exit(1);
    }
    process.stdout.write(
      `fui-vendor: ${wanted.size} files and ${artFiles} art files are current.\n`,
    );
    return;
  }

  // ── The stylesheet barrel ──────────────────────────────────────────────────
  // Written rather than hand-maintained: a component vendored without its CSS in the
  // barrel renders as unstyled markup, which is a silent failure and exactly the sort the
  // library's own audit exists to catch.
  const cssFiles = [...wanted]
    .filter((path) => path.endsWith('.css'))
    .map((path) => path.replace(/^src\/lib\//, './'))
    .sort((a, b) => {
      // base first (tokens and the scoped reset), then assets, then the theme, then
      // components — the order the cascade needs.
      const rank = (path: string): number =>
        path.includes('/base.css')
          ? 0
          : path.includes('/assets.css')
            ? 1
            : path.includes('/theme-')
              ? 2
              : 3;
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  await writeFile(
    join(codeOut, 'styles.css'),
    [
      "/* Generated by tools/fui-vendor — every vendored component's stylesheet, in",
      '   cascade order: tokens, art variables, theme, components. Do not edit. */',
      ...cssFiles.map((path) => `@import '${path}';`),
      '',
    ].join('\n'),
  );

  // A manifest so the vendored tree says where it came from without anybody guessing.
  const head = existsSync(join(from, '.git'))
    ? (await readFile(join(from, '.git/HEAD'), 'utf8')).trim()
    : 'unknown';
  await writeFile(
    join(codeOut, 'VENDORED.md'),
    [
      '# Vendored from FantasyUIs',
      '',
      '<!-- Written by tools/fui-vendor. Do not edit these files by hand: the next',
      '     `pnpm fui:vendor` overwrites them, and a local fix would vanish with it.',
      '     Mistvale-specific changes belong in ../ui/ or in the theme. -->',
      '',
      `Source: [justmarvinai/FantasyUIs](https://github.com/justmarvinai/FantasyUIs) — \`${head}\``,
      '',
      `- **${FUI_COMPONENTS.length} components**, ${wanted.size} files, resolved through the`,
      "  library's own `/r/<Name>.json` records (the `copy` field is the transitive closure",
      '  of real import statements).',
      `- **${FUI_PACKS.length} art packs** — ${FUI_PACKS.join(', ')} — plus the individual`,
      `  files Dark Ember reaches into other packs for. ${artFiles} files,`,
      `  ${(artBytes / 1024 / 1024).toFixed(1)} MB, in \`apps/client/public/fui/\`.`,
      '',
      'Re-vendor with `pnpm fui:vendor --from <path to a FantasyUIs checkout>`; CI runs',
      '`--check` and fails when a vendored file has drifted from the library.',
      '',
    ].join('\n'),
  );

  process.stdout.write(
    `fui-vendor: ${copied} source files, ${artFiles} art files ` +
      `(${(artBytes / 1024 / 1024).toFixed(1)} MB) → apps/client\n`,
  );
}

await main();

/**
 * Every `/fui/…` file the vendored stylesheets reference.
 *
 * `base.css` and the theme name art through `var(--fui-img-*)`; `assets.css` is the one
 * place those slots become URLs. Resolving the two against each other is how a theme's
 * cross-pack reference is discovered rather than remembered.
 */
function themeArtReferences(from: string): string[] {
  const styles = join(from, 'src/lib/styles');
  const declared = new Map<string, string>();
  for (const match of readFileSync(join(styles, 'assets.css'), 'utf8').matchAll(
    /(--fui-img-[\w-]+):\s*url\("\/fui\/([^"]+)"\)/g,
  )) {
    const [, slot, url] = match;
    if (slot && url) declared.set(slot, url);
  }
  const referenced = new Set<string>();
  for (const file of ['base.css', 'theme-dark-ember.css']) {
    for (const match of readFileSync(join(styles, file), 'utf8').matchAll(
      /var\((--fui-img-[\w-]+)\)/g,
    )) {
      const url = match[1] === undefined ? undefined : declared.get(match[1]);
      if (url) referenced.add(url);
    }
  }
  return [...referenced];
}
