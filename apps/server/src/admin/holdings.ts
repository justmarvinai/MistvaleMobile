import { and, count, desc, eq, isNotNull, isNull } from 'drizzle-orm';
import type { AdminGearPage, AdminRoster, AdminSummonPage } from '@mistvale/shared';
import { gearInstances, playerChampions, summonHistory } from '../db/schema/index';
import type { Database } from '../db/client';

/**
 * What an account actually holds (ADMIN_SUITE_DESIGN §2.14).
 *
 * The player page has reported holdings as three counts since the A5 slice, with its own
 * schema comment promising the drill-ins "with A5 proper". This is them, and the reason
 * they matter is the support path: "my champion is gone" and "I never got the relic" are
 * answered by looking, and an operator with counts can only say how many there are.
 *
 * Read-only, and deliberately so. Every write against a player's holdings already exists as
 * a *grant* through `RewardService`, which lands in `economy_log`; an editor that reached
 * in and changed a relic's substats would be the one mutation in the suite with no ledger
 * behind it.
 *
 * The roster is unpaginated because it is bounded by `rosterCapacity` and an operator
 * looking for a champion wants the whole list to search; gear and summons are paginated
 * because neither is bounded by anything — a built account holds a thousand relics and a
 * spender's history has no ceiling at all.
 */

/** Roster, in the order the game's own "by rank" sort uses: rank, then level, then name. */
export async function readRoster(db: Database, playerId: string): Promise<AdminRoster> {
  const rows = await db
    .select()
    .from(playerChampions)
    .where(eq(playerChampions.playerId, playerId));

  const equipped = await db
    .select({
      championId: gearInstances.equippedChampionId,
      total: count(),
    })
    .from(gearInstances)
    .where(eq(gearInstances.playerId, playerId))
    .groupBy(gearInstances.equippedChampionId);

  const worn = new Map<string, number>();
  for (const entry of equipped) {
    if (entry.championId) worn.set(entry.championId, entry.total);
  }

  const champions = rows
    .map((row) => ({
      id: row.id,
      championKey: row.championKey,
      level: row.level,
      rank: row.rank,
      ascension: row.ascension,
      awakening: row.awakening,
      xp: row.xp,
      locked: row.locked,
      favourite: row.favourite,
      relicsWorn: worn.get(row.id) ?? 0,
      masteries: row.masteries.length,
      createdAt: row.acquiredAt.toISOString(),
    }))
    .sort(
      (a, b) => b.rank - a.rank || b.level - a.level || a.championKey.localeCompare(b.championKey),
    );

  return { total: champions.length, champions };
}

export async function readGear(
  db: Database,
  playerId: string,
  page: { limit: number; offset: number; equipped?: boolean | undefined },
): Promise<AdminGearPage> {
  // `equipped: false` is the **loose** vault, which is what the vault cap counts and so is
  // usually the question being asked ("why can I not pick anything up").
  const scope =
    page.equipped === undefined
      ? eq(gearInstances.playerId, playerId)
      : and(
          eq(gearInstances.playerId, playerId),
          page.equipped
            ? isNotNull(gearInstances.equippedChampionId)
            : isNull(gearInstances.equippedChampionId),
        );

  const [total] = await db.select({ total: count() }).from(gearInstances).where(scope);

  const rows = await db
    .select()
    .from(gearInstances)
    .where(scope)
    .orderBy(desc(gearInstances.acquiredAt))
    .limit(page.limit)
    .offset(page.offset);

  return {
    total: total?.total ?? 0,
    relics: rows.map((row) => ({
      id: row.id,
      setKey: row.setKey,
      slot: row.slot,
      rank: row.rank,
      rarity: row.rarity,
      level: row.level,
      mainStat: statLine(row.mainStat),
      substats: row.substats.map(statLine),
      equippedChampionId: row.equippedChampionId,
      locked: row.locked,
      createdAt: row.acquiredAt.toISOString(),
    })),
  };
}

/**
 * The pull history, newest first.
 *
 * `fromMercy` is on every row and it is the field the support question turns on: "I pulled
 * forty times and got nothing" is answered by whether mercy was doing anything, which no
 * count of pulls can say.
 */
export async function readSummons(
  db: Database,
  playerId: string,
  page: { limit: number; offset: number },
): Promise<AdminSummonPage> {
  const [total] = await db
    .select({ total: count() })
    .from(summonHistory)
    .where(eq(summonHistory.playerId, playerId));

  const rows = await db
    .select()
    .from(summonHistory)
    .where(eq(summonHistory.playerId, playerId))
    .orderBy(desc(summonHistory.createdAt))
    .limit(page.limit)
    .offset(page.offset);

  return {
    total: total?.total ?? 0,
    pulls: rows.map((row) => ({
      id: row.id,
      poolKey: row.poolKey,
      championKey: row.championKey,
      rarity: row.rarity,
      fromMercy: row.fromMercy,
      contentRev: row.contentRev,
      createdAt: row.createdAt.toISOString(),
    })),
  };
}

/**
 * A stat line as it reads on a relic.
 *
 * Rendered on the server rather than shipped as three fields, because whether a value is a
 * percentage decides how the number means anything at all — `DEF 40` and `DEF 40%` are two
 * very different relics, and a client re-deriving that is a second place to get it wrong.
 */
function statLine(line: { stat: string; percent: boolean; value: number }): string {
  return `${line.stat}${line.percent ? '%' : ''} ${line.value}`;
}
