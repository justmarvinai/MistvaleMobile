import { create } from 'zustand';
import type { SummonBanner, SummonResult } from '@mistvale/shared';
import { gameApi, newActionId } from '../api/game';

/**
 * The Mistgate.
 *
 * Holds the banners and the results of the pull being revealed. The reveal is presentation
 * only — every card in it was decided by the server before the first frame played, which
 * is the same split the battle screen and the forge use.
 */

interface SummonState {
  banners: SummonBanner[];
  loading: boolean;
  error: string | null;

  /** The pull being revealed, or an empty list when nothing is on screen. */
  revealing: SummonResult[];
  /** How many of `revealing` have been turned over. */
  revealed: number;
  pulling: boolean;
  /**
   * What the last pull was, so the cinematic can offer another without going back.
   *
   * The one press a player wants at the end of a reveal is the same press again, and
   * making them close the overlay, find the sigil and press the same button to get it is
   * friction with nothing on the other side of it. Still a real pull through the same
   * endpoint with the same sigil cost — remembering the arguments is all this is.
   */
  lastPull: { poolKey: string; count: 1 | 10 } | null;
  /**
   * How many pulls this session has resolved.
   *
   * The cinematic is a state machine with half a dozen timers in it, and the honest way to
   * start it over for a second pull is to build a new one — so the screen keys it on this.
   * A counter rather than the results array, because two identical ×1s of the same common
   * would be the same value and the second one would play nothing. Incremented when a pull
   * *starts*, so the number is stable across the round trip the wind-up plays over.
   */
  pullSeq: number;

  load: () => Promise<void>;
  pull: (poolKey: string, count: 1 | 10) => Promise<void>;
  /** The last pull, again. Resolves to false when there are no longer sigils for it. */
  pullAgain: () => Promise<boolean>;
  advanceReveal: () => void;
  revealAll: () => void;
  dismissReveal: () => void;
  reset: () => void;
}

export const useSummonStore = create<SummonState>((set, get) => ({
  banners: [],
  loading: false,
  error: null,
  revealing: [],
  revealed: 0,
  pulling: false,
  lastPull: null,
  pullSeq: 0,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ banners: await gameApi.banners(), loading: false });
    } catch (cause) {
      set({
        loading: false,
        error: cause instanceof Error ? cause.message : 'The gate will not open.',
      });
    }
  },

  async pull(poolKey, count) {
    if (get().pulling) return;
    // Counted up on the way *in*, not on the way out. The screen keys the cinematic on
    // this, and a number that moved when the answer arrived would tear the wind-up down
    // and rebuild it at exactly the moment it was about to pay off.
    set((state) => ({
      pulling: true,
      error: null,
      revealing: [],
      revealed: 0,
      pullSeq: state.pullSeq + 1,
    }));
    try {
      const response = await gameApi.summon(poolKey, count, newActionId());
      set((state) => ({
        // The banner comes back with the pull, so the odds panel updates without a
        // second round trip — and cannot briefly show pre-pull mercy.
        banners: state.banners.map((banner) =>
          banner.key === response.banner.key ? response.banner : banner,
        ),
        revealing: response.results,
        revealed: 0,
        pulling: false,
        lastPull: { poolKey, count },
      }));
    } catch (cause) {
      set({
        pulling: false,
        error: cause instanceof Error ? cause.message : 'The mist did not answer.',
      });
      throw cause;
    }
  },

  async pullAgain() {
    const again = get().lastPull;
    if (!again) return false;
    const banner = get().banners.find((entry) => entry.key === again.poolKey);
    // Checked here as well as on the server, so a player out of sigils sees the button
    // go quiet rather than a refusal in place of a reveal.
    if (!banner || banner.sigilsHeld < again.count) return false;
    await get().pull(again.poolKey, again.count);
    return true;
  },

  advanceReveal() {
    set((state) => ({ revealed: Math.min(state.revealed + 1, state.revealing.length) }));
  },

  revealAll() {
    set((state) => ({ revealed: state.revealing.length }));
  },

  dismissReveal() {
    set({ revealing: [], revealed: 0 });
  },

  reset() {
    set({
      banners: [],
      loading: false,
      error: null,
      revealing: [],
      revealed: 0,
      pulling: false,
      lastPull: null,
      pullSeq: 0,
    });
  },
}));
