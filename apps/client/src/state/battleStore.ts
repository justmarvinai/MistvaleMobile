import { create } from 'zustand';
import type { BattleEvent, UnitRef } from '@mistvale/engine';
import type { BattleSpeed, MultiBattleRequest, MultiBattleResult } from '@mistvale/shared';
import { ApiRequestError } from '../api/client';
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
import { oneAtATime } from './oneAtATime';
import { useContentStore } from './contentStore';

/**
 * How many player turns one Auto request takes.
 *
 * Few enough that switching Auto off feels immediate; many enough that a forty-turn fight
 * is five requests rather than forty on a one-core box.
 */
const AUTO_TURNS = 8;

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
  /** ×1–×4, persisted by the loadout store and bounded by what the account has earned. */
  speed: BattleSpeed;
  auto: boolean;
  busy: boolean;
  error: string | null;

  /** True once playback has caught up and the server wants an action. */
  awaitingInput: boolean;

  startBattle: (input: {
    mode: string;
    stageKey: string;
    team: string[];
    /** A warden to borrow a champion from, by their player id (C37). */
    ally?: string;
  }) => Promise<void>;
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
  /** Which enemy auto-battle should concentrate on. Null is "let the AI choose". */
  focus: UnitRef | null;
  setFocus: (focus: UnitRef | null) => void;
  runAuto: () => Promise<void>;
  retreat: () => Promise<void>;
  setSpeed: (speed: BattleSpeed) => void;
  setAuto: (auto: boolean) => void;
  /** Jumps to the end of what has already resolved. */
  skipToLatest: () => Promise<void>;
  /**
   * Stops the playback clock without touching the fight.
   *
   * `tick` chains one `setTimeout` into the next for as long as there are events left,
   * and it belongs to the store rather than to the screen — so a `BattleScreen` that goes
   * away mid-fight leaves it running, cloning the view, moving health bars and playing hit
   * cues at somebody who is looking at the sign-in form. A fight cannot normally be
   * navigated away from, which is why this went unnoticed; signing out does it, and so
   * does an error boundary catching a render.
   */
  pausePlayback: () => void;
  /** Picks the clock back up where it stopped, if anything is left to watch. */
  resumePlayback: () => void;
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

/**
 * The one request on the wire.
 *
 * Skip is the reason it exists: it has to resolve the rest of the fight, and auto-battle is
 * asking for turns every couple of seconds, so a Skip pressed during one of those windows
 * would otherwise either race it or quietly do half its job — drain the buffer, leave the
 * battle running, and hand the player the same button again.
 */
const only = oneAtATime();

/**
 * The id the *next* attempt at opening a fight will carry.
 *
 * An `actionId` only buys anything if it survives the retry it exists for. Minting a fresh
 * one per call would mean the player pressing "Into the mist" again — after a lost
 * response, which is precisely when it matters — asks for a *second* battle and is told
 * they are already in one, about a fight they cannot see. So it is kept until a start
 * succeeds, and reused for as long as the request is the same one.
 *
 * Keyed on the intent rather than held blindly: a player who gives up on one stage and
 * picks another is not retrying, and must not inherit the abandoned attempt's id.
 */
let pendingStart: { key: string; actionId: string } | null = null;

