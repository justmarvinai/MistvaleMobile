import { create } from 'zustand';
import type { PublicProfile } from '@mistvale/shared';
import { gameApi } from '../api/game';

/**
 * Public profile cards.
 *
 * One store for every card, keyed by player, because a card is opened from three places —
 * the ladder, an offer, and the player's own chip — and the alternative is three stores
 * that each cache the same thing differently. Cards are cheap and change slowly; the one
 * being looked at is re-read on open and otherwise left alone.
 */

interface ProfileStoreState {
  /** The card on screen, or null when the panel is shut. */
  open: string | null;
  cards: Record<string, PublicProfile>;
  loading: boolean;
  error: string | null;
  /** True while the owner's showcase is being written. */
  saving: boolean;

  show: (playerId: string) => Promise<void>;
  close: () => void;
  setShowcase: (championIds: string[]) => Promise<void>;
  reset: () => void;
}

const message = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export const useProfileStore = create<ProfileStoreState>((set, get) => ({
  open: null,
  cards: {},
  loading: false,
  error: null,
  saving: false,

  async show(playerId) {
    // The panel opens on the cached card immediately and refreshes underneath, so a second
    // look at the same warden is instant rather than a spinner over what is already known.
    set({ open: playerId, error: null, loading: !get().cards[playerId] });
    try {
      const card = await gameApi.profileCard(playerId);
      set((state) => ({ cards: { ...state.cards, [playerId]: card }, loading: false }));
    } catch (error) {
      set({ loading: false, error: message(error, 'That warden could not be found.') });
    }
  },

  close() {
    set({ open: null, error: null });
  },

  async setShowcase(championIds) {
    set({ saving: true, error: null });
    try {
      const card = await gameApi.setShowcase(championIds);
      set((state) => ({
        cards: { ...state.cards, [card.playerId]: card },
        saving: false,
      }));
    } catch (error) {
      set({ saving: false, error: message(error, 'That could not be saved.') });
    }
  },

  reset() {
    set({ open: null, cards: {}, loading: false, error: null, saving: false });
  },
}));
