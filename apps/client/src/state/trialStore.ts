import { create } from 'zustand';
import { NO_TRIALS, type TrialsOverview } from '@mistvale/shared';
import { gameApi } from '../api/game';

/**
 * The trials, as the screen knows them.
 *
 * A read and nothing else: a trial is fought through the ordinary battle store, so there is
 * no mutation here to own. What the store is for is the *re-read* — a fight unmounts the
 * screen, and the number the player came back to look at is the one the fight just changed.
 */

interface TrialStoreState {
  trials: TrialsOverview;
  loading: boolean;
  /** True once a load has finished, so "no trials published" can be told from "not yet". */
  loaded: boolean;
  error: string | null;

  load: () => Promise<void>;
  reset: () => void;
}

export const useTrialStore = create<TrialStoreState>((set) => ({
  trials: NO_TRIALS,
  loading: false,
  loaded: false,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ trials: await gameApi.trials(), loading: false, loaded: true });
    } catch (cause) {
      set({
        loading: false,
        loaded: true,
        error: cause instanceof Error ? cause.message : 'The trials could not be read.',
      });
    }
  },

  reset() {
    set({ trials: NO_TRIALS, loading: false, loaded: false, error: null });
  },
}));
