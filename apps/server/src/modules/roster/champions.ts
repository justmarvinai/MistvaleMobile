import { and, eq } from 'drizzle-orm';
import { championScalingFrom, deriveStats } from '@mistvale/engine';
import {
  type ChampionDetail,
  type ChampionStats,
  type RosterChampion,
  type StatBlock,
} from '@mistvale/shared';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import {
  playerChampions,
  type GearInstanceRow,
  type PlayerChampionRow,
} from '../../db/schema/index';
import { AppError } from '../../lib/errors';
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
  progressionConfigFrom,
  rankUpCost,
  type ProgressionConfig,
} from './progression';
import { levelCapForRank } from './service';

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
}

export function championContextFrom(content: ContentCache): ChampionContext {
  const bundle = content.current().bundle;
  return {
    gear: gearContextFrom(bundle),
    progression: progressionConfigFrom(bundle.config),
    content,
  };
}

/** A champion's base stats — its definition scaled to this copy's tier, before relics. */
export function baseStatsFor(
  row: Pick<PlayerChampionRow, 'championKey' | 'level' | 'rank' | 'ascension'>,
  context: ChampionContext,
): StatBlock {
  const bundle = context.content.current().bundle;
  const def = bundle.champions.find((champion) => champion.key === row.championKey);
  if (!def) throw AppError.notFound(`Champion "${row.championKey}" is no longer published.`);
  const scaling = championScalingFrom(bundle.config);
  return deriveStats(def.baseStats, row, scaling);
}

/** Everything the roster grid shows for one champion. */
export function toRosterChampion(
  row: PlayerChampionRow,
  gear: readonly GearInstanceRow[],
  context: ChampionContext,
): RosterChampion {
  const base = baseStatsFor(row, context);
  const assembled = assembleChampion(base, gear, context.gear);
  const cap = levelCapForRank(row.rank);

  return {
    id: row.id,
    championKey: row.championKey,
    level: row.level,
    rank: row.rank,
    ascension: row.ascension,
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
): ChampionDetail {
  const base = baseStatsFor(row, context);
  const assembled = assembleChampion(base, gear, context.gear);
  const def = context.content
    .current()
    .bundle.champions.find((champion) => champion.key === row.championKey);
  if (!def) throw AppError.notFound(`Champion "${row.championKey}" is no longer published.`);

  const stats: ChampionStats = {
    base,
    gear: assembled.gear,
    total: assembled.total,
    setBonuses: assembled.setBonuses,
    power: assembled.power,
  };

  const nextAscension = row.ascension + 1;
  const ascensionAllowed = nextAscension <= ascensionCapForRank(row.rank, context.progression);
  const rankCost = rankUpCost(row.rank, context.progression);

  return {
    champion: toRosterChampion(row, gear, context),
    stats,
    gear: gear.map((piece) => toDto(piece, context.gear)),
    skillUpgrades: row.skillUpgrades ?? {},
    costs: {
      rankUp: rankCost ? { ...rankCost, atLevelCap: row.level >= levelCapForRank(row.rank) } : null,
      ascend:
        nextAscension > 6
          ? null
          : {
              items: ascensionCost(def, nextAscension, context.progression),
              allowedByRank: ascensionAllowed,
            },
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
  return toChampionDetail(row, gear, context);
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
