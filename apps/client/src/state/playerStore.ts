import { create } from 'zustand';
import {
  DEFAULT_PLAYER_SETTINGS,
  ROUTES,
  computeUnlocks,
  type AccountSummary,
  type MultiBattleState,
  type PlayerSettings,
  type PlayerSummary,
  type UnlockFlags,
} from '@mistvale/shared';
import { api } from '@/api/client';

/**
 * The player snapshot the shell renders from.
 *
 * Fetched on entering the game and refreshed after actions — never polled. Everything
 * here is server-computed; the client only displays it.
 */

interface PlayerSnapshot {
  account: AccountSummary;
  player: PlayerSummary;
  unlocks: UnlockFlags;
  multiBattle: MultiBattleState;
  settings: PlayerSettings;
  serverTime: string;
}

/** Until the first snapshot lands, the farming control is drawn shut rather than guessed at. */
const NO_MULTI_BATTLE: MultiBattleState = Object.freeze({
  unlocked: false,
  lockedReason: null,
  runsLeftToday: 0,
  dailyCap: 0,
  maxPerCall: 0,
});

interface PlayerState {
  player: PlayerSummary | null;
  unlocks: UnlockFlags;
  /** Today's farming allowance, server-computed like every other gate. */
  multiBattle: MultiBattleState;
  settings: PlayerSettings;
  loading: boolean;
  /** Difference between server and client clocks, so countdowns stay honest. */
  clockSkewMs: number;

  refresh(): Promise<void>;
  updateSettings(patch: Partial<PlayerSettings>): Promise<void>;
  reset(): void;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  player: null,
  unlocks: computeUnlocks(1),
  multiBattle: NO_MULTI_BATTLE,
  settings: DEFAULT_PLAYER_SETTINGS,
  loading: false,
  clockSkewMs: 0,

  async refresh() {
    set({ loading: true });
    try {
      const requestedAt = Date.now();
      const snapshot = await api.get<PlayerSnapshot>(ROUTES.player.self);
      const serverTime = new Date(snapshot.serverTime).getTime();
      // Round-trip halved gives a usable estimate of the offset for local countdowns.
      const latencyAllowance = (Date.now() - requestedAt) / 2;

      set({
        player: snapshot.player,
        unlocks: snapshot.unlocks,
        multiBattle: snapshot.multiBattle ?? NO_MULTI_BATTLE,
        settings: { ...DEFAULT_PLAYER_SETTINGS, ...snapshot.settings },
        clockSkewMs: serverTime + latencyAllowance - Date.now(),
        loading: false,
      });
    } catch (error) {
      set({ loading: false });
      throw error;
    }
  },

  /**
   * Applies a settings change locally straight away, then reconciles with the server.
   *
   * Preferences are the one place the client leads: a toggle that waits for a round trip
   * feels broken (UI_UX §1.2 requires acknowledgment within 100 ms), and these values
   * carry no gameplay advantage. If the write fails, the previous values are restored
   * and the caller surfaces the error — game state itself is never optimistic.
   */
  async updateSettings(patch) {
    const previous = get().settings;
    set({ settings: { ...previous, ...patch } });

    try {
      const result = await api.patch<{ settings: PlayerSettings }>(ROUTES.player.settings, patch);
      set({ settings: result.settings });
    } catch (error) {
      set({ settings: previous });
      throw error;
    }
  },

  reset() {
    set({
      player: null,
      unlocks: computeUnlocks(1),
      multiBattle: NO_MULTI_BATTLE,
      settings: DEFAULT_PLAYER_SETTINGS,
      loading: false,
      clockSkewMs: 0,
    });
  },
}));
