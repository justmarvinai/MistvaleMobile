import { create } from 'zustand';
import type { ShopStock } from '@mistvale/shared';
import { gameApi, newActionId } from '../api/game';

/**
 * Shop stock.
 *
 * A store rather than screen state, for the same reason the roster is one: the Bazaar's
 * window is server state with a clock on it, and more than one screen will want to know
 * whether something is in stock once quests and events arrive. Every action returns the
 * server's new stock and replaces the old wholesale — nothing is patched locally.
 */

interface ShopState {
  stock: ShopStock | null;
  loading: boolean;
  error: string | null;

  load: (shopKey: string) => Promise<void>;
  buy: (shopKey: string, slotIndex: number) => Promise<void>;
  refreshStock: (shopKey: string) => Promise<void>;
  unlockSlot: (shopKey: string) => Promise<void>;
  reset: () => void;
}

export const useShopStore = create<ShopState>((set) => ({
  stock: null,
  loading: false,
  error: null,

  async load(shopKey) {
    set({ loading: true, error: null });
    try {
      set({ stock: await gameApi.shop(shopKey), loading: false });
    } catch (cause) {
      set({
        loading: false,
        error: cause instanceof Error ? cause.message : 'The traders are not answering.',
      });
    }
  },

  async buy(shopKey, slotIndex) {
    const result = await gameApi.buy(shopKey, slotIndex, newActionId());
    set({ stock: result.stock });
  },

  async refreshStock(shopKey) {
    set({ stock: await gameApi.refreshShop(shopKey, newActionId()) });
  },

  async unlockSlot(shopKey) {
    set({ stock: await gameApi.unlockShopSlot(shopKey, newActionId()) });
  },

  reset() {
    set({ stock: null, loading: false, error: null });
  },
}));
