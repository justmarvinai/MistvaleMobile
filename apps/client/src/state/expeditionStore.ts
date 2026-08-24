import { create } from 'zustand';
import { NO_EXPEDITIONS, type ExpeditionState } from '@mistvale/shared';
import { gameApi, newActionId } from '../api/game';

/**
 * Expeditions, as the screens know them.
 *
 * Two things live here rather than on the screen, because two screens want them: the state
 * itself, and `awayChampionIds` — which every champion picker in the game reads so an away
 * champion is greyed rather than offered and then refused.
 *
 * Nothing here is a timer. The server decides whether a run is ready and says so on the
 * read; the screen re-reads rather than counting down against a clock a player can set.
 */

interface ExpeditionStoreState {
  state: ExpeditionState;
  loading: boolean;
  /** True once a load has finished, so an empty list can be told from a pending one. */
  loaded: boolean;
  error: string | null;

  load: () => Promise<void>;
  dispatch: (key: string, championIds: readonly string[]) => Promise<void>;
  claim: (id: string) => Promise<Record<string, number>>;
  recall: (id: string) => Promise<void>;
  reset: () => void;
}

export const useExpeditionStore = create<ExpeditionStoreState>((set) => ({
  state: NO_EXPEDITIONS,
  loading: false,
  loaded: false,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ state: await gameApi.expeditions(), loading: false, loaded: true });
    } catch (cause) {
      set({
        loading: false,
        loaded: true,
        error: cause instanceof Error ? cause.message : 'Expeditions could not be read.',
      });
    }
  },

  async dispatch(key, championIds) {
    // The mutation returns the whole state, so there is no second read and no window where
    // the screen shows a party that has already left.
    set({ state: await gameApi.dispatchExpedition(key, championIds, newActionId()) });
  },

  async claim(id) {
    const result = await gameApi.claimExpedition(id, newActionId());
    set({ state: result.state });
    return result.rewards;
  },

  async recall(id) {
    set({ state: await gameApi.recallExpedition(id) });
  },

  reset() {
    set({ state: NO_EXPEDITIONS, loading: false, loaded: false, error: null });
  },
}));
