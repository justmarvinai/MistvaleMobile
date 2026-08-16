import { create } from 'zustand';
import type { Progress, StageStanding } from '@mistvale/shared';
import { gameApi } from '../api/game';

/**
 * What the player has cleared.
 *
 * Read by every map, and re-read after every fight — a clear can open the next stage, add
 * a star and cross a chest tier, and all three change what the map should draw. The
 * `open` flag comes from the server, computed with the rule the battle route enforces, so
 * a greyed-out stage and a refused request are always the same stage.
 */

interface ProgressState {
  stages: Map<string, StageStanding>;
  parentStars: Record<string, number>;
  claimedChests: Record<string, number[]>;
  loading: boolean;

  load: () => Promise<void>;
  reset: () => void;
}

const empty = (): Pick<ProgressState, 'stages' | 'parentStars' | 'claimedChests'> => ({
  stages: new Map(),
  parentStars: {},
  claimedChests: {},
});

export const useProgressStore = create<ProgressState>((set) => ({
  ...empty(),
  loading: false,

  async load() {
    set({ loading: true });
    try {
      const progress: Progress = await gameApi.progress();
      set({
        stages: new Map(progress.stages.map((stage) => [stage.stageKey, stage])),
        parentStars: progress.parentStars,
        claimedChests: progress.claimedChests,
        loading: false,
      });
    } catch {
      // A map with no progress data still renders; it just shows nothing cleared, which
      // is the honest fallback rather than a blank screen.
      set({ loading: false });
    }
  },

  reset() {
    set({ ...empty(), loading: false });
  },
}));
