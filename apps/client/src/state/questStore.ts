import { create } from 'zustand';
import type { QuestPeriod, QuestsView } from '@mistvale/shared';
import { gameApi } from '../api/game';
import { usePlayerStore } from './playerStore';

/**
 * The checklist, as the client holds it.
 *
 * One object for the whole screen, replaced wholesale after every claim, because the
 * server already answers a claim with the whole screen. Patching a quest to "claimed"
 * locally would be one line — and would be wrong the moment claiming the eighth daily also
 * lights the chest, levels the account, and changes the badge.
 */

interface QuestStoreState {
  quests: QuestsView | null;
  loading: boolean;
  /** The quest key or period currently being claimed, so one button can say so. */
  busy: string | null;
  error: string | null;
  /** What the last claim paid, for the reward flourish. Cleared once shown. */
  lastPaid: Record<string, number> | null;

  load: () => Promise<void>;
  claim: (questKey: string) => Promise<void>;
  claimChest: (period: QuestPeriod) => Promise<void>;
  clearPaid: () => void;
  reset: () => void;
}

const message = (error: unknown, fallback: string): string =>
  error instanceof Error && error.message ? error.message : fallback;

/** A fresh id per claim, so a retried request pays once. */
const actionId = (): string => crypto.randomUUID();

export const useQuestStore = create<QuestStoreState>((set) => ({
  quests: null,
  loading: false,
  busy: null,
  error: null,
  lastPaid: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ quests: await gameApi.quests(), loading: false });
    } catch (error) {
      set({ loading: false, error: message(error, 'Could not read the checklist.') });
    }
  },

  async claim(questKey) {
    set({ busy: questKey, error: null });
    try {
      const result = await gameApi.claimQuest(questKey, actionId());
      set({ quests: result.quests, busy: null, lastPaid: result.paid });
      // A claim moves the wallet and can move the account level, and the dock badge is
      // computed from the snapshot — so the snapshot is what has to be re-read.
      await usePlayerStore.getState().refresh();
    } catch (error) {
      set({ busy: null, error: message(error, 'That could not be claimed.') });
    }
  },

  async claimChest(period) {
    set({ busy: `chest:${period}`, error: null });
    try {
      const result = await gameApi.claimQuestChest(period, actionId());
      set({ quests: result.quests, busy: null, lastPaid: result.paid });
      await usePlayerStore.getState().refresh();
    } catch (error) {
      set({ busy: null, error: message(error, 'That chest could not be claimed.') });
    }
  },

  clearPaid() {
    set({ lastPaid: null });
  },

  reset() {
    set({ quests: null, loading: false, busy: null, error: null, lastPaid: null });
  },
}));
