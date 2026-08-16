import type {
  ChampionDetail,
  ChampionFlagsRequest,
  GearInstance,
  GearPreview,
  GearUpgradeResult,
  InventoryItem,
  RosterChampion,
  ShopPurchaseResult,
  ShopStock,
  SkillUpgradeRequest,
  Chronicle,
  Progress,
  SummonBanner,
  SummonHistoryEntry,
  SummonResponse,
} from '@mistvale/shared';
import { ROUTES } from '@mistvale/shared';
import type { BattleEvent, BattleState, UnitRef } from '@mistvale/engine';
import { api } from './client';

/**
 * Roster and battle calls.
 *
 * Everything here returns server state. The client never computes an outcome — it asks,
 * then plays back what came back (CLAUDE.md hard rules).
 */

export type {
  ChampionDetail,
  Chronicle,
  GearInstance,
  InventoryItem,
  RosterChampion,
  ShopStock,
  SummonBanner,
  SummonHistoryEntry,
};

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
  /** Relics the clear dropped, already owned by the time the client reads this. */
  gear: GearInstance[];
  items: Record<string, number>;
  /** True the first time this stage has ever been beaten. */
  firstClear: boolean;
  /** Paid on top of the stage payout: the first-clear bonus and any star chest. */
  bonus: Record<string, number>;
  /** Chapter star-chest tiers this clear crossed. */
  chestTiers: number[];
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

  // ── Champions ────────────────────────────────────────────────────────────
  champion: (id: string) =>
    api.get<{ champion: ChampionDetail }>(ROUTES.roster.detail(id)).then((data) => data.champion),

  levelUp: (id: string, foodIds: string[], actionId: string) =>
    api.post<ProgressionResponse>(ROUTES.roster.levelUp(id), { foodIds, actionId }),

  rankUp: (id: string, foodIds: string[], actionId: string) =>
    api.post<ProgressionResponse>(ROUTES.roster.rankUp(id), { foodIds, actionId }),

  ascend: (id: string, actionId: string) =>
    api.post<ProgressionResponse>(ROUTES.roster.ascend(id), { actionId }),

  upgradeSkill: (id: string, input: SkillUpgradeRequest) =>
    api.post<ProgressionResponse>(ROUTES.roster.skillUpgrade(id), input),

  setChampionFlags: (id: string, flags: ChampionFlagsRequest) =>
    api
      .post<{ champion: ChampionDetail }>(ROUTES.roster.flags(id), flags)
      .then((data) => data.champion),

  release: (ids: string[], actionId: string) =>
    api.post<{ released: string[]; silver: number; paid: number }>(ROUTES.roster.release, {
      ids,
      actionId,
    }),

  // ── Relics ───────────────────────────────────────────────────────────────
  gear: () => api.get<{ gear: GearInstance[] }>(ROUTES.gear.list).then((data) => data.gear),

  items: () =>
    api.get<{ items: InventoryItem[] }>(ROUTES.inventory.items).then((data) => data.items),

  equip: (gearId: string, championId: string) =>
    api
      .post<{ champion: ChampionDetail }>(ROUTES.gear.equip(gearId), { championId })
      .then((data) => data.champion),

  unequip: (gearId: string) =>
    api.post<{ gear: GearInstance }>(ROUTES.gear.unequip(gearId), {}).then((data) => data.gear),

  lockGear: (gearId: string, locked: boolean) =>
    api
      .post<{ gear: GearInstance }>(ROUTES.gear.lock(gearId), { locked })
      .then((data) => data.gear),

  upgradeGear: (gearId: string, times: number, actionId: string) =>
    api.post<GearUpgradeResult>(ROUTES.gear.upgrade(gearId), { times, actionId }),

  sellGear: (ids: string[], actionId: string) =>
    api.post<{ sold: string[]; silver: number; paid: number }>(ROUTES.gear.sell, {
      ids,
      actionId,
    }),

  previewGear: (gearId: string, championId: string) =>
    api
      .get<{ preview: GearPreview }>(
        `${ROUTES.gear.preview(gearId)}?championId=${encodeURIComponent(championId)}`,
      )
      .then((data) => data.preview),

  // ── Shops ────────────────────────────────────────────────────────────────
  shop: (key: string) =>
    api.get<{ stock: ShopStock }>(ROUTES.shop.stock(key)).then((data) => data.stock),

  buy: (key: string, slotIndex: number, actionId: string) =>
    api.post<ShopPurchaseResult>(ROUTES.shop.buy(key), { slotIndex, actionId }),

  refreshShop: (key: string, actionId: string) =>
    api.post<{ stock: ShopStock }>(ROUTES.shop.refresh(key), { actionId }).then((d) => d.stock),

  unlockShopSlot: (key: string, actionId: string) =>
    api.post<{ stock: ShopStock }>(ROUTES.shop.unlockSlot(key), { actionId }).then((d) => d.stock),

  // ── The Mistgate ─────────────────────────────────────────────────────────
  banners: () =>
    api.get<{ banners: SummonBanner[] }>(ROUTES.summon.banners).then((data) => data.banners),

  summon: (poolKey: string, count: 1 | 10, actionId: string) =>
    api.post<SummonResponse>(ROUTES.summon.pull(poolKey), { count, actionId }),

  summonHistory: () =>
    api.get<{ entries: SummonHistoryEntry[] }>(ROUTES.summon.history).then((data) => data.entries),

  chronicle: () =>
    api.get<{ chronicle: Chronicle }>(ROUTES.summon.chronicle).then((data) => data.chronicle),

  progress: () =>
    api.get<{ progress: Progress }>(ROUTES.progress.stages).then((data) => data.progress),
};

/** Every progression call answers the same way: the champion, and what it cost. */
export interface ProgressionResponse {
  champion: ChampionDetail;
  consumed: string[];
  silver: number;
  levelsGained: number;
}

/** A fresh idempotency key. Stable per intent, so a retry reuses the same one. */
export function newActionId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 32);
}
