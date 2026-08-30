/**
 * Localisation scaffolding (C39).
 *
 * Mistvale ships in one language and has no translator. What this is for is the roadmap's
 * own argument: *retrofitting is strictly more expensive per screen added, so if it is ever
 * wanted, earlier is cheaper.* Every screen written without a way to reach its strings is a
 * screen somebody has to go back through.
 *
 * ## Natural keys, and why
 *
 * A string is looked up by **its own English text** rather than by an invented id. The
 * alternative — `t('screen.roster.label')` with a catalogue saying `Roster` — is the shape
 * most projects reach for and it is the wrong one here, for three reasons that all bite
 * before a second language exists:
 *
 *  - **It cannot go stale.** A missing entry falls back to the source string, which is
 *    already correct English. An id-keyed catalogue with a missing entry shows the id, so
 *    every gap is a visible defect rather than an untranslated word.
 *  - **The code still reads.** `t('Roster')` is legible in a registry; `t('screen.roster')`
 *    is a lookup somebody has to perform in their head.
 *  - **Adoption is incremental and safe.** A screen that has not been converted looks
 *    exactly right, because the source *is* the English. Half-converted is a real state
 *    here rather than a broken one — which is what makes it possible to convert a screen
 *    at a time instead of all of them in one commit nobody can review.
 *
 * Its cost is honest and worth naming: two places with the same English and different
 * meanings share one entry, and a translator sees no context. Both are handled the way
 * gettext handles them — by disambiguating the source string itself ("Close" the verb
 * becomes "Close the dialog" if it ever collides), which keeps the catalogue keyed on
 * something a translator can read.
 *
 * ## What is deliberately not here
 *
 * **Content is not localised by this.** Champion names, kit text and stage briefs live in
 * PostgreSQL and are edited in Admin, so localising them is a *schema* decision — a locale
 * dimension on `content_entries`, or per-field maps — with a real migration behind it. It
 * is a decision for the owner rather than something to guess at, and it is open as **Q10**.
 * This layer covers the client's own chrome, which is the half where the retrofit cost the
 * roadmap names actually accrues.
 */

/**
 * Every locale the game can be set to.
 *
 * One entry, and that is the point: the list exists so a second one is an edit here rather
 * than a search through the client. Content and client both read it, so they cannot come to
 * disagree about what a locale is.
 */
export const LOCALES = ['en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

/** A locale's strings, keyed by the English they replace. */
export type Catalogue = Readonly<Record<string, string>>;

/** Values interpolated into a string's `{placeholders}`. */
export type TextVars = Readonly<Record<string, string | number>>;

/** Whether a string names a locale the game knows. */
export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

/**
 * The locale to use for a browser's own preference list.
 *
 * Matches on the language subtag rather than the whole tag, so `en-GB` and `en-US` both find
 * `en` — a player is not shown English twice because their browser is set to a region.
 */
export function pickLocale(preferences: readonly string[]): Locale {
  for (const preference of preferences) {
    const language = preference.toLowerCase().split('-')[0] ?? '';
    const found = LOCALES.find((locale) => locale === language);
    if (found) return found;
  }
  return DEFAULT_LOCALE;
}

/**
 * One string, in the active locale.
 *
 * Falls back to `source` whenever the catalogue has nothing — which is every string in
 * English, every string a translator has not reached yet, and every string added since the
 * last extraction. All three are the same case and all three are correct.
 */
export function translate(catalogue: Catalogue, source: string, vars?: TextVars): string {
  const template = catalogue[source] ?? source;
  return vars ? interpolate(template, vars) : template;
}

/**
 * Fills `{name}` placeholders.
 *
 * A placeholder with no value is **left as it is** rather than replaced with `undefined` or
 * an empty string. A sentence with a visible `{count}` in it is a bug somebody reports; one
 * that silently reads "You have  relics" is a bug nobody can describe.
 */
export function interpolate(template: string, vars: TextVars): string {
  return template.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * The `{placeholders}` a string uses, in the order they first appear.
 *
 * Exported because the extractor needs it: a translation whose placeholders do not match its
 * source is a sentence that will render with a stray `{name}` in it, and that is worth
 * refusing at build time rather than discovering in another language.
 */
export function placeholders(template: string): string[] {
  const found: string[] = [];
  for (const match of template.matchAll(/\{(\w+)\}/g)) {
    const name = match[1];
    if (name && !found.includes(name)) found.push(name);
  }
  return found;
}

/**
 * What is wrong with a catalogue, against the strings actually used.
 *
 * Three things go wrong with a translation file and none of them are visible by reading it:
 * an entry for a string nothing says any more, a translation that drops or invents a
 * placeholder, and an empty translation that renders as nothing at all. A missing entry is
 * deliberately **not** a problem — that is the fallback working.
 */
export interface CatalogueProblem {
  source: string;
  message: string;
}

export function catalogueProblems(
  catalogue: Catalogue,
  used: readonly string[],
): CatalogueProblem[] {
  const problems: CatalogueProblem[] = [];
  const inUse = new Set(used);

  for (const [source, translation] of Object.entries(catalogue)) {
    if (!inUse.has(source)) {
      problems.push({ source, message: 'Nothing says this any more.' });
      continue;
    }
    if (translation.trim() === '') {
      // Worse than missing: a missing entry falls back to English, an empty one renders as
      // nothing and looks like a screen that failed to load.
      problems.push({ source, message: 'The translation is empty, so it renders as nothing.' });
      continue;
    }
    const wanted = placeholders(source);
    const given = placeholders(translation);
    const missing = wanted.filter((name) => !given.includes(name));
    const extra = given.filter((name) => !wanted.includes(name));
    if (missing.length > 0) {
      problems.push({ source, message: `The translation drops {${missing.join('}, {')}}.` });
    }
    if (extra.length > 0) {
      problems.push({
        source,
        message: `The translation invents {${extra.join('}, {')}}, which will render literally.`,
      });
    }
  }

  return problems;
}
