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
  /**
   * Puts the player on a screen as if they had walked there from `from`.
   *
   * For the one case where they did not walk anywhere: the shell resuming a fight that was
   * still open when the browser closed. `setScreen` would record the Haven as the way back,
   * because that is where a reload lands — so the results panel's "Back to the campaign"
   * would deposit somebody on the Haven. The fight knows which room it belongs to; this is
   * how it says so.
   */
  enterFrom: (screen: ScreenId, from: ScreenId) => void;
  back: () => void;
}

export const useNavStore = create<NavState>((set, get) => ({
  screen: 'haven',
  previous: 'haven',
  setScreen(screen) {
    if (screen === get().screen) return;
    set({ screen, previous: get().screen });
  },
  enterFrom(screen, from) {
    set({ screen, previous: from });
  },
  back() {
    set({ screen: get().previous, previous: 'haven' });
  },
}));
