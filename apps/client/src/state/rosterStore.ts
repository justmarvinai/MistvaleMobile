import { create } from 'zustand';
import { gameApi, type RosterChampion, type StarterChoice } from '../api/game';

/**
 * The champions the player owns.
 *
 * Cached because the roster is read on nearly every screen and changes rarely; every
 * mutation re-fetches rather than patching locally, so the server stays the truth.
 */

interface RosterState {
  champions: RosterChampion[];
  starters: StarterChoice[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  loadStarters: () => Promise<void>;
  chooseStarter: (championKey: string) => Promise<void>;
  reset: () => void;
}

export const useRosterStore = create<RosterState>((set) => ({
  champions: [],
  starters: [],
  loading: false,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ champions: await gameApi.roster(), loading: false });
    } catch (cause) {
      set({
        loading: false,
        error: cause instanceof Error ? cause.message : 'Roster unavailable.',
      });
    }
  },

  async loadStarters() {
    try {
      set({ starters: await gameApi.starters() });
    } catch {
      // The starter list is only offered when the roster is empty; a failure here just
      // means the prompt stays hidden rather than the Haven breaking.
      set({ starters: [] });
    }
  },

  async chooseStarter(championKey) {
    set({ loading: true, error: null });
    try {
      set({ champions: await gameApi.chooseStarter(championKey), loading: false });
    } catch (cause) {
      set({
        loading: false,
        error: cause instanceof Error ? cause.message : 'Could not claim that champion.',
      });
      throw cause;
    }
  },

  reset() {
    set({ champions: [], starters: [], loading: false, error: null });
  },
}));
