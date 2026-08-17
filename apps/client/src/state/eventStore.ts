import { create } from 'zustand';
import type { EventsView } from '@mistvale/shared';
import { gameApi } from '../api/game';
import { usePlayerStore } from './playerStore';

/**
 * Timed events, as the client holds them.
 *
 * Replaced wholesale after a claim, like every other meta screen: taking a milestone can
 * level the account, which can bring a whole event into view that was gated a moment ago.
 */

interface EventStoreState {
  events: EventsView | null;
  loading: boolean;
  /** `eventKey:milestone` while a claim is in flight. */
  busy: string | null;
  error: string | null;
  lastPaid: Record<string, number> | null;

  load: () => Promise<void>;
  claim: (eventKey: string, milestone: number) => Promise<void>;
  clearPaid: () => void;
  reset: () => void;
}

const message = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

export const useEventStore = create<EventStoreState>((set) => ({
  events: null,
  loading: false,
  busy: null,
  error: null,
  lastPaid: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ events: await gameApi.events(), loading: false });
    } catch (error) {
      set({ loading: false, error: message(error, 'Could not read what is running.') });
    }
  },

  async claim(eventKey, milestone) {
    set({ busy: `${eventKey}:${milestone}`, error: null });
    try {
      const result = await gameApi.claimEventMilestone(eventKey, milestone, crypto.randomUUID());
      set({ events: result.events, busy: null, lastPaid: result.paid });
      await usePlayerStore.getState().refresh();
    } catch (error) {
      set({ busy: null, error: message(error, 'That could not be claimed.') });
    }
  },

  clearPaid() {
    set({ lastPaid: null });
  },

  reset() {
    set({ events: null, loading: false, busy: null, error: null, lastPaid: null });
  },
}));
