import { create } from 'zustand';
import type { Titan, TitanStanding } from '@mistvale/shared';
import { gameApi } from '../api/game';

/**
 * The Titan, as the screen knows it.
 *
 * Three things here cannot be worked out client-side and so are all the server's: how many
 * keys are left today (the day rolls over on the operator's reset hour, not the browser's
 * midnight), what this account's best run was, and which rungs that best has reached. The
 * Titan's name, its ladder and what each rung pays come from the content bundle, so a
 * second Titan published in Admin appears here with no client change.
 */

interface TitanState {
  today: string | null;
  titans: TitanStanding[];
  loading: boolean;
  /** True once a load has finished, so an empty list can be told from a pending one. */
  loaded: boolean;

  load: () => Promise<void>;
  reset: () => void;
}

const empty = (): Pick<TitanState, 'today' | 'titans' | 'loaded'> => ({
  today: null,
  titans: [],
  loaded: false,
});

export const useTitanStore = create<TitanState>((set) => ({
  ...empty(),
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const titan: Titan = await gameApi.titan();
      set({ today: titan.today, titans: titan.titans, loading: false, loaded: true });
    } catch {
      // A screen that cannot reach the server says so through its empty state rather than
      // drawing a Titan with no keys and no record, which reads as "you have used them".
      set({ loading: false, loaded: true });
    }
  },

  reset() {
    set({ ...empty(), loading: false });
  },
}));
