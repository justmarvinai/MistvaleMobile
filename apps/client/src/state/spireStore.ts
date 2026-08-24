import { create } from 'zustand';
import { NO_SPIRES, type SpireOverview, type SpireView } from '@mistvale/shared';
import { gameApi, newActionId } from '../api/game';

/**
 * The Mistspire, as the screen knows it.
 *
 * Read on mount rather than carried on the account snapshot, because a climb moves several
 * times an evening and the snapshot is fetched at boot. Claiming answers with the **whole
 * view** again, for the reason every other claim in the game does: collecting moves the
 * ladder and sometimes the account level, and patching one field client-side is how a
 * screen ends up one claim out of date.
 */

interface SpireStoreState {
  overview: SpireOverview;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** What the last landing paid, held until the player dismisses it. */
  collected: { name: string; rewards: Record<string, number> } | null;

  load: () => Promise<void>;
  claim: (dungeonKey: string, landingKey: string, name: string) => Promise<void>;
  dismiss: () => void;
  reset: () => void;
}

/** The one tower, or null while nothing is published. */
export function firstSpire(overview: SpireOverview): SpireView | null {
  return overview.spires[0] ?? null;
}

export const useSpireStore = create<SpireStoreState>((set) => ({
  overview: NO_SPIRES,
  loading: false,
  loaded: false,
  error: null,
  collected: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ overview: await gameApi.spire(), loading: false, loaded: true });
    } catch (cause) {
      set({
        loading: false,
        loaded: true,
        error: cause instanceof Error ? cause.message : 'The Mistspire could not be read.',
      });
    }
  },

  async claim(dungeonKey, landingKey, name) {
    const result = await gameApi.claimSpireLanding(dungeonKey, landingKey, newActionId());
    set({ overview: result.spire, collected: { name, rewards: result.rewards } });
  },

  dismiss() {
    set({ collected: null });
  },

  reset() {
    set({ overview: NO_SPIRES, loading: false, loaded: false, error: null, collected: null });
  },
}));
