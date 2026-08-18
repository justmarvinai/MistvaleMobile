import { create } from 'zustand';
import type { BattleEvent, UnitRef } from '@mistvale/engine';
import type { MultiBattleRequest, MultiBattleResult } from '@mistvale/shared';
import { gameApi, newActionId, type BattleView } from '../api/game';
import {
  applyAll,
  applyEvent,
  emptyView,
  eventDuration,
  trimFloaters,
  type PlaybackView,
} from '../game/playback';
import { CUE, playCue, type CueName } from '../audio';
import { useContentStore } from './contentStore';

/**
 * The battle screen's state.
 *
 * Two things live here and they are deliberately separate: the **server truth** (the
 * session, its full event log, whether it is waiting on input) and the **playback
 * position** (how much of that log the player has actually watched). Keeping them apart
 * is what lets speed, skip and reconnect all work without any of them lying about what
 * really happened.
 *
 * Which of the two a screen should be asking is answered in `battleClocks.ts`, and it is
 * worth reading before wiring anything to `battle.status`.
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
  /**
   * Opens an Arena fight against one of the offered opponents.
   *
   * A separate entry point only because the *request* is different — an offer id rather
   * than a stage key, a token rather than energy. What comes back is an ordinary battle
   * view, played through exactly the same machinery as everything else.
   */
  startArena: (input: { offerId: string; team: string[] }) => Promise<void>;
  /**
   * Farms a stage without watching. Returns the summary rather than storing it: there is
   * no playback to own, and the screen that asked is the screen that shows the result.
   */
  runMulti: (input: Omit<MultiBattleRequest, 'actionId'>) => Promise<MultiBattleResult>;
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
  /**
   * The sound a battle event makes, if any.
   *
   * Driven off the event log rather than off the store's own state, which means it is
   * driven off *playback* — a fight the server resolved thirty seconds ago is heard as
   * the player watches it, not when the response landed. The same reason the results
   * modal waits (see battleClocks.ts).
   *
   * Most events are silent on purpose. A cue per event type would be a wall of noise;
   * what a listener needs is the shape of the fight — hits, the ones that hurt, healing,
   * a death, a wave, and how it ended.
   */
  const cueFor = (event: BattleEvent): CueName | null => {
    switch (event.type) {
      case 'damage':
        // Only the first hit of a multi-hit skill announces itself as an event; the rest
        // are the same action landing, and the throttle catches what this does not.
        return event.crit ? CUE.crit : event.hitIndex === 0 ? CUE.hit : null;
      case 'heal':
      case 'shieldGained':
        return CUE.heal;
      case 'statusApplied':
        return statusKind(event.status) === 'buff' ? CUE.buff : CUE.debuff;
      case 'died':
        return CUE.death;
      case 'waveStart':
        return CUE.wave;
      case 'battleEnd':
        return event.outcome === 'victory' ? CUE.victory : CUE.defeat;
      default:
        return null;
    }
  };

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

    const cue = cueFor(next);
    if (cue) playCue(cue);

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

    async startArena(input) {
      stopTimer();
      set({ busy: true, error: null, view: emptyView(), pending: [], battle: null });
      try {
        const battle = await gameApi.attack(input);
        set({ busy: false });
        adopt(battle, 0);
      } catch (cause) {
        set({ busy: false, error: messageOf(cause) });
        throw cause;
      }
    },

    async runMulti(input) {
      set({ busy: true, error: null });
      try {
        const result = await gameApi.multiBattle({ ...input, actionId: newActionId() });
        set({ busy: false });
        return result;
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
      // What the player has actually watched: the queue is always a suffix of the log.
      // The tail below is applied *on top of* the current view, so re-applying events
      // already in it would land every hit a second time and leave a corpse or two on a
      // screen the player is walking away from.
      const playedThrough = battle.events.length - get().pending.length;
      set({ busy: true, error: null });
      try {
        const updated = await gameApi.retreat(battle.id);
        const view = structuredClone(get().view);
        applyAll(view, updated.events.slice(playedThrough), statusKind);
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
