import { translate, type TextVars } from '@mistvale/shared';
import { CATALOGUES } from './catalogues';
import { useLocaleStore } from './localeStore';

/**
 * One string, in the language the game is set to.
 *
 * A plain function rather than a hook, deliberately. Most of Mistvale's chrome is not
 * written inside a component — the screen registry is a module-level array, `combatTips` is
 * a table, the reward names are a map — and a hook could not reach any of it. Reading the
 * store outside React is what Zustand's `getState` is for, and it is the same store the
 * hook below subscribes to, so the two can never disagree about the answer.
 *
 * Strings are keyed by their own English (`shared/i18n.ts`), so this reads as the sentence
 * it produces and an unconverted call site is indistinguishable from a converted one until
 * a second language exists.
 */
export function t(source: string, vars?: TextVars): string {
  return translate(CATALOGUES[useLocaleStore.getState().locale], source, vars);
}

/**
 * The same, for a component that must **re-render** when the language changes.
 *
 * `t` is right for anything read once — a registry entry, a table, a label computed at
 * module load. This is right inside a component, because a language change has to repaint
 * the screen rather than wait for the next unrelated state change to do it.
 */
export function useText(): (source: string, vars?: TextVars) => string {
  const locale = useLocaleStore((state) => state.locale);
  return (source, vars) => translate(CATALOGUES[locale], source, vars);
}
