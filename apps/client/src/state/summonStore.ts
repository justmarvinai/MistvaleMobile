import { create } from 'zustand';
import type { SummonBanner, SummonResult } from '@mistvale/shared';
import { gameApi, newActionId } from '../api/game';

/**
 * The Mistgate.
 *
 * Holds the banners and the results of the pull being revealed. The reveal is presentation
 * only — every card in it was decided by the server before the first frame played, which
 * is the same split the battle screen and the forge use.
 */

interface SummonState {
  banners: SummonBanner[];
  loading: boolean;
  error: string | null;

  /** The pull being revealed, or an empty list when nothing is on screen. */
  revealing: SummonResult[];
  /** How many of `revealing` have been turned over. */
  revealed: number;
  pulling: boolean;

  load: () => Promise<void>;
  pull: (poolKey: string, count: 1 | 10) => Promise<void>;
  advanceReveal: () => void;
  revealAll: () => void;
  dismissReveal: () => void;
  reset: () => void;
}

export const useSummonStore = create<SummonState>((set, get) => ({
  banners: [],
  loading: false,
  error: null,
  revealing: [],
  revealed: 0,
  pulling: false,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ banners: await gameApi.banners(), loading: false });
    } catch (cause) {
      set({
        loading: false,
        error: cause instanceof Error ? cause.message : 'The gate will not open.',
      });
    }
  },

  async pull(poolKey, count) {
    if (get().pulling) return;
    set({ pulling: true, error: null, revealing: [], revealed: 0 });
    try {
      const response = await gameApi.summon(poolKey, count, newActionId());
      set((state) => ({
        // The banner comes back with the pull, so the odds panel updates without a
        // second round trip — and cannot briefly show pre-pull mercy.
        banners: state.banners.map((banner) =>
          banner.key === response.banner.key ? response.banner : banner,
        ),
        revealing: response.results,
        revealed: 0,
        pulling: false,
      }));
    } catch (cause) {
      set({
        pulling: false,
        error: cause instanceof Error ? cause.message : 'The mist did not answer.',
      });
      throw cause;
    }
  },

  advanceReveal() {
    set((state) => ({ revealed: Math.min(state.revealed + 1, state.revealing.length) }));
  },

  revealAll() {
    set((state) => ({ revealed: state.revealing.length }));
  },

  dismissReveal() {
    set({ revealing: [], revealed: 0 });
  },

  reset() {
    set({ banners: [], loading: false, error: null, revealing: [], revealed: 0, pulling: false });
  },
}));
