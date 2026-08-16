import { randomInt } from 'node:crypto';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { createRng } from '@mistvale/engine';
import {
  type Chronicle,
  type ChronicleEntry,
  type Rarity,
  type SummonBanner,
  type SummonHistoryEntry,
  type SummonPoolDef,
  type SummonResult,
} from '@mistvale/shared';
import { championSightings, playerChampions, players, summonHistory } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import { grantItems, itemQuantities } from '../rewards/service';
import { grantChampion } from '../roster/service';
import { championContextFrom, toRosterChampion } from '../roster/champions';
import { gearByChampion } from '../gear/service';
import { pityStates, poolContents, rarityLookup, rollMany, type PityCounters } from './roll';

/**
 * The Mistgate.
 *
 * The roll itself lives in `roll.ts` and is pure; this module is what makes a pull *real*
 * — spending the sigil, writing the champion, moving the counters and recording the
 * history, all in one transaction. If any part of that fails, none of it happened: a
 * player must never lose a sigil to a half-completed summon.
 *
 * The seed comes from the OS CSPRNG. The engine's deterministic RNG exists so battles can
 * be replayed; a summon must not be predictable from anything a player can see.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface SummonContext {
  content: ContentCache;
}

/** Reads a published pool, or 404s. */
export function poolFor(content: ContentCache, poolKey: string): SummonPoolDef {
  const pool = content.current().bundle.summonPools.find((entry) => entry.key === poolKey);
  if (!pool) throw AppError.notFound('No such summon pool.');
  return pool;
}

/** The player's mercy counters for one pool. */
function countersFor(
  stored: Record<string, Record<string, number>>,
  poolKey: string,
): PityCounters {
  return (stored[poolKey] ?? {}) as PityCounters;
}

// ── Banners ─────────────────────────────────────────────────────────────────

/**
 * Every pool, as the Mistgate shows it.
 *
 * The odds panel renders `rates` and `pity` verbatim, so what the player is told is the
 * table the server is about to roll against — not a marketing approximation of it.
 */
export async function banners(
  db: Executor,
  playerId: string,
  content: ContentCache,
): Promise<SummonBanner[]> {
  const bundle = content.current().bundle;
  const [player] = await db
    .select({ pity: players.summonPity })
    .from(players)
    .where(eq(players.id, playerId));
  if (!player) throw AppError.notFound('No such player.');

  const held = await itemQuantities(db, playerId);
  const rarityOf = rarityLookup(bundle.champions);

  return [...bundle.summonPools]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((pool) => toBanner(pool, countersFor(player.pity, pool.key), held, rarityOf));
}

function toBanner(
  pool: SummonPoolDef,
  counters: PityCounters,
  held: ReadonlyMap<string, number>,
  rarityOf: (key: string) => Rarity | undefined,
): SummonBanner {
  return {
    key: pool.key,
    name: pool.name,
    description: pool.description,
    sigilKey: pool.sigilKey,
    sigilsHeld: held.get(pool.sigilKey) ?? 0,
    rates: Object.fromEntries(
      Object.entries(pool.rates).filter(([, value]) => typeof value === 'number'),
    ) as Record<string, number>,
    pity: pityStates(pool, counters),
    featured: pool.entries.filter((entry) => entry.featured).map((entry) => entry.championKey),
    tenPullFloor: pool.tenPullFloor ?? null,
    contents: poolContents(pool, rarityOf),
  };
}

// ── Pulling ─────────────────────────────────────────────────────────────────

export interface PullOutcome {
  results: SummonResult[];
  banner: SummonBanner;
  sigilsHeld: number;
}

/**
 * Spends sigils and summons.
 *
 * Everything happens under the player row lock and inside one transaction, so a pull is
 * atomic in the way that matters: the sigil leaves and the champion arrives together, or
 * neither does. `actionId` makes a retried request safe — a dropped response on a phone
 * must not cost ten sigils twice.
 */
