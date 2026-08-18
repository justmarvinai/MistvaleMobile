import { create } from 'zustand';
import { unlockedBetween, type Unlock } from '../app/unlocks';

/**
 * The queue of things a level-up just opened.
 *
 * **The last celebrated level is remembered per account**, in local storage, and that is
 * the whole mechanism. A fresh sign-in seeds it silently at the account's current level —
 * somebody returning at level 30 is not owed a parade for the twelve things they unlocked
 * last month — and every rise after that is celebrated, gate by gate, in order.
 *
 * Presentation state, and kept client-side deliberately: a column for "has this player
 * seen the Bazaar card" would be a migration and a write on a hot path to remember
 * something that only matters to the tab it happened in.
 */

const KEY = 'mv.unlocks.seenLevel';

interface UnlockState {
  /** Waiting to be shown, oldest first. */
  queue: Unlock[];
  /** Which account the remembered level belongs to; a different one re-seeds. */
  accountId: string | null;

  /** Records the level, celebrating anything it crossed since the last call. */
  observe: (accountId: string, level: number) => void;
  dismiss: () => void;
  reset: () => void;
}

function read(accountId: string): number | null {
  try {
    const raw = window.localStorage.getItem(`${KEY}.${accountId}`);
    const level = raw === null ? Number.NaN : Number.parseInt(raw, 10);
    return Number.isFinite(level) ? level : null;
  } catch {
    // Private browsing, a full quota, a locked-down profile. A celebration is not worth
    // taking the game down for, so an unreadable store simply means "never celebrate".
    return null;
  }
}

function write(accountId: string, level: number): void {
  try {
    window.localStorage.setItem(`${KEY}.${accountId}`, String(level));
  } catch {
    /* see `read` */
  }
}

export const useUnlockStore = create<UnlockState>((set, get) => ({
  queue: [],
  accountId: null,

  observe(accountId, level) {
    const seen = read(accountId);
    write(accountId, level);

    // First sight of this account in this browser: seed and say nothing. Every unlock the
    // account already holds was earned before this tab existed.
    if (seen === null) {
      set({ accountId, queue: [] });
      return;
    }

    const opened = unlockedBetween(seen, level);
    if (opened.length === 0) {
      if (get().accountId !== accountId) set({ accountId, queue: [] });
      return;
    }
    set({ accountId, queue: [...get().queue, ...opened] });
  },

  dismiss() {
    set({ queue: get().queue.slice(1) });
  },

  reset() {
    set({ queue: [], accountId: null });
  },
}));
