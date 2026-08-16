import { create } from 'zustand';
import type { GearInstance, InventoryItem } from '@mistvale/shared';
import { gameApi } from '../api/game';

/**
 * Relics and stackables.
 *
 * Held here rather than per-screen because the champion screen, the relic inventory and
 * the forge all read the same list, and a relic equipped on one screen has to disappear
 * from the "unequipped" filter on another. Every mutation re-fetches instead of patching
 * locally — the server is the truth, and a stale relic is a stat lie.
 */

interface InventoryState {
  gear: GearInstance[];
  items: InventoryItem[];
  loading: boolean;
  error: string | null;

  load: () => Promise<void>;
  /** After an equip, sell or upgrade elsewhere. */
  refresh: () => Promise<void>;
  setLocked: (gearId: string, locked: boolean) => Promise<void>;
  reset: () => void;
}

export const useInventoryStore = create<InventoryState>((set, get) => ({
  gear: [],
  items: [],
  loading: false,
  error: null,

  async load() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const [gear, items] = await Promise.all([gameApi.gear(), gameApi.items()]);
      set({ gear, items, loading: false });
    } catch (cause) {
      set({
        loading: false,
        error: cause instanceof Error ? cause.message : 'Your things could not be loaded.',
      });
    }
  },

  async refresh() {
    try {
      const [gear, items] = await Promise.all([gameApi.gear(), gameApi.items()]);
      set({ gear, items });
    } catch {
      // A failed background refresh leaves the last good list on screen rather than
      // blanking it; the next deliberate action will surface the error properly.
    }
  },

  async setLocked(gearId, locked) {
    const updated = await gameApi.lockGear(gearId, locked);
    set({ gear: get().gear.map((piece) => (piece.id === gearId ? updated : piece)) });
  },

  reset() {
    set({ gear: [], items: [], loading: false, error: null });
  },
}));

/** How many of an item the player holds. */
export function itemCount(items: readonly InventoryItem[], itemKey: string): number {
  return items.find((entry) => entry.itemKey === itemKey)?.quantity ?? 0;
}
