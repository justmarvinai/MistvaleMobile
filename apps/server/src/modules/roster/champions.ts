import { and, eq } from 'drizzle-orm';
import { championScalingFrom, deriveStats } from '@mistvale/engine';
import {
  MAX_ASCENSION,
  NO_STAT_BONUS,
  RANK_RANGE_BY_RARITY,
  baseRankOf,
  canDeepen,
  maxRankFor,
  type AccountStatBonus,
  type ChampionDetail,
  type ChampionStats,
  type MasteryDef,
  type RosterChampion,
  type StatBlock,
} from '@mistvale/shared';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import {
  players,
  playerChampions,
  type GearInstanceRow,
  type PlayerChampionRow,
} from '../../db/schema/index';
import { AppError } from '../../lib/errors';
import { accountBonusFor, imprintFor, type AccountBonuses } from './account';
import { championXpToNextLevel } from '../rewards/service';
import {
  assembleChampion,
  gearByChampion,
  gearContextFrom,
  toDto,
  type GearContext,
} from '../gear/service';
import {
  ascensionCapForRank,
  ascensionCost,
  awakeningCost,
  progressionConfigFrom,
  rankUpCost,
  type ProgressionConfig,
} from './progression';
import { levelCapForRank } from './service';
import * as mastery from '../mastery/service';

/**
 * Assembling a champion for the client.
 *
 * The single place a roster row plus its relics turns into numbers, so the roster grid,
 * the champion screen, the equip preview and the battle route cannot disagree about what
 * a champion is worth. It is also the only place the client is told a *cost*, which is
 * what stops the UI from ever guessing one (CLAUDE.md — no game math client-side).
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ChampionContext {
  gear: GearContext;
  progression: ProgressionConfig;
  content: ContentCache;
  /** Published mastery nodes and what they cost, indexed once per request. */
  masteryNodes: ReadonlyMap<string, MasteryDef>;
  masteryCosts: mastery.MasteryCosts;
  /**
   * What the account's collection is worth to every champion in it (C10b).
   *
   * **Required**, and read once per request rather than once per champion — a roster of
   * thirty-seven would otherwise be thirty-seven round trips. A caller with no account to
   * speak of (a bot's snapshot, the tutorial's borrowed team) passes `NO_ACCOUNT_BONUSES`
   * explicitly, so "this team gets no collection bonus" is a decision somebody made rather
   * than a default nobody noticed.
   */
  account: AccountBonuses;
}

export function championContextFrom(
  content: ContentCache,
  account: AccountBonuses,
): ChampionContext {
  const bundle = content.current().bundle;
  return {
    gear: gearContextFrom(bundle),
    progression: progressionConfigFrom(bundle.config),
    content,
    masteryNodes: mastery.nodesFrom(content),
    masteryCosts: mastery.costsFrom(bundle.config),
    account,
  };
}

/** What a champion's learned masteries add to its stats, ready for `assembleChampion`. */
export function masteryContribution(
  row: Pick<PlayerChampionRow, 'masteries'>,
  base: StatBlock,
  context: ChampionContext,
): { flat: Partial<StatBlock>; setBonusAmplifyPct: number } {
  const resolved = mastery.resolveMasteries(row.masteries ?? [], context.masteryNodes);
  return {
    flat: mastery.applyMasteryStats(base, resolved),
    setBonusAmplifyPct: resolved.setBonusAmplifyPct,
  };
}

/** A champion's base stats — its definition scaled to this copy's tier, before relics. */
export function baseStatsFor(
  row: Pick<PlayerChampionRow, 'championKey' | 'level' | 'rank' | 'ascension' | 'awakening'>,
  context: ChampionContext,
): StatBlock {
  const bundle = context.content.current().bundle;
  const def = bundle.champions.find((champion) => champion.key === row.championKey);
  if (!def) throw AppError.notFound(`Champion "${row.championKey}" is no longer published.`);
  const scaling = championScalingFrom(bundle.config);
  return deriveStats(def.baseStats, row, scaling);
}

/**
 * What the account's collection adds to one champion.
 *
 * A champion whose definition has gone stale gets nothing rather than throwing: the roster
 * is drawn from rows a player owns, and a copy can outlive the content that described it.
 */
function accountBonusOf(championKey: string, context: ChampionContext): AccountStatBonus {
  const def = context.content
    .current()
    .bundle.champions.find((champion) => champion.key === championKey);
  if (!def) return NO_STAT_BONUS;
  return accountBonusFor(context.account, championKey, def.rarity);
}

