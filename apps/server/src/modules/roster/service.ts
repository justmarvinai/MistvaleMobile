import { and, eq, inArray } from 'drizzle-orm';
import { LEVEL_CAP_BY_RANK, type ChampionDef } from '@mistvale/shared';
import { playerChampions, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import { AppError } from '../../lib/errors';
import type { ContentCache } from '../../content/cache';

/**
 * The champions a player owns.
 *
 * A roster row is an *instance*: which champion, and how far this copy has been taken.
 * Everything else — stats, kit, art — is read from the published definition, so a balance
 * publish reaches every copy at once and nothing here needs migrating.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface RosterEntry {
  id: string;
  championKey: string;
  level: number;
  rank: number;
  ascension: number;
  xp: number;
  locked: boolean;
  favourite: boolean;
}

/** The highest level a champion of this rank may reach. */
export function levelCapForRank(rank: number): number {
  return LEVEL_CAP_BY_RANK[Math.min(Math.max(rank, 1), 6)] ?? 60;
}

export async function listRoster(db: Executor, playerId: string): Promise<RosterEntry[]> {
  return db
    .select({
      id: playerChampions.id,
      championKey: playerChampions.championKey,
      level: playerChampions.level,
      rank: playerChampions.rank,
      ascension: playerChampions.ascension,
      xp: playerChampions.xp,
      locked: playerChampions.locked,
      favourite: playerChampions.favourite,
    })
    .from(playerChampions)
    .where(eq(playerChampions.playerId, playerId));
}

/** Fetches specific owned champions, in the order the caller asked for them. */
export async function findOwned(
  db: Executor,
  playerId: string,
  ids: readonly string[],
): Promise<RosterEntry[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: playerChampions.id,
      championKey: playerChampions.championKey,
      level: playerChampions.level,
      rank: playerChampions.rank,
      ascension: playerChampions.ascension,
      xp: playerChampions.xp,
      locked: playerChampions.locked,
      favourite: playerChampions.favourite,
    })
    .from(playerChampions)
    .where(and(eq(playerChampions.playerId, playerId), inArray(playerChampions.id, [...ids])));

  const byId = new Map(rows.map((row) => [row.id, row]));
  return ids.map((id) => byId.get(id)).filter((row): row is RosterEntry => row !== undefined);
}

export interface GrantChampionOptions {
  level?: number;
  rank?: number;
  ascension?: number;
}

/**
 * Adds a champion to a roster.
 *
 * Capacity is checked here rather than at the call site so summoning, quest rewards and
 * the tutorial grant cannot each get it subtly different.
 */
export async function grantChampion(
  tx: Executor,
  playerId: string,
  championKey: string,
  options: GrantChampionOptions = {},
): Promise<RosterEntry> {
  const [player] = await tx
    .select({ rosterCapacity: players.rosterCapacity })
    .from(players)
    .where(eq(players.id, playerId));
  if (!player) throw AppError.notFound('No such player.');

  const owned = await tx
    .select({ id: playerChampions.id })
    .from(playerChampions)
    .where(eq(playerChampions.playerId, playerId));

  if (owned.length >= player.rosterCapacity) {
    throw new AppError('ROSTER_FULL', 'Your roster is full. Expand it or free a slot first.');
  }

  const rank = Math.min(Math.max(options.rank ?? 1, 1), 6);
  const level = Math.min(Math.max(options.level ?? 1, 1), levelCapForRank(rank));

  const [row] = await tx
    .insert(playerChampions)
    .values({
      playerId,
      championKey,
      level,
      rank,
      ascension: Math.min(Math.max(options.ascension ?? 0, 0), 6),
    })
    .returning({
      id: playerChampions.id,
      championKey: playerChampions.championKey,
      level: playerChampions.level,
      rank: playerChampions.rank,
      ascension: playerChampions.ascension,
      xp: playerChampions.xp,
      locked: playerChampions.locked,
      favourite: playerChampions.favourite,
    });

  if (!row) throw new AppError('INTERNAL', 'Could not add that champion.');
  return row;
}

/**
 * The champions a brand-new account starts with.
 *
 * Chosen from content rather than a hard-coded list: a champion becomes a starter by
 * being flagged `starter` in Admin, no code change (CLAUDE.md — content is data).
 */
export function starterChoices(content: ContentCache): ChampionDef[] {
  const snapshot = content.current();
  return snapshot.bundle.champions
    .filter((champion) => champion.starter && !champion.isFood)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
}

/**
 * Grants the chosen starter, plus the food units the tutorial hands over with it.
 *
 * Idempotent by construction: a player who already owns champions is left alone, so a
 * retried tutorial step cannot mint a second roster.
 */
export async function grantStarterPack(
  tx: Executor,
  playerId: string,
  content: ContentCache,
  starterKey: string,
): Promise<RosterEntry[]> {
  const existing = await tx
    .select({ id: playerChampions.id })
    .from(playerChampions)
    .where(eq(playerChampions.playerId, playerId));
  if (existing.length > 0) return listRoster(tx, playerId);

  const choices = starterChoices(content);
  const chosen = choices.find((champion) => champion.key === starterKey);
  if (!chosen) {
    throw new AppError('VALIDATION', 'That is not one of the available starters.');
  }

  return [await grantChampion(tx, playerId, chosen.key, { level: 1, rank: 1 })];
}
