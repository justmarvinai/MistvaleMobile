import { and, count, desc, eq } from 'drizzle-orm';
import type {
  AdminBattleDetail,
  AdminBattleList,
  AdminBattleQuery,
  AdminBattleUnit,
} from '@mistvale/shared';
import type { Database } from '../db/client';
import { battleSessions, players } from '../db/schema/index';
import { AppError } from '../lib/errors';

/**
 * The battle inspector's reads (ADMIN_SUITE_DESIGN §2.18).
 *
 * The debugging tool for "that fight felt wrong", and it can exist at all because a battle
 * *is* its event log: the engine is deterministic given a seed, the server stores the whole
 * log on the row, and the client only ever renders it. An operator looking at this is
 * looking at exactly what the player saw rather than at a reconstruction — which is the
 * whole point, since a reconstruction could differ in precisely the case being asked about.
 *
 * Read-only by construction. There is no write path in this module and there should never
 * be one: a battle row is the record of something that already happened.
 */

/** The unit list, read off the log's opening snapshot rather than off the final board. */
function unitsFrom(events: unknown[], side: 'ally' | 'enemy'): AdminBattleUnit[] {
  const opening = events.find(
    (event): event is { type: string; allies?: unknown[]; enemies?: unknown[] } =>
      typeof event === 'object' &&
      event !== null &&
      (event as { type?: string }).type === 'battleStart',
  );
  const list = (side === 'ally' ? opening?.allies : opening?.enemies) ?? [];
  return list.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const unit = entry as {
      ref?: { side?: string; slot?: number };
      defKey?: string;
      name?: string;
    };
    return [
      {
        side: unit.ref?.side ?? side,
        slot: unit.ref?.slot ?? 0,
        defKey: unit.defKey ?? '',
        name: unit.name ?? unit.defKey ?? '',
      },
    ];
  });
}

/** How many turns the fight ran, from the state the row carries. */
function turnsOf(state: unknown): number {
  if (typeof state !== 'object' || state === null) return 0;
  const turn = (state as { turn?: unknown }).turn;
  return typeof turn === 'number' ? turn : 0;
}

export async function listBattles(db: Database, query: AdminBattleQuery): Promise<AdminBattleList> {
  const clauses = [];
  if (query.playerId) clauses.push(eq(battleSessions.playerId, query.playerId));
  if (query.mode) clauses.push(eq(battleSessions.mode, query.mode));
  const where = clauses.length > 0 ? and(...clauses) : undefined;

  const rows = await db
    .select({
      id: battleSessions.id,
      playerId: battleSessions.playerId,
      profileName: players.profileName,
      mode: battleSessions.mode,
      stageKey: battleSessions.stageKey,
      status: battleSessions.status,
      outcome: battleSessions.outcome,
      state: battleSessions.state,
      createdAt: battleSessions.createdAt,
      finishedAt: battleSessions.finishedAt,
    })
    .from(battleSessions)
    .leftJoin(players, eq(players.id, battleSessions.playerId))
    .where(where)
    // Newest first, and the id as a tiebreak: two fights started in the same millisecond
    // would otherwise page inconsistently, which is how a row gets shown twice.
    .orderBy(desc(battleSessions.createdAt), desc(battleSessions.id))
    .limit(query.limit)
    .offset(query.offset);

  const [totals] = await db.select({ total: count() }).from(battleSessions).where(where);

  return {
    battles: rows.map((row) => ({
      id: row.id,
      playerId: row.playerId,
      profileName: row.profileName,
      mode: row.mode,
      stageKey: row.stageKey,
      status: row.status,
      outcome: row.outcome,
      turns: turnsOf(row.state),
      createdAt: row.createdAt.toISOString(),
      finishedAt: row.finishedAt?.toISOString() ?? null,
    })),
    total: totals?.total ?? 0,
  };
}

export async function battleDetail(db: Database, id: string): Promise<AdminBattleDetail> {
  const [row] = await db
    .select({
      id: battleSessions.id,
      playerId: battleSessions.playerId,
      profileName: players.profileName,
      mode: battleSessions.mode,
      stageKey: battleSessions.stageKey,
      contentRev: battleSessions.contentRev,
      seed: battleSessions.seed,
      energySpent: battleSessions.energySpent,
      status: battleSessions.status,
      outcome: battleSessions.outcome,
      state: battleSessions.state,
      events: battleSessions.events,
      rewards: battleSessions.rewards,
      createdAt: battleSessions.createdAt,
      finishedAt: battleSessions.finishedAt,
    })
    .from(battleSessions)
    .leftJoin(players, eq(players.id, battleSessions.playerId))
    .where(eq(battleSessions.id, id))
    .limit(1);

  if (!row) throw AppError.notFound(`No battle "${id}".`);
  const events = Array.isArray(row.events) ? (row.events as unknown[]) : [];

  return {
    id: row.id,
    playerId: row.playerId,
    profileName: row.profileName,
    mode: row.mode,
    stageKey: row.stageKey,
    contentRev: row.contentRev,
    seed: row.seed,
    energySpent: row.energySpent,
    status: row.status,
    outcome: row.outcome,
    turns: turnsOf(row.state),
    allies: unitsFrom(events, 'ally'),
    enemies: unitsFrom(events, 'enemy'),
    events,
    rewards: row.rewards,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
  };
}
