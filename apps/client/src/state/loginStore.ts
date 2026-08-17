import { create } from 'zustand';
import type { GearInstance, LoginTrackKind, LoginView } from '@mistvale/shared';
import { gameApi } from '../api/game';
import { usePlayerStore } from './playerStore';

/**
 * The login calendar, as the client holds it.
 *
 * A claim can hand over a champion or six relics, so the last one is kept around until the
 * screen has shown it — a tile that silently flips to "claimed" would be the game taking
 * the best moment it has and giving it away as a toast.
 */

export interface LoginPayout {
  day: number;
  paid: Record<string, number>;
  champions: string[];
  relics: GearInstance[];
}

interface LoginStoreState {
  login: LoginView | null;
  loading: boolean;
  /** The track a claim is in flight for. */
  busy: LoginTrackKind | null;
  error: string | null;
  lastPayout: LoginPayout | null;

  load: () => Promise<void>;
  claim: (track: LoginTrackKind, choice?: string) => Promise<void>;
  clearPayout: () => void;
  reset: () => void;
}

const message = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export const useLoginStore = create<LoginStoreState>((set) => ({
  login: null,
  loading: false,
  busy: null,
  error: null,
  lastPayout: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ login: await gameApi.login(), loading: false });
    } catch (error) {
      set({ loading: false, error: message(error, 'Could not read the calendar.') });
    }
  },

  async claim(track, choice) {
    set({ busy: track, error: null });
    try {
      const result = await gameApi.claimLoginDay(track, crypto.randomUUID(), choice);
      set({
        login: result.login,
        busy: null,
        lastPayout: {
          day: result.day,
          paid: result.paid,
          champions: result.champions,
          relics: result.relics,
        },
      });
      await usePlayerStore.getState().refresh();
    } catch (error) {
      set({ busy: null, error: message(error, 'That day could not be collected.') });
    }
  },

  clearPayout() {
    set({ lastPayout: null });
  },

  reset() {
    set({ login: null, loading: false, busy: null, error: null, lastPayout: null });
  },
}));
