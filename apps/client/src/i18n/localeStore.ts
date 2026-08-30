import { create } from 'zustand';
import { DEFAULT_LOCALE, isLocale, pickLocale, type Locale } from '@mistvale/shared';

/**
 * Which language the game is in.
 *
 * Read from the browser's own preference list on first run and remembered after that, so a
 * player who chooses one is not overruled by a machine they signed in on. It is deliberately
 * **not** on the account: a language is a property of the device somebody is reading on, and
 * a warden who plays on a shared computer in one country and a phone in another wants two
 * different answers.
 *
 * With one locale published nothing here has anything to choose between — which is the point
 * of building it now. The screen that offers the choice is a settings row the day `LOCALES`
 * has two entries, and nothing else has to change.
 */

const STORAGE_KEY = 'mv.locale';

function remembered(): Locale | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && isLocale(stored) ? stored : null;
  } catch {
    // A browser with storage blocked is a browser that gets the default, not an error.
    return null;
  }
}

function preferred(): Locale {
  try {
    return pickLocale(navigator.languages ?? [navigator.language ?? '']);
  } catch {
    return DEFAULT_LOCALE;
  }
}

interface LocaleStoreState {
  locale: Locale;
  setLocale: (locale: Locale) => void;
}

export const useLocaleStore = create<LocaleStoreState>((set) => ({
  locale: remembered() ?? preferred(),

  setLocale(locale) {
    try {
      window.localStorage.setItem(STORAGE_KEY, locale);
    } catch {
      // Remembering is a convenience; failing to remember must not fail the change.
    }
    set({ locale });
  },
}));
