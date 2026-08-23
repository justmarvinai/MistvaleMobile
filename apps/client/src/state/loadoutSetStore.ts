import { create } from 'zustand';
import type { Loadout } from '@mistvale/shared';
import { gameApi, newActionId } from '../api/game';

/**
 * Saved relic sets.
 *
 * Named `loadoutSetStore` because `loadoutStore` already exists and means something else —
 * the *team* a player last sent into each battle mode (B2). Two things called a loadout in
 * one game is a decision the design made, not one this file gets to unpick; what it can do
 * is not pretend they are the same store.
 *
 * The list is small and changes rarely, so it is fetched once per screen that needs it and
 * re-read after every write — the house rule (server is truth, no optimistic updates).
 */

interface LoadoutSetState {
  loadouts: Loadout[];
  loading: boolean;
  loaded: boolean;

  load: () => Promise<void>;
  save: (name: string, championId: string) => Promise<Loadout>;
  rename: (id: string, name: string) => Promise<void>;
  forget: (id: string) => Promise<void>;
  /** Puts a set on a champion. The caller re-reads the relics it moved. */
  apply: (
    id: string,
    championId: string,
  ) => Promise<Awaited<ReturnType<typeof gameApi.applyLoadout>>>;
  reset: () => void;
}

export const useLoadoutSetStore = create<LoadoutSetState>((set, get) => ({
  loadouts: [],
  loading: false,
  loaded: false,

  async load() {
    set({ loading: true });
    try {
      set({ loadouts: await gameApi.loadouts(), loading: false, loaded: true });
    } catch {
      // An empty list and a list that failed to load look the same on screen, so the
      // screen says "none saved" either way rather than showing a spinner forever.
      set({ loading: false, loaded: true });
    }
  },

  async save(name, championId) {
    const loadout = await gameApi.saveLoadout(name, championId);
    await get().load();
    return loadout;
  },

  async rename(id, name) {
    await gameApi.renameLoadout(id, name);
    await get().load();
  },

  async forget(id) {
    await gameApi.deleteLoadout(id);
    await get().load();
  },

  async apply(id, championId) {
    const result = await gameApi.applyLoadout(id, championId, newActionId());
    await get().load();
    return result;
  },

  reset() {
    set({ loadouts: [], loading: false, loaded: false });
  },
}));
