/**
 * The catalogue template a translator starts from.
 *
 * JSON keyed by the English itself, with every value **empty**. Empty rather than a copy of
 * the key, and that is the one decision here worth arguing: a template pre-filled with
 * English looks finished, and a file where every line already says something is one nobody
 * can tell they have not translated. Empty is a to-do list.
 *
 * An empty value in a *published* catalogue is a different thing and is refused
 * (`catalogueProblems` in shared) — it renders as nothing, which reads as a screen that
 * failed to load. So the template is a starting point that must be filled before it becomes
 * a catalogue, and both ends of that are checked.
 */

export const CATALOGUE_TEMPLATE =
  'Copy it into src/i18n/catalogues.ts under a new locale, fill in every value, and add ' +
  'the locale to LOCALES in shared.';

/**
 * The template, rendered.
 *
 * Sorted, two-space JSON with a trailing newline — the same shape as every other generated
 * artifact in the repo, so `--check` compares text rather than parsing and a diff is
 * readable.
 */
export function renderTemplate(sources: readonly string[]): string {
  const sorted = [...new Set(sources)].sort((a, b) => a.localeCompare(b));
  const body = Object.fromEntries(sorted.map((source) => [source, '']));
  return `${JSON.stringify(body, null, 2)}\n`;
}

/**
 * What is wrong with a template file on disk.
 *
 * Only the shape, deliberately. Whether a *translation* is right is `catalogueProblems`'
 * job in shared and needs the strings actually in use; this is the narrower question of
 * whether the file somebody committed is still a template.
 */
export function templateProblems(contents: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(contents);
  } catch {
    return ['the template is not valid JSON.'];
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return ['the template should be a JSON object of source strings.'];
  }
  const problems: string[] = [];
  for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      problems.push(`"${key}" is not a string.`);
      continue;
    }
    if (value !== '') {
      // A filled-in template is a catalogue in the wrong place: it belongs in
      // `catalogues.ts`, where the code reads it, rather than in a generated file the next
      // extraction overwrites.
      problems.push(
        `"${key}" has a translation in it — the template is regenerated, so a translation ` +
          'here is lost on the next run. Put it in src/i18n/catalogues.ts.',
      );
    }
  }
  return problems;
}
