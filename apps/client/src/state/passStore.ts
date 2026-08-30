import { create } from 'zustand';
import type { ValePassTrack, ValePassView } from '@mistvale/shared';
import { gameApi } from '../api/game';
import { usePlayerStore } from './playerStore';

/**
 * The Vale Pass, as the client holds it (C38).
 *
 * Replaced wholesale after a claim or a purchase, like every other meta screen: collecting
 * a tier can level the account, and taking up the track opens a whole column — neither is
 * something to splice into a copy of the old view and hope the rest still agrees.
 */

interface PassStoreState {
  pass: ValePassView | null;
  loading: boolean;
  /** `passKey:track:tier` while a claim is in flight, or `passKey:unlock`. */
  busy: string | null;
  error: string | null;
  lastPaid: Record<string, number> | null;

  load: () => Promise<void>;
  claim: (passKey: string, tier: number, track: ValePassTrack) => Promise<void>;
  unlock: (passKey: string) => Promise<void>;
  clearPaid: () => void;
  reset: () => void;
}

const message = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export const usePassStore = create<PassStoreState>((set) => ({
  pass: null,
  loading: false,
  busy: null,
  error: null,
  lastPaid: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ pass: await gameApi.valePass(), loading: false });
    } catch (error) {
      set({ loading: false, error: message(error, 'Could not read the season.') });
    }
  },

  async claim(passKey, tier, track) {
    set({ busy: `${passKey}:${track}:${tier}`, error: null });
    try {
      const result = await gameApi.claimPassTier(passKey, tier, track, crypto.randomUUID());
      set({ pass: result.pass, busy: null, lastPaid: result.paid });
      await usePlayerStore.getState().refresh();
    } catch (error) {
      set({ busy: null, error: message(error, 'That could not be collected.') });
    }
  },

  async unlock(passKey) {
    set({ busy: `${passKey}:unlock`, error: null });
    try {
      const result = await gameApi.unlockPass(passKey, crypto.randomUUID());
      // Deliberately no `lastPaid`: the purchase pays nothing out, and a reward toast on it
      // would claim otherwise. The crystals leaving is the top bar's job to show.
      set({ pass: result.pass, busy: null });
      await usePlayerStore.getState().refresh();
    } catch (error) {
      set({ busy: null, error: message(error, 'The track could not be taken up.') });
    }
  },

  clearPaid() {
    set({ lastPaid: null });
  },

  reset() {
    set({ pass: null, loading: false, busy: null, error: null, lastPaid: null });
  },
}));
