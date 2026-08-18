import type {
  ArenaAttackRequest,
  ArenaDefenceRequest,
  ArenaLeaderboard,
  ArenaResult,
  ArenaState,
  ArenaTier,
  ChampionDetail,
  ChampionFlagsRequest,
  GearInstance,
  GearPreview,
  GearUpgradeResult,
  HallOfValor,
  HallUpgradeResult,
  InventoryItem,
  RosterChampion,
  ShopPurchaseResult,
  ShopStock,
  SkillUpgradeRequest,
  VaultOverflow,
  VaultState,
  Chronicle,
  Depths,
  MultiBattleRequest,
  MultiBattleResult,
  EventClaimRequest,
  EventClaimResult,
  EventsView,
  LoginClaimRequest,
  LoginClaimResult,
  LoginTrackKind,
  LoginView,
  MailClaimRequest,
  MailClaimResult,
  MailView,
  NewsView,
  PublicProfile,
  SetShowcaseRequest,
  TutorialAdvanceRequest,
  TutorialAdvanceResult,
  TutorialView,
  MissionClaimRequest,
  MissionClaimResult,
  MissionsView,
  Progress,
  QuestChestClaimRequest,
  QuestClaimRequest,
  QuestClaimResult,
  QuestPeriod,
  QuestsView,
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
  ArenaLeaderboard,
  ArenaResult,
  ArenaState,
  ChampionDetail,
  Chronicle,
  Depths,
  GearInstance,
  HallOfValor,
  InventoryItem,
  MultiBattleResult,
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
  /** The day's first victory in this mode, paid automatically. Empty once taken. */
  firstWin: Record<string, number>;
  /** What an Arena fight moved, on both ratings. Null for every other mode. */
  arena: ArenaResult | null;
  /** Relics the vault had no room for, and the silver paid in their place (Q5). */
  vaultOverflow: VaultOverflow;
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

  startBattle: (input: { mode: string; stageKey: string; team: string[]; actionId: string }) =>
    api.post<BattleView>(ROUTES.battle.start, input),

  activeBattle: () =>
    api.get<{ battle: BattleView | null }>(ROUTES.battle.active).then((data) => data.battle),

  /**
   * Fights a stage N times without watching.
   *
   * Comes back as a summary rather than N logs — there is nothing to play back, which is
   * the entire point of the button.
   */
  multiBattle: (input: MultiBattleRequest) =>
    api.post<MultiBattleResult>(ROUTES.battle.multi, input),

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

  learnMastery: (id: string, nodeKey: string, actionId: string) =>
    api
      .post<{ champion: ChampionDetail }>(ROUTES.roster.masteries(id), { nodeKey, actionId })
      .then((data) => data.champion),

  resetMasteries: (id: string, actionId: string) =>
    api.post<{ champion: ChampionDetail; crystalsSpent: number }>(ROUTES.roster.masteryReset(id), {
      actionId,
    }),

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
  gear: () => api.get<{ gear: GearInstance[]; vault: VaultState }>(ROUTES.gear.list),

  buyVaultSlots: (actionId: string) =>
    api
      .post<{ vault: VaultState }>(ROUTES.gear.buyVaultSlots, { actionId })
      .then((data) => data.vault),

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

  depths: () => api.get<{ depths: Depths }>(ROUTES.depths.overview).then((data) => data.depths),

  // ── The Arena ─────────────────────────────────────────────────────────────

  arena: () => api.get<{ arena: ArenaState }>(ROUTES.arena.state).then((data) => data.arena),

  refreshOffers: () =>
    api.post<{ arena: ArenaState }>(ROUTES.arena.refreshOffers, {}).then((data) => data.arena),

  setDefence: (team: string[]) =>
    api
      .post<{ arena: ArenaState }>(ROUTES.arena.defence, { team } satisfies ArenaDefenceRequest)
      .then((data) => data.arena),

  attack: (request: ArenaAttackRequest) =>
    api.post<{ battle: BattleView }>(ROUTES.arena.attack, request).then((data) => data.battle),

  leaderboard: () =>
    api
      .get<{ leaderboard: ArenaLeaderboard }>(ROUTES.arena.leaderboard)
      .then((data) => data.leaderboard),

  claimWeeklyChest: () =>
    api.post<{ chest: { tier: ArenaTier; rewards: Record<string, number> }; arena: ArenaState }>(
      ROUTES.arena.claimWeekly,
      {},
    ),

  hallOfValor: () =>
    api.get<{ hall: HallOfValor }>(ROUTES.hallOfValor.state).then((data) => data.hall),

  upgradeHall: (request: { element: string; stat: string; actionId: string }) =>
    api.post<HallUpgradeResult>(ROUTES.hallOfValor.upgrade, request),

  // ── Quests ────────────────────────────────────────────────────────────────

  quests: () => api.get<{ quests: QuestsView }>(ROUTES.quests.state).then((data) => data.quests),

  claimQuest: (questKey: string, actionId: string) =>
    api.post<QuestClaimResult>(ROUTES.quests.claim(questKey), {
      actionId,
    } satisfies QuestClaimRequest),

  claimQuestChest: (period: QuestPeriod, actionId: string) =>
    api.post<QuestClaimResult>(ROUTES.quests.claimChest, {
      period,
      actionId,
    } satisfies QuestChestClaimRequest),

  // ── The Valewarden's Path ─────────────────────────────────────────────────

  missions: () =>
    api.get<{ missions: MissionsView }>(ROUTES.missions.state).then((data) => data.missions),

  claimMission: (missionKey: string, actionId: string) =>
    api.post<MissionClaimResult>(ROUTES.missions.claim(missionKey), {
      actionId,
    } satisfies MissionClaimRequest),

  // ── Timed events ──────────────────────────────────────────────────────────

  events: () => api.get<{ events: EventsView }>(ROUTES.events.state).then((data) => data.events),

  claimEventMilestone: (eventKey: string, milestone: number, actionId: string) =>
    api.post<EventClaimResult>(ROUTES.events.claim(eventKey), {
      milestone,
      actionId,
    } satisfies EventClaimRequest),

  login: () => api.get<{ login: LoginView }>(ROUTES.login.state).then((data) => data.login),

  claimLoginDay: (track: LoginTrackKind, actionId: string, choice?: string) =>
    api.post<LoginClaimResult>(ROUTES.login.claim, {
      track,
      actionId,
      ...(choice ? { choice } : {}),
    } satisfies LoginClaimRequest),

  mail: () => api.get<{ mail: MailView }>(ROUTES.mail.state).then((data) => data.mail),

  readMail: (mailId: string) =>
    api.post<{ mail: MailView }>(ROUTES.mail.read(mailId), {}).then((data) => data.mail),

  claimMail: (mailId: string, actionId: string) =>
    api.post<MailClaimResult>(ROUTES.mail.claim(mailId), { actionId } satisfies MailClaimRequest),

  claimAllMail: (actionId: string) =>
    api.post<MailClaimResult>(ROUTES.mail.claimAll, { actionId } satisfies MailClaimRequest),

  discardMail: (mailId: string) =>
    api.post<{ mail: MailView }>(ROUTES.mail.discard(mailId), {}).then((data) => data.mail),

  news: () => api.get<{ news: NewsView }>(ROUTES.news.state).then((data) => data.news),

  profileCard: (playerId: string) =>
    api.get<{ profile: PublicProfile }>(ROUTES.profile.card(playerId)).then((data) => data.profile),

  setShowcase: (championIds: string[]) =>
    api
      .put<{ profile: PublicProfile }>(ROUTES.profile.showcase, {
        championIds,
      } satisfies SetShowcaseRequest)
      .then((data) => data.profile),

  // ── The tutorial ──────────────────────────────────────────────────────────

  tutorial: () =>
    api.get<{ tutorial: TutorialView }>(ROUTES.tutorial.state).then((data) => data.tutorial),

  advanceTutorial: (actionId: string) =>
    api.post<TutorialAdvanceResult>(ROUTES.tutorial.advance, {
      actionId,
    } satisfies TutorialAdvanceRequest),

  skipTutorial: () =>
    api.post<{ tutorial: TutorialView }>(ROUTES.tutorial.skip, {}).then((data) => data.tutorial),
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
