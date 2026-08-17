import { create } from 'zustand';
import type { MissionsView } from '@mistvale/shared';
import { gameApi } from '../api/game';
import { usePlayerStore } from './playerStore';
import { useRosterStore } from './rosterStore';

/**
 * The Valewarden's Path, as the client holds it.
 *
 * One object for the whole chain, replaced wholesale after every claim — the server
 * answers a claim with the whole screen, and a locally patched arc would be wrong the
 * moment claiming the eighth step opens the ninth arc.
 */

export interface MissionReward {
  paid: Record<string, number>;
  champions: string[];
  title: string | null;
  arcCompleted: boolean;
}

interface MissionStoreState {
  missions: MissionsView | null;
  loading: boolean;
  busy: string | null;
  error: string | null;
  /** The last claim's payout, for the celebration. Cleared once shown. */
  lastClaim: MissionReward | null;

  load: () => Promise<void>;
  claim: (missionKey: string) => Promise<void>;
  clearClaim: () => void;
  reset: () => void;
}

const message = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export const useMissionStore = create<MissionStoreState>((set) => ({
  missions: null,
  loading: false,
  busy: null,
  error: null,
  lastClaim: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ missions: await gameApi.missions(), loading: false });
    } catch (error) {
      set({ loading: false, error: message(error, 'Could not read the Path.') });
    }
  },

  async claim(missionKey) {
    set({ busy: missionKey, error: null });
    try {
      const result = await gameApi.claimMission(missionKey, crypto.randomUUID());
      set({
        missions: result.missions,
        busy: null,
        lastClaim: {
          paid: result.paid,
          champions: result.champions,
          title: result.title,
          arcCompleted: result.arcCompleted,
        },
      });
      // A claim moves the wallet, the badge and sometimes the level; a step that granted a
      // champion has changed the roster out from under whatever is showing it.
      await usePlayerStore.getState().refresh();
      if (result.champions.length > 0) await useRosterStore.getState().load();
    } catch (error) {
      set({ busy: null, error: message(error, 'That could not be claimed.') });
    }
  },

  clearClaim() {
    set({ lastClaim: null });
  },

  reset() {
    set({ missions: null, loading: false, busy: null, error: null, lastClaim: null });
  },
}));
