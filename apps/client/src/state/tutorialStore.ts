import { create } from 'zustand';
import type { GearInstance, TutorialView } from '@mistvale/shared';
import { gameApi, newActionId } from '../api/game';
import { usePlayerStore } from './playerStore';

/**
 * The tutorial, as the client holds it.
 *
 * One step at a time, and the server decides which — the store never advances the cursor
 * itself, because the step a player is on is the sort of thing that has to survive a
 * refresh, a second tab and a phone going to sleep mid-fight.
 *
 * `refresh` is the important verb. A step's goal is completed by *doing the thing* — a
 * battle won, a relic equipped — and the server learns about that from the module that
 * did it, not from the overlay. So the overlay re-reads after anything a step might have
 * been waiting for, and the Continue button lights up when the server says it may.
 */

export interface TutorialPayout {
  paid: Record<string, number>;
  relics: GearInstance[];
}

interface TutorialState {
  tutorial: TutorialView | null;
  loading: boolean;
  busy: boolean;
  error: string | null;
  /** What the last completed step handed over, held until the overlay has shown it. */
  lastPayout: TutorialPayout | null;

  load: () => Promise<void>;
  /** Re-reads without the loading flag, so a poll never blanks the parchment. */
  refresh: () => Promise<void>;
  advance: () => Promise<void>;
  skip: () => Promise<void>;
  clearPayout: () => void;
  reset: () => void;
}

const message = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

const empty = {
  tutorial: null,
  loading: false,
  busy: false,
  error: null,
  lastPayout: null,
} as const;

export const useTutorialStore = create<TutorialState>((set, get) => ({
  ...empty,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ tutorial: await gameApi.tutorial(), loading: false });
    } catch (error) {
      set({ loading: false, error: message(error, 'Could not reach the Wardenmaster.') });
    }
  },

  async refresh() {
    // Deliberately silent: this runs after other screens act, and a failure here must not
    // put an error banner over a summon the player is watching.
    try {
      set({ tutorial: await gameApi.tutorial() });
    } catch {
      /* the next refresh will do */
    }
  },

  async advance() {
    if (get().busy) return;
    set({ busy: true, error: null });
    try {
      const result = await gameApi.advanceTutorial(newActionId());
      set({
        tutorial: result.tutorial,
        busy: false,
        // Only worth showing when something actually changed hands. A beat that pays
        // nothing should move straight on rather than open an empty reward card.
        lastPayout:
          Object.keys(result.paid).length > 0 || result.relics.length > 0
            ? { paid: result.paid, relics: result.relics }
            : null,
      });
      // Steps pay silver, crystals and account XP; the top bar is showing all three.
      await usePlayerStore.getState().refresh();
    } catch (error) {
      set({ busy: false, error: message(error, 'That step would not close.') });
    }
  },

  async skip() {
    if (get().busy) return;
    set({ busy: true, error: null });
    try {
      set({ tutorial: await gameApi.skipTutorial(), busy: false, lastPayout: null });
    } catch (error) {
      set({ busy: false, error: message(error, 'Could not leave the tutorial.') });
    }
  },

  clearPayout() {
    set({ lastPayout: null });
  },

  reset() {
    set({ ...empty });
  },
}));

/** The step in front of the player, or null when the script is done, skipped or unread. */
export const currentStep = (state: TutorialState) =>
  state.tutorial?.skipped || state.tutorial?.finished ? null : (state.tutorial?.current ?? null);
