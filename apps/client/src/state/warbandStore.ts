import { create } from 'zustand';
import type { Warband } from '@mistvale/shared';
import { gameApi } from '../api/game';

/**
 * Wardens, as the screens know them (C37).
 *
 * Two screens read it: the Wardens screen itself, and the team chooser, which needs to
 * know who may be borrowed from and whether there is a borrow left today. Keeping it in a
 * store rather than fetching in both is what stops the lineup offering a borrow the server
 * has already spent.
 *
 * Nothing here is a timer. The allowance resets on the game-day and the server says what
 * is left; a client counting down against a clock a player can set would offer a fifth
 * champion that is refused the moment it is pressed.
 */

const EMPTY: Warband = {
  wardens: [],
  capacity: 0,
  borrowsLeft: 0,
  borrowsPerDay: 0,
  standardBearerId: null,
  lends: 0,
};

interface WarbandStoreState {
  warband: Warband;
  loading: boolean;
  /** True once a load has finished, so an empty list can be told from a pending one. */
  loaded: boolean;
  error: string | null;

  load: () => Promise<void>;
  keep: (profileName: string) => Promise<void>;
  release: (playerId: string) => Promise<void>;
  nominate: (championId: string | null) => Promise<void>;
  reset: () => void;
}

export const useWarbandStore = create<WarbandStoreState>((set, get) => ({
  warband: EMPTY,
  loading: false,
  loaded: false,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ warband: await gameApi.warband(), loading: false, loaded: true });
    } catch (cause) {
      set({
        loading: false,
        loaded: true,
        error: cause instanceof Error ? cause.message : 'Your wardens could not be read.',
      });
    }
  },

  async keep(profileName) {
    // The mutation answers with the one warden; the list is re-read rather than spliced,
    // because the cap and the standard-bearer come with it and a spliced list would be
    // right about the row and wrong about everything around it.
    await gameApi.keepWarden(profileName);
    await get().load();
  },

  async release(playerId) {
    await gameApi.releaseWarden(playerId);
    await get().load();
  },

  async nominate(championId) {
    set({ warband: await gameApi.setStandardBearer(championId), loaded: true });
  },

  reset() {
    set({ warband: EMPTY, loading: false, loaded: false, error: null });
  },
}));
