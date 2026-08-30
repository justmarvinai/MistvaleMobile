import type { Catalogue, Locale } from '@mistvale/shared';

/**
 * Every locale's strings, keyed by the English they replace.
 *
 * **English is empty, and that is correct rather than unfinished.** Strings are looked up by
 * their own source text (`shared/i18n.ts`), so an English catalogue would be a file mapping
 * every sentence in the game to itself — a second copy to keep in step with the first, whose
 * only possible contribution is drift.
 *
 * A second language is one entry here plus `LOCALES` in shared. `pnpm i18n` writes the
 * template to fill in, and `pnpm i18n --check` refuses a catalogue that has gone stale
 * against the code.
 */
export const CATALOGUES: Readonly<Record<Locale, Catalogue>> = Object.freeze({
  en: {},
});
