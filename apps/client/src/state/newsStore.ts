import { create } from 'zustand';
import type { NewsView } from '@mistvale/shared';
import { gameApi } from '../api/game';

/**
 * The news feed.
 *
 * Read once and kept: posts are content with a window, so they change on a publish rather
 * than on anything the player does. Re-fetching on every open would be a request per visit
 * to answer a question whose answer did not move.
 */

interface NewsStoreState {
  news: NewsView | null;
  loading: boolean;
  error: string | null;

  load: (force?: boolean) => Promise<void>;
  reset: () => void;
}

export const useNewsStore = create<NewsStoreState>((set, get) => ({
  news: null,
  loading: false,
  error: null,

  async load(force = false) {
    if (!force && (get().news || get().loading)) return;
    set({ loading: true, error: null });
    try {
      set({ news: await gameApi.news(), loading: false });
    } catch (error) {
      set({
        loading: false,
        error: error instanceof Error && error.message ? error.message : 'No word from the Vale.',
      });
    }
  },

  reset() {
    set({ news: null, loading: false, error: null });
  },
}));