/** Everything the roster grid shows for one champion. */
export function toRosterChampion(
  row: PlayerChampionRow,
  gear: readonly GearInstanceRow[],
  context: ChampionContext,
): RosterChampion {
  const base = baseStatsFor(row, context);
  const assembled = assembleChampion(
    base,
    gear,
    context.gear,
    masteryContribution(row, base, context),
    accountBonusOf(row.championKey, context),
  );
  const cap = levelCapForRank(row.rank);

  return {
    id: row.id,
    championKey: row.championKey,
    level: row.level,
    rank: row.rank,
    ascension: row.ascension,
    awakening: row.awakening,
    xp: row.xp,
    locked: row.locked,
    favourite: row.favourite,
    levelCap: cap,
    xpToNextLevel: row.level >= cap ? 0 : Math.max(0, championXpToNextLevel(row.level) - row.xp),
    power: assembled.power,
    equippedGearIds: gear.map((piece) => piece.id),
  };
}

/** The full champion screen: stats split by source, relics, and what each ladder costs. */
export function toChampionDetail(
  row: PlayerChampionRow,
  gear: readonly GearInstanceRow[],
  context: ChampionContext,
  /** The account's level, which decides whether the mastery trainer is open at all. */
  playerLevel = 0,
): ChampionDetail {
  const base = baseStatsFor(row, context);
  const assembled = assembleChampion(
    base,
    gear,
    context.gear,
    masteryContribution(row, base, context),
    accountBonusOf(row.championKey, context),
  );
  const def = context.content
    .current()
    .bundle.champions.find((champion) => champion.key === row.championKey);
  if (!def) throw AppError.notFound(`Champion "${row.championKey}" is no longer published.`);

  const stats: ChampionStats = {
    base,
    gear: assembled.gear,
    mastery: assembled.mastery,
    account: assembled.account,
    total: assembled.total,
    setBonuses: assembled.setBonuses,
    power: assembled.power,
  };
  const imprint = imprintFor(context.account, row.championKey, def.rarity);

  const nextAscension = row.ascension + 1;
  const ascensionCap = ascensionCapForRank(row.rank, context.progression);
  const ascensionAllowed = nextAscension <= ascensionCap;
  const rankCost = rankUpCost(def, row.rank, context.progression);
  const atCap = row.level >= levelCapForRank(row.rank);
  const ceiling = maxRankFor(def.rarity, baseRankOf(def));
  const awakenCost = awakeningCost(def, row.awakening + 1, context.progression);

  return {
    champion: toRosterChampion(row, gear, context),
    stats,
    gear: gear.map((piece) => toDto(piece, context.gear)),
    skillUpgrades: row.skillUpgrades ?? {},
    masteries: mastery.stateFor(row, context.masteryNodes, context.masteryCosts, playerLevel),
    imprint,
    costs: {
      rankUp: rankCost ? { ...rankCost, atLevelCap: atCap } : null,
      ascend:
        !canDeepen(def.rarity) || nextAscension > MAX_ASCENSION
          ? null
          : {
              items: ascensionCost(def, nextAscension, context.progression),
              allowedByRank: ascensionAllowed,
            },
      awaken: awakenCost
        ? {
            ...awakenCost,
            ready: {
              atMaxRank: row.rank >= ceiling,
              atLevelCap: atCap,
              atMaxAscension: row.ascension >= ascensionCap,
            },
          }
        : null,
      maxRank: ceiling,
      deepens: canDeepen(def.rarity),
      starTrackMoves: RANK_RANGE_BY_RARITY[def.rarity].upgradable,
    },
  };
}

/** Loads one owned champion with its relics, or 404s. */
export async function loadDetail(
  db: Executor,
  playerId: string,
  championId: string,
  context: ChampionContext,
): Promise<ChampionDetail> {
  const row = await loadOwned(db, playerId, championId);
  const gear = (await gearByChampion(db, [championId])).get(championId) ?? [];
  // The account's level is read here rather than threaded through a dozen call sites: it
  // decides only whether the mastery trainer is open, and every caller would have to
  // remember to pass it correctly otherwise.
  const [player] = await db
    .select({ level: players.level })
    .from(players)
    .where(eq(players.id, playerId));
  return toChampionDetail(row, gear, context, player?.level ?? 0);
}

export async function loadOwned(
  db: Executor,
  playerId: string,
  championId: string,
): Promise<PlayerChampionRow> {
  const [row] = await db
    .select()
    .from(playerChampions)
    .where(and(eq(playerChampions.id, championId), eq(playerChampions.playerId, playerId)));
  if (!row) throw AppError.notFound('No such champion.');
  return row;
}

/** The whole roster, with relics resolved in one query rather than one per champion. */
export async function loadRoster(
  db: Executor,
  playerId: string,
  context: ChampionContext,
): Promise<RosterChampion[]> {
  const rows = await db
    .select()
    .from(playerChampions)
    .where(eq(playerChampions.playerId, playerId));

  const gear = await gearByChampion(
    db,
    rows.map((row) => row.id),
  );
  return rows.map((row) => toRosterChampion(row, gear.get(row.id) ?? [], context));
}
