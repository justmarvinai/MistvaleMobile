import ts from 'typescript';

/**
 * Prose that lives in a **table** rather than at a call site.
 *
 * The natural-key design extracts the literal argument of a `t()` call, which works
 * everywhere prose is written where it is shown. It does not work for Mistvale's string
 * *tables* — the screen registry, the combat tips, the reward names — where the sentence is
 * data and the call site says `text(screen.label)`. Those are reachable at runtime and
 * invisible to extraction, which would leave sixty-eight of the game's most-read strings
 * out of every translator's file with nothing saying so.
 *
 * So the tables are named. It is a closed list rather than a heuristic for the reason every
 * closed list in this repo is one: a heuristic that mines "string properties of object
 * literals" would pull in every css class, icon id and content key in the client, and a
 * catalogue full of `nav-arena` is a catalogue nobody reads.
 *
 * Adding a table is one entry here. Getting it wrong is visible immediately — the extracted
 * strings are printed and land in the template, where a key that is not a sentence stands
 * out.
 */

export interface TextTable {
  /** Repo-relative path. */
  file: string;
  /** Object properties whose string values are prose a player reads. */
  fields: readonly string[];
}

export const TEXT_TABLES: readonly TextTable[] = [
  {
    // The navigation, and the sentence each place shows about itself. Read by the dock, the
    // Haven's rail and every hub card — the three places C39 converted.
    file: 'apps/client/src/app/screens.ts',
    fields: ['label', 'blurb', 'lockedHint'],
  },
  {
    // What each unlock is called when its banner lands.
    file: 'apps/client/src/app/unlocks.ts',
    fields: ['title'],
  },
];

/**
 * Pulls the named fields out of a table file.
 *
 * Only string *literals* — a computed value is not something a translator can be handed, and
 * a table that computes its prose is a table that needs a `t()` at the point it is built.
 */
export function extractTable(table: TextTable, code: string): string[] {
  const source = ts.createSourceFile(
    table.file,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const wanted = new Set(table.fields);
  const found: string[] = [];

  const walk = (node: ts.Node): void => {
    if (ts.isPropertyAssignment(node)) {
      const name = ts.isIdentifier(node.name)
        ? node.name.text
        : ts.isStringLiteral(node.name)
          ? node.name.text
          : null;
      if (name && wanted.has(name) && ts.isStringLiteral(node.initializer)) {
        found.push(node.initializer.text);
      }
    }
    ts.forEachChild(node, walk);
  };
  walk(source);

  return found;
}
