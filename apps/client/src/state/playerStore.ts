import { create } from 'zustand';
import {
  speedsFor,
  type BattleSpeed,
  DEFAULT_PLAYER_SETTINGS,
  ROUTES,
  computeUnlocks,
  type AccountSummary,
  type MultiBattleState,
  type PlayerSettings,
  type PlayerSummary,
  type Readiness,
  NO_READINESS,
  type UnlockFlags,
} from '@mistvale/shared';
import { api } from '@/api/client';

/**
 * What a fresh account may watch at, before the server has answered.
 *
 * `speedsFor({})` rather than a literal, so the two rungs everybody starts with are the
 * same two rungs the server derives from an empty campaign — one rule read twice, not two
 * rules that can drift.
 */
const STARTING_SPEEDS: readonly BattleSpeed[] = Object.freeze(speedsFor({}));

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
  /** Playback speeds this account has earned, ×1 first. */
  battleSpeeds: BattleSpeed[];
  /** The honorific the Valewarden's Path awarded, if any. */
  title: string | null;
  multiBattle: MultiBattleState;
  badges: DockBadges;
  /** What is waiting — arena tokens, Titan keys, today's springs. */
  readiness: Readiness;
  settings: PlayerSettings;
  serverTime: string;
}

/**
 * Dock pips, computed by the server on the snapshot the shell already re-fetches after
 * every action — never polled (UI_UX §1.3).
 */
export interface DockBadges {
  quests: number;
  missions: number;
  events: number;
  calendar: number;
  /** Unread, or holding something uncollected. Rides in the top bar, not the dock. */
  mail: number;
}

const NO_BADGES: DockBadges = Object.freeze({
  quests: 0,
  missions: 0,
  events: 0,
  calendar: 0,
  mail: 0,
});

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
  /**
   * How fast this account may watch a fight (`speedsFor`).
   *
   * Server-computed like every other gate: ×3 is earned by finishing the campaign on
   * Normal and ×4 by finishing it on Brutal, and the client must not work that out from a
   * map it happens to be holding. The multiplier itself is pure animation, which is why
   * this is the only part of speed the server has an opinion about.
   */
  battleSpeeds: BattleSpeed[];
  /** The honorific shown beside the profile name. */
  title: string | null;
  /** Today's farming allowance, server-computed like every other gate. */
  multiBattle: MultiBattleState;
  /** What is waiting to be collected, per dock destination. */
  badges: DockBadges;
  /** What is waiting, for the Haven's card. Empty until the first snapshot lands. */
  readiness: Readiness;
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
  battleSpeeds: [...STARTING_SPEEDS],
  title: null,
  multiBattle: NO_MULTI_BATTLE,
  badges: NO_BADGES,
  readiness: NO_READINESS,
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
        battleSpeeds:
          snapshot.battleSpeeds && snapshot.battleSpeeds.length > 0
            ? snapshot.battleSpeeds
            : [...STARTING_SPEEDS],
        title: snapshot.title ?? null,
        multiBattle: snapshot.multiBattle ?? NO_MULTI_BATTLE,
        badges: snapshot.badges ?? NO_BADGES,
        readiness: snapshot.readiness ?? NO_READINESS,
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
      battleSpeeds: [...STARTING_SPEEDS],
      title: null,
      multiBattle: NO_MULTI_BATTLE,
      badges: NO_BADGES,
      readiness: NO_READINESS,
      settings: DEFAULT_PLAYER_SETTINGS,
      loading: false,
      clockSkewMs: 0,
    });
  },
}));
