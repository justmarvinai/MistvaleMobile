import { create } from 'zustand';
import type { MailView } from '@mistvale/shared';
import { gameApi } from '../api/game';
import { usePlayerStore } from './playerStore';

/**
 * The mailbox, as the client holds it.
 *
 * Every call answers with the whole inbox, so this store never patches a message in place:
 * the unread count and the pip move with the message, and reconstructing them here would
 * be the client doing arithmetic the server already did.
 */

interface MailStoreState {
  mail: MailView | null;
  loading: boolean;
  /** The message id a claim is in flight for, or `all`. */
  busy: string | null;
  error: string | null;
  lastPaid: Record<string, number> | null;

  load: () => Promise<void>;
  open: (mailId: string) => Promise<void>;
  claim: (mailId: string) => Promise<void>;
  claimAll: () => Promise<void>;
  discard: (mailId: string) => Promise<void>;
  clearPaid: () => void;
  reset: () => void;
}

const message = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export const useMailStore = create<MailStoreState>((set, get) => ({
  mail: null,
  loading: false,
  busy: null,
  error: null,
  lastPaid: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ mail: await gameApi.mail(), loading: false });
    } catch (error) {
      set({ loading: false, error: message(error, 'Could not read your mail.') });
    }
  },

  async open(mailId) {
    // Opening is not an action the player asked to *take*, so a failure here is silent
    // beyond the console: the message is on screen either way, and an error banner over a
    // read receipt would be noise.
    const already = get().mail?.messages.find((entry) => entry.id === mailId)?.read;
    if (already) return;
    try {
      set({ mail: await gameApi.readMail(mailId) });
      await usePlayerStore.getState().refresh();
    } catch {
      /* The message is open regardless; the receipt can wait for the next read. */
    }
  },

  async claim(mailId) {
    set({ busy: mailId, error: null });
    try {
      const result = await gameApi.claimMail(mailId, crypto.randomUUID());
      set({ mail: result.mail, busy: null, lastPaid: result.paid });
      await usePlayerStore.getState().refresh();
    } catch (error) {
      set({ busy: null, error: message(error, 'That could not be collected.') });
    }
  },

  async claimAll() {
    set({ busy: 'all', error: null });
    try {
      const result = await gameApi.claimAllMail(crypto.randomUUID());
      set({ mail: result.mail, busy: null, lastPaid: result.paid });
      await usePlayerStore.getState().refresh();
    } catch (error) {
      set({ busy: null, error: message(error, 'Those could not be collected.') });
    }
  },

  async discard(mailId) {
    set({ busy: mailId, error: null });
    try {
      set({ mail: await gameApi.discardMail(mailId), busy: null });
      await usePlayerStore.getState().refresh();
    } catch (error) {
      set({ busy: null, error: message(error, 'That could not be thrown away.') });
    }
  },

  clearPaid() {
    set({ lastPaid: null });
  },

  reset() {
    set({ mail: null, loading: false, busy: null, error: null, lastPaid: null });
  },
}));
