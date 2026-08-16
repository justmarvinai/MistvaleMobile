import { create } from 'zustand';
import type { ScreenId } from '../app/screens';

/**
 * Which screen is showing.
 *
 * Lifted out of the shell because navigation is no longer only the dock's business: a
 * fight starts from team select and ends on the results panel, and both need to move the
 * player without threading callbacks through every screen in between.
 */

interface NavState {
  screen: ScreenId;
  /** Where "back" goes from a full-screen takeover like the battle. */
  previous: ScreenId;
  setScreen: (screen: ScreenId) => void;
  back: () => void;
}

export const useNavStore = create<NavState>((set, get) => ({
  screen: 'haven',
  previous: 'haven',
  setScreen(screen) {
    if (screen === get().screen) return;
    set({ screen, previous: get().screen });
  },
  back() {
    set({ screen: get().previous, previous: 'haven' });
  },
}));
