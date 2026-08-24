import { create } from 'zustand';
import { NO_DEEP_RUN, type DeepRunOutcome, type DeepRunView } from '@mistvale/shared';
import { gameApi, newActionId, type BattleView } from '../api/game';

/**
 * The descent, as the screen knows it.
 *
 * Every mutation answers with the **whole view**, because every one of them moves the
 * machine: opening a door changes the phase, taking a boon moves a floor. A store that
 * patched one field would be a second copy of the state machine, and the second copy is
 * the one that goes wrong.
 */

interface DeepRunStoreState {
  view: DeepRunView;
  loading: boolean;
  loaded: boolean;
  error: string | null;
  /** What the last descent was worth, held until the player dismisses it. */
  outcome: DeepRunOutcome | null;

  load: () => Promise<void>;
  begin: (runKey: string, championIds: readonly string[]) => Promise<void>;
  /** Opens a door. Answers with the battle when the room is a fight, null otherwise. */
  enter: (runKey: string, roomKey: string) => Promise<BattleView | null>;
  takeBoon: (runKey: string, boonKey: string) => Promise<void>;
  retire: (runKey: string) => Promise<DeepRunOutcome>;
  clearOutcome: () => void;
  reset: () => void;
}

export const useDeepRunStore = create<DeepRunStoreState>((set) => ({
  view: NO_DEEP_RUN,
  loading: false,
  loaded: false,
  error: null,
  outcome: null,

  async load() {
    set({ loading: true, error: null });
    try {
      set({ view: await gameApi.deepRun(), loading: false, loaded: true });
    } catch (cause) {
      set({
        loading: false,
        loaded: true,
        error: cause instanceof Error ? cause.message : 'The Stair could not be read.',
      });
    }
  },

  async begin(runKey, championIds) {
    set({ view: await gameApi.beginDeepRun(runKey, championIds, newActionId()), outcome: null });
  },

  async enter(runKey, roomKey) {
    const result = await gameApi.enterDeepRunRoom(runKey, roomKey, newActionId());
    set({ view: result.deepRun });
    return result.battle;
  },

  async takeBoon(runKey, boonKey) {
    set({ view: await gameApi.takeDeepRunBoon(runKey, boonKey, newActionId()) });
  },

  async retire(runKey) {
    const result = await gameApi.retireDeepRun(runKey, newActionId());
    set({ view: result.deepRun, outcome: result.outcome });
    return result.outcome;
  },

  clearOutcome() {
    set({ outcome: null });
  },

  reset() {
    set({ view: NO_DEEP_RUN, loading: false, loaded: false, error: null, outcome: null });
  },
}));
