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
  BulkUpgradeResult,
  Loadout,
  LoadoutPlan,
  Titan,
  TitanRun,
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
  SetAvatarRequest,
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
  DismantleResult,
  ReforgeQuote,
  ReforgeResult,
  Stat,
  ExpeditionClaimResult,
  ExpeditionState,
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
  Loadout,
  LoadoutPlan,
  Titan,
  TitanRun,
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
  /**
   * What a Titan run managed, and what it was paid for it. Null for every other mode — a
   * Titan is the only fight scored on how far it got rather than on whether it was won.
   */
  titan: TitanRun | null;
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
  /**
   * Whether this fight may be jumped to its end.
   *
   * The server's answer, decided when the fight opened: a stage has to have been beaten
   * once before its fight can be skipped. Hiding the button on this is politeness — the
   * server refuses the unbounded auto that Skip sends either way.
   */
  canSkip: boolean;
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
    input: {
      actionId: string;
      skill?: string;
      target?: UnitRef;
      auto?: boolean;
      /** How many player turns auto may take before handing control back. */
      autoTurns?: number;
      /** The enemy auto-battle should concentrate on. */
      focus?: UnitRef;
    },
  ) => api.post<BattleView>(ROUTES.battle.action(battleId), input),

  retreat: (battleId: string) => api.post<BattleView>(ROUTES.battle.retreat(battleId), {}),

  // ── Champions ────────────────────────────────────────────────────────────
  champion: (id: string) =>
    api.get<{ champion: ChampionDetail }>(ROUTES.roster.detail(id)).then((data) => data.champion),

  levelUp: (id: string, foodIds: string[], brews: number, actionId: string) =>
    api.post<ProgressionResponse>(ROUTES.roster.levelUp(id), { foodIds, brews, actionId }),

  rankUp: (id: string, foodIds: string[], actionId: string) =>
    api.post<ProgressionResponse>(ROUTES.roster.rankUp(id), { foodIds, actionId }),

  ascend: (id: string, actionId: string) =>
    api.post<ProgressionResponse>(ROUTES.roster.ascend(id), { actionId }),

  awaken: (id: string, actionId: string) =>
    api.post<ProgressionResponse>(ROUTES.roster.awaken(id), { actionId }),

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

  /** Grinds relics down for Reliquary Dust instead of selling them for silver. */
  dismantleGear: (ids: string[], actionId: string) =>
    api.post<DismantleResult>(ROUTES.gear.dismantle, { ids, actionId }),

  /** What a reforge would cost, and what each line could turn into. */
  reforgeQuote: (gearId: string) => api.get<ReforgeQuote>(ROUTES.gear.reforge(gearId)),

  reforgeGear: (
    gearId: string,
    substatIndex: number,
    expect: { stat: Stat; percent: boolean },
    actionId: string,
  ) =>
    api.post<ReforgeResult>(ROUTES.gear.reforge(gearId), {
      substatIndex,
      expectStat: expect.stat,
      expectPercent: expect.percent,
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

  /** Every saved relic set on the account. */
  loadouts: () =>
    api.get<{ loadouts: Loadout[] }>(ROUTES.loadouts.list).then((data) => data.loadouts),

  /** Captures what a champion is wearing, under a name. Saving over a name replaces it. */
  saveLoadout: (name: string, championId: string) =>
    api
      .post<{ loadout: Loadout }>(ROUTES.loadouts.save, { name, championId })
      .then((data) => data.loadout),

  renameLoadout: (id: string, name: string) =>
    api
      .patch<{ loadout: Loadout }>(ROUTES.loadouts.byId(id), { name })
      .then((data) => data.loadout),

  deleteLoadout: (id: string) => api.del<{ ok: boolean }>(ROUTES.loadouts.byId(id)),

  /** Puts a set on a champion. Comes back with the whole vault, since it can touch nine. */
  applyLoadout: (id: string, championId: string, actionId: string) =>
    api.post<{ plan: LoadoutPlan; gear: GearInstance[]; vault: VaultState }>(
      ROUTES.loadouts.apply(id),
      { championId, actionId },
    ),

  /** Forges several relics toward a level in one run. */
  upgradeMany: (ids: readonly string[], toLevel: number, actionId: string) =>
    api.post<BulkUpgradeResult>(ROUTES.gear.upgradeMany, { ids, toLevel, actionId }),

  // ── Expeditions ───────────────────────────────────────────────────────────

  expeditions: () =>
    api
      .get<{ expeditions: ExpeditionState }>(ROUTES.expeditions.state)
      .then((data) => data.expeditions),

  dispatchExpedition: (key: string, championIds: readonly string[], actionId: string) =>
    api
      .post<{ expeditions: ExpeditionState }>(ROUTES.expeditions.dispatch(key), {
        championIds,
        actionId,
      })
      .then((data) => data.expeditions),

  claimExpedition: (id: string, actionId: string) =>
    api.post<ExpeditionClaimResult>(ROUTES.expeditions.claim(id), { actionId }),

  recallExpedition: (id: string) =>
    api
      .post<{ championIds: string[]; expeditions: ExpeditionState }>(
        ROUTES.expeditions.recall(id),
        {},
      )
      .then((data) => data.expeditions),

  /** Every Titan, its ladder, the keys left today, and this account's own record. */
  titan: () => api.get<{ titan: Titan }>(ROUTES.titan.overview).then((data) => data.titan),

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

  /** The face the account wears. `null` takes it off, back to the crest. */
  setAvatar: (championKey: string | null) =>
    api
      .put<{ profile: PublicProfile }>(ROUTES.profile.avatar, {
        championKey,
      } satisfies SetAvatarRequest)
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
