import { create } from 'zustand';
import type { BattleEvent, UnitRef } from '@mistvale/engine';
import { gameApi, newActionId, type BattleView } from '../api/game';
import {
  applyAll,
  applyEvent,
  emptyView,
  eventDuration,
  trimFloaters,
  type PlaybackView,
} from '../game/playback';
import { useContentStore } from './contentStore';

/**
 * The battle screen's state.
 *
 * Two things live here and they are deliberately separate: the **server truth** (the
 * session, its full event log, whether it is waiting on input) and the **playback
 * position** (how much of that log the player has actually watched). Keeping them apart
 * is what lets speed, skip and reconnect all work without any of them lying about what
 * really happened.
 */

interface BattleStoreState {
  battle: BattleView | null;
  /** What the player is currently looking at. */
  view: PlaybackView;
  /** Events queued but not yet played. */
  pending: BattleEvent[];
  playing: boolean;
  /** ×1 or ×2, persisted by the settings store. */
  speed: 1 | 2;
  auto: boolean;
  busy: boolean;
  error: string | null;

  /** True once playback has caught up and the server wants an action. */
  awaitingInput: boolean;

  startBattle: (input: { mode: string; stageKey: string; team: string[] }) => Promise<void>;
  resume: () => Promise<void>;
  act: (input: { skill?: string; target?: UnitRef }) => Promise<void>;
  runAuto: () => Promise<void>;
  retreat: () => Promise<void>;
  setSpeed: (speed: 1 | 2) => void;
  setAuto: (auto: boolean) => void;
  /** Jumps to the end of what has already resolved. */
  skipToLatest: () => void;
  reset: () => void;
}

/** Looks a status up in the content bundle so chips know which bar they belong on. */
function statusKind(key: string): 'buff' | 'debuff' {
  const bundle = useContentStore.getState().bundle;
  const status = bundle?.statuses.find((entry) => entry.key === key);
  return status?.kind === 'buff' ? 'buff' : 'debuff';
}

let timer: ReturnType<typeof setTimeout> | null = null;

function stopTimer(): void {
  if (timer) clearTimeout(timer);
  timer = null;
}

export const useBattleStore = create<BattleStoreState>((set, get) => {
  /** Plays the next queued event, then schedules the one after it. */
  const tick = (): void => {
    const { pending, speed } = get();
    const [next, ...rest] = pending;

    if (!next) {
      set({ playing: false, awaitingInput: computeAwaiting(get()) });
      return;
    }

    const view = structuredClone(get().view);
    applyEvent(view, next, statusKind);
    trimFloaters(view);
    set({ view, pending: rest });

    const delay = eventDuration(next) / speed;
    if (delay <= 0) {
      tick();
      return;
    }
    timer = setTimeout(tick, delay);
  };

  const play = (): void => {
    stopTimer();
    if (get().pending.length === 0) {
      set({ playing: false, awaitingInput: computeAwaiting(get()) });
      return;
    }
    set({ playing: true, awaitingInput: false });
    tick();
  };

  /** The server wants an action once playback has caught up and the battle is paused. */
  const computeAwaiting = (state: BattleStoreState): boolean =>
    state.battle !== null &&
    state.battle.status === 'active' &&
    state.battle.state.awaiting !== null &&
    state.pending.length === 0;

  /** Adopts a server response, queueing whatever is newly resolved. */
  const adopt = (battle: BattleView, playedThrough: number): void => {
    const fresh = battle.events.slice(playedThrough);
    set({ battle, pending: [...get().pending, ...fresh], error: null });
    play();
  };

  return {
    battle: null,
    view: emptyView(),
    pending: [],
    playing: false,
    speed: 1,
    auto: false,
    busy: false,
    error: null,
    awaitingInput: false,

    async startBattle(input) {
      stopTimer();
      set({ busy: true, error: null, view: emptyView(), pending: [], battle: null });
      try {
        const battle = await gameApi.startBattle(input);
        set({ busy: false });
        adopt(battle, 0);
      } catch (cause) {
        set({ busy: false, error: messageOf(cause) });
        throw cause;
      }
    },

    /**
     * Picks a battle back up after a refresh.
     *
     * The whole log is replayed instantly rather than animated: the player has already
     * seen it, and making them watch it again would be a punishment for reloading.
     */
    async resume() {
      set({ busy: true, error: null });
      try {
        const battle = await gameApi.activeBattle();
        if (!battle) {
          set({ busy: false, battle: null, view: emptyView(), pending: [] });
          return;
        }
        const view = emptyView();
        applyAll(view, battle.events, statusKind);
        set({ busy: false, battle, view, pending: [], playing: false });
        set({ awaitingInput: computeAwaiting(get()) });
      } catch (cause) {
        set({ busy: false, error: messageOf(cause) });
      }
    },

    async act(input) {
      const battle = get().battle;
      if (!battle || get().busy) return;
      const playedThrough = battle.events.length;
      set({ busy: true, error: null });
      try {
        const updated = await gameApi.act(battle.id, { actionId: newActionId(), ...input });
        set({ busy: false });
        adopt(updated, playedThrough);
      } catch (cause) {
        set({ busy: false, error: messageOf(cause) });
      }
    },

    async runAuto() {
      const battle = get().battle;
      if (!battle || get().busy) return;
      const playedThrough = battle.events.length;
      set({ busy: true, error: null, auto: true });
      try {
        const updated = await gameApi.act(battle.id, { actionId: newActionId(), auto: true });
        set({ busy: false });
        adopt(updated, playedThrough);
      } catch (cause) {
        set({ busy: false, error: messageOf(cause) });
      }
    },

    async retreat() {
      const battle = get().battle;
      if (!battle) return;
      stopTimer();
      set({ busy: true, error: null });
      try {
        const updated = await gameApi.retreat(battle.id);
        const view = structuredClone(get().view);
        applyAll(view, updated.events, statusKind);
        set({ busy: false, battle: updated, view, pending: [], playing: false });
      } catch (cause) {
        set({ busy: false, error: messageOf(cause) });
      }
    },

    setSpeed(speed) {
      set({ speed });
    },

    setAuto(auto) {
      set({ auto });
    },

    skipToLatest() {
      stopTimer();
      const { pending } = get();
      if (pending.length === 0) return;
      const view = structuredClone(get().view);
      applyAll(view, pending, statusKind);
      set({ view, pending: [], playing: false });
      set({ awaitingInput: computeAwaiting(get()) });
    },

    reset() {
      stopTimer();
      set({
        battle: null,
        view: emptyView(),
        pending: [],
        playing: false,
        busy: false,
        error: null,
        awaitingInput: false,
      });
    },
  };
});

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : 'Something went wrong.';
}