export async function pull(
  db: Database,
  playerId: string,
  poolKey: string,
  count: number,
  actionId: string,
  content: ContentCache,
): Promise<PullOutcome> {
  const pool = poolFor(content, poolKey);
  const bundle = content.current().bundle;
  const rarityOf = rarityLookup(bundle.champions);
  const contentRev = content.rev;

  return db.transaction(async (tx) => {
    const [player] = await tx
      .select({ pity: players.summonPity, lastSummonId: players.lastSummonActionId })
      .from(players)
      .where(eq(players.id, playerId))
      .for('update');
    if (!player) throw AppError.notFound('No such player.');

    // A retried pull returns what the first one produced rather than spending again.
    if (player.lastSummonId && player.lastSummonId === actionId) {
      const replayed = await recentResults(tx, playerId, poolKey, count, content);
      const held = await itemQuantities(tx, playerId);
      return {
        results: replayed,
        banner: toBanner(pool, countersFor(player.pity, poolKey), held, rarityOf),
        sigilsHeld: held.get(pool.sigilKey) ?? 0,
      };
    }

    // Spend first. `grantItems` refuses to drive the stack negative, so an underfunded
    // pull fails here — before anything has been rolled or written.
    await grantItems(tx, playerId, { [pool.sigilKey]: -count }, `summon:${poolKey}`);

    const rng = createRng(randomInt(0, 2 ** 31 - 1));
    const counters = countersFor(player.pity, poolKey);
    const outcomes = rollMany(rng, pool, counters, count, rarityOf);
    if (outcomes.length === 0) {
      throw new AppError('CONTENT_STALE', 'That pool has no champions that can be summoned.');
    }

    const championContext = championContextFrom(content);
    const results: SummonResult[] = [];
    let latest: PityCounters = counters;

    for (const outcome of outcomes) {
      latest = outcome.counters;

      const owned = await tx
        .select({ id: playerChampions.id })
        .from(playerChampions)
        .where(
          and(
            eq(playerChampions.playerId, playerId),
            eq(playerChampions.championKey, outcome.championKey),
          ),
        );
      const isNew = owned.length === 0;

      // A full roster is a real state, not an error: the pull already happened, and
      // refusing it here would take the sigil and give nothing back.
      let rosterRow = null;
      try {
        const granted = await grantChampion(tx, playerId, outcome.championKey);
        const gear = await gearByChampion(tx, [granted.id]);
        const [row] = await tx
          .select()
          .from(playerChampions)
          .where(eq(playerChampions.id, granted.id));
        rosterRow = row ? toRosterChampion(row, gear.get(granted.id) ?? [], championContext) : null;
      } catch (cause) {
        if (!(cause instanceof AppError) || cause.code !== 'ROSTER_FULL') throw cause;
      }

      await tx.insert(summonHistory).values({
        playerId,
        poolKey,
        sigilItemKey: pool.sigilKey,
        championKey: outcome.championKey,
        rarity: outcome.rarity,
        fromMercy: outcome.fromMercy,
        pityAfter: outcome.counters,
        contentRev,
      });
      await see(tx, playerId, [outcome.championKey]);

      results.push({
        championKey: outcome.championKey,
        rarity: outcome.rarity,
        isNew,
        fromMercy: outcome.fromMercy,
        champion: rosterRow,
      });
    }

    const pity = { ...player.pity, [poolKey]: latest };
    await tx
      .update(players)
      .set({ summonPity: pity, lastSummonActionId: actionId, updatedAt: new Date() })
      .where(eq(players.id, playerId));

    const held = await itemQuantities(tx, playerId);
    return {
      results,
      banner: toBanner(pool, latest, held, rarityOf),
      sigilsHeld: held.get(pool.sigilKey) ?? 0,
    };
  });
}

/** The last `count` pulls on a pool, rebuilt as results — for an idempotent replay. */
async function recentResults(
  tx: Executor,
  playerId: string,
  poolKey: string,
  count: number,
  content: ContentCache,
): Promise<SummonResult[]> {
  const rows = await tx
    .select()
    .from(summonHistory)
    .where(and(eq(summonHistory.playerId, playerId), eq(summonHistory.poolKey, poolKey)))
    .orderBy(desc(summonHistory.createdAt))
    .limit(count);

  const context = championContextFrom(content);
  const results: SummonResult[] = [];

  for (const row of [...rows].reverse()) {
    const [owned] = await tx
      .select()
      .from(playerChampions)
      .where(
        and(
          eq(playerChampions.playerId, playerId),
          eq(playerChampions.championKey, row.championKey),
        ),
      );
    const gear = owned ? await gearByChampion(tx, [owned.id]) : new Map();
    results.push({
      championKey: row.championKey,
      rarity: row.rarity as Rarity,
      // A replay cannot know whether it was new the first time; reporting false is the
      // honest answer, since by now the player certainly owns it.
      isNew: false,
      fromMercy: row.fromMercy,
      champion: owned ? toRosterChampion(owned, gear.get(owned.id) ?? [], context) : null,
    });
  }
  return results;
}

