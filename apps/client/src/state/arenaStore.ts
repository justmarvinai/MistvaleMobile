import { create } from 'zustand';
import type { ArenaLeaderboard, ArenaState, ArenaTier, HallOfValor } from '@mistvale/shared';
import { gameApi } from '../api/game';
import { usePlayerStore } from './playerStore';

/**
 * The Arena, as the client holds it.
 *
 * Every number on the hub is the server's — rating, tokens, what a fight is worth, what a
 * refresh costs. The store's whole job is to keep one copy of them and replace it wholesale
 * after every mutation, because a ladder that patched its own state locally would drift
 * from the truth exactly when it mattered (CLAUDE.md — the client computes nothing).
 *
 * The leaderboard and the Hall are loaded separately from the hub. They are their own
 * panels, opened deliberately, and folding them into the hub read would make the screen a
 * player visits ten times a day pay for two they visit rarely.
 */

interface ArenaStoreState {
  arena: ArenaState | null;
  leaderboard: ArenaLeaderboard | null;
  hall: HallOfValor | null;

  loading: boolean;
  /** Set while an action is in flight, so a button can say what it is doing. */
  busy: string | null;
  error: string | null;

  load: () => Promise<void>;
  loadLeaderboard: () => Promise<void>;
  loadHall: () => Promise<void>;
  refreshOffers: () => Promise<void>;
  setDefence: (team: string[]) => Promise<void>;
  claimChest: () => Promise<{ tier: ArenaTier; rewards: Record<string, number> } | null>;
  upgradeHall: (element: string, stat: string) => Promise<boolean>;
  reset: () => void;
}

const message = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export const useArenaStore = create<ArenaStoreState>((set, get) => ({
  arena: null,
  leaderboard: null,
  hall: null,
  loading: false,
  busy: null,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ arena: await gameApi.arena(), loading: false });
    } catch (error) {
      set({ loading: false, error: message(error, 'Could not reach the Arena.') });
    }
  },

  async loadLeaderboard() {
    try {
      set({ leaderboard: await gameApi.leaderboard() });
    } catch (error) {
      set({ error: message(error, 'Could not load the ladder.') });
    }
  },

  async loadHall() {
    try {
      set({ hall: await gameApi.hallOfValor() });
    } catch (error) {
      set({ error: message(error, 'Could not open the Hall of Valor.') });
    }
  },

  async refreshOffers() {
    if (get().busy) return;
    set({ busy: 'refresh', error: null });
    try {
      set({ arena: await gameApi.refreshOffers(), busy: null });
      // A paid refresh spends crystals, and the header holds the wallet.
      await usePlayerStore.getState().refresh();
    } catch (error) {
      set({ busy: null, error: message(error, 'Could not roll a new list.') });
    }
  },

  async setDefence(team) {
    if (get().busy) return;
    set({ busy: 'defence', error: null });
    try {
      set({ arena: await gameApi.setDefence(team), busy: null });
    } catch (error) {
      set({ busy: null, error: message(error, 'Could not set that defence.') });
    }
  },

  async claimChest() {
    if (get().busy) return null;
    set({ busy: 'chest', error: null });
    try {
      const claimed = await gameApi.claimWeeklyChest();
      set({ arena: claimed.arena, busy: null });
      await usePlayerStore.getState().refresh();
      return claimed.chest;
    } catch (error) {
      set({ busy: null, error: message(error, 'Could not open that chest.') });
      return null;
    }
  },

  async upgradeHall(element, stat) {
    if (get().busy) return false;
    set({ busy: `hall:${element}:${stat}`, error: null });
    try {
      await gameApi.upgradeHall({
        element,
        stat,
        // The medals are already spent by the time a retry could land, so the id only has
        // to be unique per attempt rather than stable across one.
        actionId: `hall-${element}-${stat}-${Date.now()}`,
      });
      // Re-read rather than patch: the track's next cost and next value both move, and
      // the server is the one that knows them.
      set({ hall: await gameApi.hallOfValor(), busy: null });
      await usePlayerStore.getState().refresh();
      return true;
    } catch (error) {
      set({ busy: null, error: message(error, 'Could not train that track.') });
      return false;
    }
  },

  reset() {
    set({
      arena: null,
      leaderboard: null,
      hall: null,
      loading: false,
      busy: null,
      error: null,
    });
  },
}));