function startIdFor(key: string): string {
  if (pendingStart?.key !== key) pendingStart = { key, actionId: newActionId() };
  return pendingStart.actionId;
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
    focus: null,
    busy: false,
    error: null,
    awaitingInput: false,

    async startBattle(input) {
      stopTimer();
      // The ally is part of the *intent*, so it is part of the key: pressing start, taking
      // the borrowed warden back out and pressing again is two different fights, and
      // reusing one id would answer the second with the first.
      const actionId = startIdFor(
        `${input.mode}:${input.stageKey}:${input.team.join(',')}:${input.ally ?? ''}`,
      );
      set({ busy: true, error: null, view: emptyView(), pending: [], battle: null });
      try {
        const battle = await gameApi.startBattle({ ...input, actionId });
        pendingStart = null;
        set({ busy: false });
        adopt(battle, 0);
      } catch (cause) {
        if (await recoverOpenBattle(cause, get, set)) return;
        set({ busy: false, error: messageOf(cause) });
        throw cause;
      }
    },

    async startArena(input) {
      stopTimer();
      const actionId = startIdFor(`arena:${input.offerId}:${input.team.join(',')}`);
      set({ busy: true, error: null, view: emptyView(), pending: [], battle: null });
      try {
        const battle = await gameApi.attack({ ...input, actionId });
        pendingStart = null;
        set({ busy: false });
        adopt(battle, 0);
      } catch (cause) {
        if (await recoverOpenBattle(cause, get, set)) return;
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
      if (!get().battle || get().busy) return;
      await only(async () => {
        const battle = get().battle;
        if (!battle) return;
        const playedThrough = battle.events.length;
        set({ busy: true, error: null });
        try {
          const updated = await gameApi.act(battle.id, { actionId: newActionId(), ...input });
          set({ busy: false });
          adopt(updated, playedThrough);
        } catch (cause) {
          set({ busy: false, error: messageOf(cause) });
        }
      });
    },

    /**
     * Lets the AI take the next few turns.
     *
     * A **few**, not the rest of the fight. `auto: true` on its own resolves the whole
     * battle server-side, which is right for multi-battle and is why the Auto button could
     * be switched on and never off: pressing it again had nothing left to cancel, because
     * the fight was already decided and only the playback remained. Asking for a handful of
     * turns at a time makes the button mean what it says — the screen re-asks while Auto is
     * engaged, and stops asking the moment it is not.
     *
     * Eight is the compromise: few enough that turning Auto off feels immediate, many
     * enough that a forty-turn fight is five requests rather than forty on a one-core box.
     */
    async runAuto() {
      if (!get().battle || get().busy) return;
      await only(async () => {
        const battle = get().battle;
        // Skip may have run while this was queued behind it, in which case the fight is
        // already resolved and there is nothing to ask for.
        if (!battle || battle.status !== 'active') return;
        const playedThrough = battle.events.length;
        const focus = get().focus;
        set({ busy: true, error: null, auto: true });
        try {
          const updated = await gameApi.act(battle.id, {
            actionId: newActionId(),
            auto: true,
            autoTurns: AUTO_TURNS,
            ...(focus ? { focus } : {}),
          });
          set({ busy: false });
          adopt(updated, playedThrough);
        } catch (cause) {
          set({ busy: false, error: messageOf(cause) });
        }
      });
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

    setFocus(focus) {
      set({ focus });
    },

    /**
     * Ends the fight on screen and shows the player where it got to.
     *
     * Skip means "I am not watching this one", and it used to be able to mean that by
     * draining the queue alone: it was only ever offered once the server had already
     * decided the battle, so the queue *was* the rest of the fight. Auto takes a few turns
     * at a time now (see `AUTO_TURNS`), so the queue is a couple of turns — and a Skip that
     * jumped two seconds forward and left the same button sitting there is not a skip.
     *
     * So it finishes the job: whatever the server has not resolved yet, it asks for in one
     * unbounded `auto` call — the same one multi-battle and the Arena use — and then plays
     * none of it. This is deliberately not cancellable. Auto is the reversible one; Skip is
     * the button whose whole meaning is that the fight is over.
     */
    async skipToLatest() {
      stopTimer();
      set({ playing: false });

      const battle = get().battle;
      if (battle && battle.status === 'active') {
        const focus = get().focus;
        await only(async () => {
          // Re-read: an auto request this one waited out has moved the log on, and
          // slicing at a stale length would replay turns the player has already seen.
          const current = get().battle;
          if (!current || current.status !== 'active') return;
          const playedThrough = current.events.length;
          set({ busy: true, error: null });
          try {
            const updated = await gameApi.act(current.id, {
              actionId: newActionId(),
              auto: true,
              ...(focus ? { focus } : {}),
            });
            set({
              busy: false,
              battle: updated,
              pending: [...get().pending, ...updated.events.slice(playedThrough)],
              error: null,
            });
          } catch (cause) {
            set({ busy: false, error: messageOf(cause) });
          }
        });
        stopTimer();
      }

      const { pending } = get();
      if (pending.length === 0) {
        set({ awaitingInput: computeAwaiting(get()) });
        return;
      }
      const view = structuredClone(get().view);
      applyAll(view, pending, statusKind);
      set({ view, pending: [], playing: false });
      set({ awaitingInput: computeAwaiting(get()) });
    },

    pausePlayback() {
      stopTimer();
      set({ playing: false });
    },

    resumePlayback() {
      // Nothing to resume is the common case: the screen mounts before a fight exists,
      // and `startBattle` starts its own playback.
      if (get().pending.length > 0 && !get().playing) play();
    },

    reset() {
      stopTimer();
      pendingStart = null;
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

/**
 * Turns "you are already in a battle" into being in that battle.
 *
 * The refusal is correct — one fight at a time — but on its own it is a dead end, and for a
 * while it was a *permanent* one. Which screen you are on is a value in a store rather than
 * a URL, so a reload lands on the Haven; `BattleScreen` is what asks to resume and it never
 * mounted; the session stayed active forever and every attempt to start anything answered
 * with this. The account needed an operator to reset it.
 *
 * The shell resumes on sign-in now, which is the main road. This is the guard rail beside
 * it: whatever produced an open fight the client had lost track of, the first thing the
 * player does afterwards puts them back in it rather than telling them they cannot play.
 *
 * Returns true when it recovered, so the caller neither reports an error nor rethrows —
 * from the player's side the press worked, they are simply in the fight they already had.
 */
async function recoverOpenBattle(
  cause: unknown,
  get: () => BattleStoreState,
  set: (partial: Partial<BattleStoreState>) => void,
): Promise<boolean> {
  if (!(cause instanceof ApiRequestError) || cause.code !== 'ALREADY_EXISTS') return false;
  await get().resume();
  const recovered = get().battle?.status === 'active';
  if (recovered) set({ error: null });
  return recovered;
}
