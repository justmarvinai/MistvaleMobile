import { create } from 'zustand';
import { NO_WORLD_BOSS, type WorldBossView } from '@mistvale/shared';
import { gameApi, newActionId } from '../api/game';

/**
 * The wake, as the screen knows it.
 *
 * The one store in the game holding a number that is not this account's. Everything here is
 * re-read rather than remembered: the bar moves while nobody is looking, so a cached copy
 * of it is a copy that is wrong by the time it is drawn.
 */

interface WorldBossStoreState {
  view: WorldBossView;
  loading: boolean;
  loaded: boolean;
  error: string | null;

  load: () => Promise<void>;
  claimTier: (dungeonKey: string, tierKey: string) => Promise<Record<string, number>>;
  claimSpoils: (dungeonKey: string) => Promise<Record<string, number>>;
  reset: () => void;
}

export const useWorldBossStore = create<WorldBossStoreState>((set) => ({
  view: NO_WORLD_BOSS,
  loading: false,
  loaded: false,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ view: await gameApi.worldBoss(), loading: false, loaded: true });
    } catch (cause) {
      set({
        loading: false,
        loaded: true,
        error: cause instanceof Error ? cause.message : 'The wake could not be read.',
      });
    }
  },

  async claimTier(dungeonKey, tierKey) {
    // The mutation answers with the whole view, so there is no second read and no window
    // where the screen shows a rung as unclaimed that has just been paid.
    const result = await gameApi.claimWorldBossTier(dungeonKey, tierKey, newActionId());
    set({ view: result.worldBoss });
    return result.rewards;
  },

  async claimSpoils(dungeonKey) {
    const result = await gameApi.claimWorldBossSpoils(dungeonKey, newActionId());
    set({ view: result.worldBoss });
    return result.rewards;
  },

  reset() {
    set({ view: NO_WORLD_BOSS, loading: false, loaded: false, error: null });
  },
}));
