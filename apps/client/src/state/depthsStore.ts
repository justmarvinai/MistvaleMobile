import { create } from 'zustand';
import type { Depths, DungeonStanding } from '@mistvale/shared';
import { gameApi } from '../api/game';

/**
 * The Depths, as the hub knows them.
 *
 * Only the server can answer which keeps are open today — the rotation runs on the daily
 * reset in the operator's timezone, and a client clock would disagree with it twice a day.
 * Everything else on the hub comes out of the content bundle.
 */

interface DepthsState {
  today: string | null;
  weekday: number | null;
  graceUntil: string | null;
  dungeons: Map<string, DungeonStanding>;
  loading: boolean;

  load: () => Promise<void>;
  reset: () => void;
}

const empty = (): Pick<DepthsState, 'today' | 'weekday' | 'graceUntil' | 'dungeons'> => ({
  today: null,
  weekday: null,
  graceUntil: null,
  dungeons: new Map(),
});

export const useDepthsStore = create<DepthsState>((set) => ({
  ...empty(),
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const depths: Depths = await gameApi.depths();
      set({
        today: depths.today,
        weekday: depths.weekday,
        graceUntil: depths.graceUntil,
        dungeons: new Map(depths.dungeons.map((entry) => [entry.dungeonKey, entry])),
        loading: false,
      });
    } catch {
      // The hub still draws from content with no standings — every keep simply reads as
      // untouched, which is the honest fallback rather than an empty screen.
      set({ loading: false });
    }
  },

  reset() {
    set({ ...empty(), loading: false });
  },
}));
