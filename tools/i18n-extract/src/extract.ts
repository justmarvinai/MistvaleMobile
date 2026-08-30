import ts from 'typescript';

/**
 * Finding the strings the game says.
 *
 * Two questions, and the second one is why this exists. **What is already reachable** — the
 * literal arguments to `t()` and to a `useText()` binding — is the catalogue a translator
 * fills in. **What is not** is every other user-visible string still written into a
 * component, and that number is the one nobody knows: the roadmap's claim that "retrofitting
 * is strictly more expensive per screen added" is only checkable if somebody counts.
 *
 * It parses rather than greps, because the alternative cannot tell the difference between a
 * sentence and a CSS class. `ts.createSourceFile` costs nothing here — the client is ninety
 * files — and it gives the one thing a regex cannot: the *syntactic position* of a string,
 * which is what says whether a player ever reads it.
 */

/** A string the game can already show in another language. */
export interface Reachable {
  source: string;
  file: string;
  line: number;
}

/** A string a player reads that no catalogue can reach yet. */
export interface Unreachable {
  text: string;
  file: string;
  line: number;
  /** Where it sits — JSX text, an attribute, or an argument to a known text prop. */
  kind: 'jsx-text' | 'jsx-attribute';
  /** The attribute, for an attribute. */
  attribute?: string;
}

export interface Extraction {
  reachable: Reachable[];
  unreachable: Unreachable[];
  /** Calls to `t()`/`useText()` whose argument is not a literal, so nothing can extract it. */
  dynamic: { file: string; line: number }[];
}

/**
 * JSX attributes a player reads.
 *
 * A closed list rather than a heuristic, and short on purpose: every entry is an attribute
 * whose value is *always* prose. `title` and `aria-label` are the two that matter most,
 * because they are the strings least likely to be noticed as untranslated — nobody sees a
 * tooltip until they hover one.
 */
const TEXT_ATTRIBUTES = new Set([
  'title',
  'label',
  'aria-label',
  'placeholder',
  'tagline',
  'message',
  'hint',
  'blurb',
  'subtitle',
  'doneText',
  'lockedHint',
]);

/**
 * Whether a bare string is something a player reads.
 *
 * The hard part of the count, and it is tuned to **under**-report rather than over-report: a
 * false positive turns the number into noise nobody acts on, while a false negative only
 * makes the estimate conservative, which is the safe direction for a figure whose whole job
 * is to say "this is how much work a second language would be".
 *
 * So a string has to look like a sentence or a phrase: long enough to be one, not shaped
 * like an address, and — if it is a single token — capitalised, which is what separates
 * `Roster` from `nav-arena`.
 */
export function readsLikeProse(value: string): boolean {
  const text = value.trim();
  if (text.length < 3) return false;

  // Addresses by shape: urls, paths, css custom properties, anchors.
  if (/^(https?:|data:|#|--|\/)/.test(text)) return false;
  if (/^[\w-]+[/.][\w./-]*$/.test(text)) return false;
  // Numbers and the punctuation around them — `1,200`, `×4`, `0.42`.
  if (/^[\d\s.,:%×+-]+$/.test(text)) return false;

  /*
   * A **single token that does not start with a capital** is an identifier: `damage`,
   * `nav-arena`, `slotName`, `xpBoost`. A single token that does is a word somebody reads:
   * `Roster`, `Enter`, `Shrouded`.
   *
   * This is the line the classifier turns on, and the first cut had it wrong in the
   * direction that matters least and hurts most — it refused every one-word label in the
   * game, which is most of the navigation. Under-reporting is the safe direction for the
   * *count*, and it is the wrong direction for the *catalogue*: a label left out is a
   * sentence stuck in English forever.
   */
  if (!text.includes(' ') && !/^[A-Z]/.test(text)) return false;

  return true;
}

/** Is this call `t(...)`, or a call to something bound from `useText()`? */
function isTextCall(node: ts.CallExpression, textBindings: ReadonlySet<string>): boolean {
  const callee = node.expression;
  if (ts.isIdentifier(callee)) return callee.text === 't' || textBindings.has(callee.text);
  return false;
}

/**
 * Pulls both halves out of one file.
 *
 * `useText()` is assigned to a local — `const text = useText()` — so the names bound to it
 * are collected first and the call scan then treats them like `t`. Without that, every
 * screen converted through the hook would read as unreachable, which is the opposite of
 * the truth and exactly the kind of measurement error that makes a report useless.
 */
export function extractFile(file: string, code: string): Extraction {
  const source = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const reachable: Reachable[] = [];
  const unreachable: Unreachable[] = [];
  const dynamic: { file: string; line: number }[] = [];
  const textBindings = new Set<string>();

  const lineOf = (node: ts.Node): number =>
    source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1;

  // First pass: what is bound to `useText()`.
  const bind = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer &&
      ts.isCallExpression(node.initializer) &&
      ts.isIdentifier(node.initializer.expression) &&
      node.initializer.expression.text === 'useText'
    ) {
      textBindings.add(node.name.text);
    }
    ts.forEachChild(node, bind);
  };
  bind(source);

  const walk = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && isTextCall(node, textBindings)) {
      const first = node.arguments[0];
      if (first && ts.isStringLiteral(first)) {
        reachable.push({ source: first.text, file, line: lineOf(node) });
      } else if (first && ts.isNoSubstitutionTemplateLiteral(first)) {
        reachable.push({ source: first.text, file, line: lineOf(node) });
      } else if (first) {
        // A variable, a template with holes, a ternary. Reachable at runtime by whatever it
        // resolves to, and invisible to extraction — worth reporting rather than dropping,
        // because a catalogue with a hole in it is how one sentence stays English forever.
        dynamic.push({ file, line: lineOf(node) });
      }
      // Do not descend: a string inside a `t()` is accounted for.
      return;
    }

    if (ts.isJsxText(node)) {
      const text = node.text.trim();
      if (readsLikeProse(text)) {
        unreachable.push({ text, file, line: lineOf(node), kind: 'jsx-text' });
      }
    }

    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      const name = node.name.text;
      const value = node.initializer;
      if (TEXT_ATTRIBUTES.has(name) && value && ts.isStringLiteral(value)) {
        if (readsLikeProse(value.text)) {
          unreachable.push({
            text: value.text,
            file,
            line: lineOf(node),
            kind: 'jsx-attribute',
            attribute: name,
          });
        }
      }
    }

    ts.forEachChild(node, walk);
  };
  walk(source);

  return { reachable, unreachable, dynamic };
}

/** Everything, from many files, with the reachable strings de-duplicated by their text. */
export function merge(parts: readonly Extraction[]): Extraction {
  const reachable = new Map<string, Reachable>();
  const unreachable: Unreachable[] = [];
  const dynamic: { file: string; line: number }[] = [];
  for (const part of parts) {
    for (const entry of part.reachable) {
      // First occurrence wins the file and line, so a report points somewhere stable.
      if (!reachable.has(entry.source)) reachable.set(entry.source, entry);
    }
    unreachable.push(...part.unreachable);
    dynamic.push(...part.dynamic);
  }
  return {
    reachable: [...reachable.values()].sort((a, b) => a.source.localeCompare(b.source)),
    unreachable,
    dynamic,
  };
}