// ── History ─────────────────────────────────────────────────────────────────

export async function history(
  db: Executor,
  playerId: string,
  limit = 50,
): Promise<SummonHistoryEntry[]> {
  const rows = await db
    .select()
    .from(summonHistory)
    .where(eq(summonHistory.playerId, playerId))
    .orderBy(desc(summonHistory.createdAt))
    .limit(Math.min(Math.max(limit, 1), 200));

  return rows.map((row) => ({
    id: row.id,
    poolKey: row.poolKey,
    championKey: row.championKey,
    rarity: row.rarity as Rarity,
    fromMercy: row.fromMercy,
    createdAt: row.createdAt.toISOString(),
  }));
}

// ── The Chronicle ───────────────────────────────────────────────────────────

/**
 * Records that the player has met these champions.
 *
 * Called on a summon and when a battle starts, so the Chronicle reads as a record of the
 * world rather than a list of receipts. The upsert does nothing on conflict, which keeps
 * `first_seen_at` meaning what it says.
 */
export async function see(
  tx: Executor,
  playerId: string,
  championKeys: readonly string[],
): Promise<void> {
  const unique = [...new Set(championKeys)];
  if (unique.length === 0) return;
  await tx
    .insert(championSightings)
    .values(unique.map((championKey) => ({ playerId, championKey })))
    .onConflictDoNothing();
}

export async function chronicle(
  db: Executor,
  playerId: string,
  content: ContentCache,
): Promise<Chronicle> {
  const champions = content.current().bundle.champions;

  const owned = await db
    .select({
      championKey: playerChampions.championKey,
      copies: sql<number>`count(*)::int`,
      bestRank: sql<number>`max(${playerChampions.rank})::int`,
    })
    .from(playerChampions)
    .where(eq(playerChampions.playerId, playerId))
    .groupBy(playerChampions.championKey);

  const seenRows = await db
    .select({ championKey: championSightings.championKey })
    .from(championSightings)
    .where(eq(championSightings.playerId, playerId));

  const ownedBy = new Map(owned.map((row) => [row.championKey, row]));
  const seen = new Set(seenRows.map((row) => row.championKey));

  const entries: ChronicleEntry[] = [...champions]
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
    .map((champion) => {
      const row = ownedBy.get(champion.key);
      return {
        championKey: champion.key,
        owned: row !== undefined,
        copies: row?.copies ?? 0,
        bestRank: row?.bestRank ?? 0,
        // Owning something implies having met it, even for a champion granted before
        // sightings were recorded.
        seen: row !== undefined || seen.has(champion.key),
      };
    });

  // Food units are excluded from the completion count: "37 of 37" has to mean the
  // roster, not the roster plus its fodder (GAME_DESIGN §10).
  const collectable = champions.filter((champion) => !champion.isFood).map((c) => c.key);
  const collectableSet = new Set(collectable);
  const ownedCount = entries.filter(
    (entry) => entry.owned && collectableSet.has(entry.championKey),
  ).length;

  return { entries, owned: ownedCount, total: collectable.length };
}

/** Marks the enemies and champions of a battle as seen. Cheap, and called on every start. */
export async function seeBattleUnits(
  tx: Executor,
  playerId: string,
  championKeys: readonly string[],
): Promise<void> {
  await see(tx, playerId, championKeys);
}

/** Which of these champions the player already owns — for the NEW badge on a banner. */
export async function ownedKeys(
  db: Executor,
  playerId: string,
  championKeys: readonly string[],
): Promise<Set<string>> {
  if (championKeys.length === 0) return new Set();
  const rows = await db
    .select({ championKey: playerChampions.championKey })
    .from(playerChampions)
    .where(
      and(
        eq(playerChampions.playerId, playerId),
        inArray(playerChampions.championKey, [...championKeys]),
      ),
    );
  return new Set(rows.map((row) => row.championKey));
}
