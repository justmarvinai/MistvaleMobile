import { ROUTES } from '@mistvale/shared';
import type { BattleEvent, BattleState, UnitRef } from '@mistvale/engine';
import { api } from './client';

/**
 * Roster and battle calls.
 *
 * Everything here returns server state. The client never computes an outcome — it asks,
 * then plays back what came back (CLAUDE.md hard rules).
 */

export interface RosterChampion {
  id: string;
  championKey: string;
  level: number;
  rank: number;
  ascension: number;
  xp: number;
  locked: boolean;
  favourite: boolean;
}

export interface StarterChoice {
  key: string;
  name: string;
  title: string;
  element: string;
  rarity: string;
  role: string;
  factionKey: string;
  assetKey: string;
}

export interface BattleRewards {
  silver: number;
  playerXp: number;
  championXp: number;
  stars: number;
  levelsGained: number;
}

export interface BattleView {
  id: string;
  mode: string;
  stageKey: string;
  status: string;
  outcome: string | null;
  state: BattleState;
  events: BattleEvent[];
  rewards: BattleRewards | null;
}

export const gameApi = {
  roster: () =>
    api.get<{ champions: RosterChampion[] }>(ROUTES.roster.list).then((data) => data.champions),

  starters: () =>
    api.get<{ starters: StarterChoice[] }>(ROUTES.roster.starters).then((data) => data.starters),

  chooseStarter: (championKey: string) =>
    api
      .post<{ champions: RosterChampion[] }>(ROUTES.roster.chooseStarter, { championKey })
      .then((data) => data.champions),

  startBattle: (input: { mode: string; stageKey: string; team: string[] }) =>
    api.post<BattleView>(ROUTES.battle.start, input),

  activeBattle: () =>
    api.get<{ battle: BattleView | null }>(ROUTES.battle.active).then((data) => data.battle),

  /**
   * Takes a turn.
   *
   * `actionId` is generated here and must be stable across a retry — that is the whole
   * point of it, so the caller owns it rather than this layer inventing a fresh one.
   */
  act: (
    battleId: string,
    input: { actionId: string; skill?: string; target?: UnitRef; auto?: boolean },
  ) => api.post<BattleView>(ROUTES.battle.action(battleId), input),

  retreat: (battleId: string) => api.post<BattleView>(ROUTES.battle.retreat(battleId), {}),
};

/** A fresh idempotency key. Stable per intent, so a retry reuses the same one. */
export function newActionId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 32);
}
