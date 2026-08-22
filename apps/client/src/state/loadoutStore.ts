import { create } from 'zustand';
import { BATTLE_SPEEDS, type BattleSpeed } from '@mistvale/shared';

/**
 * The team you last sent, and how you like to watch a fight.
 *
 * Before this, every fight in the game started from an empty team: four blank slots and a
 * roster to re-pick from, on every stage, every floor and every challenge — while the team
 * a player uses barely changes for days at a time. The owner's note (2026-08-20) was the
 * plain one: *the game should remember.*
 *
 * **Per mode, not per stage.** A campaign team and a Depths team are genuinely different
 * decisions — one is a farming squad, the other is built against a keep's mechanics — but
 * stage 4-3 and stage 4-4 are not. So the key is the battle mode, which is content's own
 * word for "what kind of fight this is" and means a mode published later needs no change
 * here.
 *
 * **Kept client-side, deliberately.** None of this is game state: the server still decides
 * every outcome, and it re-checks the team on the way in — a champion sold since last night
 * is refused there whatever this remembers. What it is is the shape of one player's habit,
 * which belongs in the browser they play in rather than in a column and a write on the hot
 * path of starting a battle.
 *
 * Stored per account, so two wardens sharing a machine do not inherit each other's squad,
 * and read defensively: local storage is allowed to be missing, full, or full of nonsense,
 * and none of those is worth taking the game down for.
 */

const KEY = 'mv.loadout';

/** Four slots, and the fifth is never anybody's team. */
const MAX_SLOTS = 4;

interface Remembered {
  /** Champion instance ids, in the order they were chosen — slot one is the leader. */
  teams: Record<string, string[]>;
  speed: BattleSpeed;
  auto: boolean;
}

const EMPTY: Remembered = { teams: {}, speed: 1, auto: false };

interface LoadoutState extends Remembered {
  /** Which account this belongs to; a different one re-reads. */
  accountId: string | null;

  /** Reads what this account last did. Cheap and idempotent — safe on every render pass. */
  adopt: (accountId: string) => void;
  /** Records the team that just went into a fight. */
  remember: (mode: string, team: readonly string[]) => void;
  /**
   * The team to open a picker with: what was remembered, minus anybody no longer owned.
   *
   * The filter is the whole reason this is a function rather than a field. A champion that
   * has been fed away, sold, or simply belongs to a different account is still an id in
   * local storage, and pre-filling a slot with one produces a team the server refuses and
   * a player who cannot see why.
   */
  teamFor: (mode: string, owned: ReadonlySet<string>) => string[];
  setSpeed: (speed: BattleSpeed) => void;
  setAuto: (auto: boolean) => void;
  reset: () => void;
}

function read(accountId: string): Remembered {
  try {
    const raw = window.localStorage.getItem(`${KEY}.${accountId}`);
    if (!raw) return EMPTY;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return EMPTY;
    const value = parsed as Partial<Remembered>;
    const teams: Record<string, string[]> = {};
    for (const [mode, team] of Object.entries(value.teams ?? {})) {
      if (Array.isArray(team)) {
        teams[mode] = team.filter((id): id is string => typeof id === 'string').slice(0, MAX_SLOTS);
      }
    }
    // Read through the ladder rather than a two-value check: the rungs are ×1–×4 now, and
    // a hand-edited or retuned value should land on a real speed rather than silently on
    // ×1. What is *open* is the server's word and clamped where it is used.
    const speed = BATTLE_SPEEDS.find((entry) => entry === value.speed) ?? 1;
    return { teams, speed, auto: value.auto === true };
  } catch {
    // Private browsing, a full quota, a hand-edited key. A remembered team is a
    // convenience; nothing here is worth an error boundary.
    return EMPTY;
  }
}

function write(accountId: string, value: Remembered): void {
  try {
    window.localStorage.setItem(`${KEY}.${accountId}`, JSON.stringify(value));
  } catch {
    /* see `read` */
  }
}

export const useLoadoutStore = create<LoadoutState>((set, get) => ({
  ...EMPTY,
  accountId: null,

  adopt(accountId) {
    if (get().accountId === accountId) return;
    set({ accountId, ...read(accountId) });
  },

  remember(mode, team) {
    const next = { ...get().teams, [mode]: [...team].slice(0, MAX_SLOTS) };
    set({ teams: next });
    const { accountId, speed, auto } = get();
    if (accountId) write(accountId, { teams: next, speed, auto });
  },

  teamFor(mode, owned) {
    return (get().teams[mode] ?? []).filter((id) => owned.has(id)).slice(0, MAX_SLOTS);
  },

  setSpeed(speed) {
    set({ speed });
    const { accountId, teams, auto } = get();
    if (accountId) write(accountId, { teams, speed, auto });
  },

  setAuto(auto) {
    set({ auto });
    const { accountId, teams, speed } = get();
    if (accountId) write(accountId, { teams, speed, auto });
  },

  reset() {
    // The in-memory copy only. What is on disk is keyed by account and is exactly what
    // signing back in is supposed to restore.
    set({ accountId: null, ...EMPTY });
  },
}));
