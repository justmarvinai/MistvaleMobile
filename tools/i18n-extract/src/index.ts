import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOGUE_TEMPLATE, renderTemplate, templateProblems } from './template';
import { extractFile, merge, type Extraction } from './extract';
import { TEXT_TABLES, extractTable } from './tables';

/**
 * `pnpm i18n` — the extraction, the report and the check.
 *
 * Three jobs, and the middle one is why this is not just a build step:
 *
 *  - It writes the **catalogue template**, which is the file a translator fills in. Keys are
 *    the English itself (`shared/i18n.ts`), so the template is a starting point rather than
 *    a contract — a missing entry falls back to English and renders correctly.
 *  - It **reports** how much of the game is still hard-coded, which is the figure the
 *    roadmap's claim rests on and which nobody has ever counted. That number going down is
 *    what "adopting the text layer" means, and it going *up* is what a new screen written
 *    without it looks like.
 *  - `--check` fails when the template on disk has gone stale, the same shape as
 *    `openapi:check`, so a string added and never extracted is a red build rather than a
 *    sentence stuck in English in every other language.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '../../..');
const clientSrc = join(repo, 'apps/client/src');
const templatePath = join(repo, 'apps/client/src/i18n/template.json');

/** Every `.ts`/`.tsx` under the client, minus the vendored library and the tests. */
function sources(root: string): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        // `fui/` is vendored and overwritten by the next `pnpm fui:vendor`, so a string in
        // it is not ours to extract — the theme layer is where Mistvale speaks.
        if (entry.name === 'fui' || entry.name === 'node_modules') continue;
        walk(path);
        continue;
      }
      if (!/\.tsx?$/.test(entry.name)) continue;
      if (/\.(test|spec)\.tsx?$/.test(entry.name)) continue;
      found.push(path);
    }
  };
  walk(root);
  return found.sort();
}

function scan(): Extraction {
  const fromCode = merge(
    sources(clientSrc).map((path) => extractFile(relative(repo, path), readFileSync(path, 'utf8'))),
  );

  // The string tables, which are prose the call site cannot name (`tables.ts`). Merged in as
  // reachable, because they are: the call reads the table and the table is extracted.
  const fromTables = TEXT_TABLES.flatMap((table) =>
    extractTable(table, readFileSync(join(repo, table.file), 'utf8')).map((source) => ({
      source,
      file: table.file,
      line: 0,
    })),
  );

  return merge([fromCode, { reachable: fromTables, unreachable: [], dynamic: [] }]);
}

function report(extraction: Extraction): void {
  const byFile = new Map<string, number>();
  for (const entry of extraction.unreachable) {
    byFile.set(entry.file, (byFile.get(entry.file) ?? 0) + 1);
  }
  const worst = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  console.log('\n> Strings');
  console.log(`  reachable      ${extraction.reachable.length}`);
  console.log(`  still in code  ${extraction.unreachable.length}`);
  // A call whose argument is a variable is nearly always one reading a *table*, and the
  // table is extracted instead — so this is a count worth watching rather than a fault.
  console.log(`  fed from data  ${extraction.dynamic.length}`);

  if (worst.length > 0) {
    console.log('\n> Most still in code');
    for (const [file, count] of worst) {
      console.log(`  ${String(count).padStart(4)}  ${file}`);
    }
  }

  if (extraction.dynamic.length > 0) {
    console.log('\n> Text calls with no literal to extract');
    for (const entry of extraction.dynamic.slice(0, 8)) {
      console.log(`  ${entry.file}:${entry.line}`);
    }
  }
}

function main(): void {
  const check = process.argv.includes('--check');
  const extraction = scan();
  const rendered = renderTemplate(extraction.reachable.map((entry) => entry.source));

  if (check) {
    let existing = '';
    try {
      existing = readFileSync(templatePath, 'utf8');
    } catch {
      existing = '';
    }
    if (existing !== rendered) {
      /*
       * The specific complaint first, and that ordering is the whole point of having one.
       *
       * Any difference at all makes the file "stale", so a bare staleness message is what a
       * translator who filled in the template would be shown — and the fix it names,
       * `pnpm i18n`, silently overwrites their work. Naming *what* is different means the
       * one mistake with a destructive remedy says so instead.
       */
      const problems = templateProblems(existing);
      if (problems.length > 0) {
        for (const problem of problems) console.error(`i18n: ${problem}`);
        process.exit(1);
      }
      console.error(
        `i18n: ${relative(repo, templatePath)} is stale. Run \`pnpm i18n\` and commit the ` +
          'result — a string added and never extracted is one that stays English in every ' +
          'other language.',
      );
      process.exit(1);
    }
    console.log('i18n: the catalogue template is up to date.');
    report(extraction);
    return;
  }

  writeFileSync(templatePath, rendered);
  console.log(
    `i18n: wrote ${relative(repo, templatePath)} — ${extraction.reachable.length} strings.`,
  );
  console.log(`      ${CATALOGUE_TEMPLATE}`);
  report(extraction);
}

main();
