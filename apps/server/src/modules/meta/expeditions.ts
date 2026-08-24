import { and, eq } from 'drizzle-orm';
import {
  NO_EXPEDITIONS,
  UNLOCK_LEVELS,
  expeditionYield,
  favourMet,
  type ChampionDef,
  type ExpeditionDef,
  type ExpeditionFavourState,
  type ExpeditionOffer,
  type ExpeditionRun,
  type ExpeditionState,
  type FavourCandidate,
} from '@mistvale/shared';
import { playerChampions, playerExpeditions } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import type { PlayerExpeditionRow } from '../../db/schema/meta';
import { AppError } from '../../lib/errors';
import { payRewards } from '../rewards/service';
import { track } from './progress';

/**
 * Expeditions: champions sent away, and unavailable while they are gone.
 *
 * The unavailability *is* the feature. Every other system in Mistvale asks about four
 * champions; this asks about the fifth and sixth, because sending two away for eight hours
 * costs two you cannot field. That is what makes a broad roster worth having, and it is
 * why `awayChampionIds` is on the state read rather than being something a screen works out.
 *
 * **Away means unavailable, not untouchable** — an away champion can still be levelled,
 * ranked, ascended and re-geared. They are working, not gone.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface ExpeditionContext {
  db: Database;
  content: ContentCache;
}

/** How many expeditions may run at once. Operator-editable, like every other cap. */
export function slotsFor(config: Readonly<Record<string, unknown>>): number {
  const value = config['expedition.slots'];
  return typeof value === 'number' && Number.isInteger(value) && value > 0 ? value : 3;
}

function published(content: ContentCache): ExpeditionDef[] {
  return [...content.current().bundle.expeditions].sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * Every champion that is away right now, for this account.
 *
 * The one function every other module asks. Kept here rather than duplicated at the six
 * places that field or consume a champion, so "away" has exactly one definition.
 */
export async function awayChampionIds(tx: Executor, playerId: string): Promise<Set<string>> {
  const rows = await tx
    .select({ championIds: playerExpeditions.championIds })
    .from(playerExpeditions)
    .where(eq(playerExpeditions.playerId, playerId));
  return new Set(rows.flatMap((row) => row.championIds));
}

/**
 * Refuses if any of these champions is away.
 *
 * Called from every path that *fields or consumes* a champion — a battle, an arena defence,
 * food, a release. Deliberately **not** called from the upgrade paths: investing in a
 * champion that is away is fine, and blocking it would be friction with no design behind it.
 */
export async function assertAvailable(
  tx: Executor,
  playerId: string,
  championIds: readonly string[],
): Promise<void> {
  if (championIds.length === 0) return;
  const away = await awayChampionIds(tx, playerId);
  const blocked = championIds.filter((id) => away.has(id));
  if (blocked.length === 0) return;
  throw new AppError(
    'VALIDATION',
    blocked.length === 1
      ? 'That champion is away on an expedition. Recall them first.'
      : `${blocked.length} of those champions are away on expeditions. Recall them first.`,
  );
}

// ── Reading the state ───────────────────────────────────────────────────────

function toRun(row: PlayerExpeditionRow, now: Date): ExpeditionRun {
  return {
    id: row.id,
    expeditionKey: row.expeditionKey,
    championIds: row.championIds,
    startedAt: row.startedAt.toISOString(),
    readyAt: row.readyAt.toISOString(),
    // The server's answer, never the client's — a clock a player can set is a clock a
    // player can skip an eight-hour wait with.
    ready: row.readyAt.getTime() <= now.getTime(),
    rewards: row.rewards,
    favours: row.favours,
  };
}

export async function stateFor(
  ctx: ExpeditionContext,
  playerId: string,
  playerLevel: number,
  now: Date,
): Promise<ExpeditionState> {
  if (playerLevel < UNLOCK_LEVELS.expeditions) return NO_EXPEDITIONS;

  const bundle = ctx.content.current().bundle;
  const slots = slotsFor(bundle.config);
  const rows = await ctx.db
    .select()
    .from(playerExpeditions)
    .where(eq(playerExpeditions.playerId, playerId))
    .orderBy(playerExpeditions.readyAt);

  const running = rows.map((row) => toRun(row, now));
  const away = new Set(running.flatMap((run) => run.championIds));

  const offers: ExpeditionOffer[] = published(ctx.content)
    .filter((def) => playerLevel >= def.unlockLevel)
    .map((def) => ({
      key: def.key,
      name: def.name,
      description: def.description,
      hours: def.hours,
      partySize: def.partySize,
      unlockLevel: def.unlockLevel,
      icon: def.icon,
      rewards: def.rewards,
      favours: def.favours.map((favour) => ({
        kind: favour.kind,
        value: favour.value,
        bonusPct: favour.bonusPct,
      })),
      blockedReason:
        running.length >= slots
          ? `Every party is out. Bring one home first — you may run ${slots} at once.`
          : null,
    }));

  return {
    offers,
    running,
    slots,
    slotsUsed: running.length,
    awayChampionIds: [...away],
  };
}

// ── Sending one ─────────────────────────────────────────────────────────────

/** What a champion offers a favour, off its published definition. */
function candidateOf(def: ChampionDef): FavourCandidate {
  return {
    factionKey: def.factionKey,
    element: def.element,
    role: def.role,
    rarity: def.rarity,
  };
}

export async function dispatch(
  ctx: ExpeditionContext,
  playerId: string,
  playerLevel: number,
  expeditionKey: string,
  championIds: readonly string[],
  now: Date,
): Promise<ExpeditionState> {
  if (playerLevel < UNLOCK_LEVELS.expeditions) {
    throw new AppError(
      'LOCKED_CONTENT',
      `Expeditions open at account level ${UNLOCK_LEVELS.expeditions}.`,
    );
  }

  const bundle = ctx.content.current().bundle;
  const def = bundle.expeditions.find((entry) => entry.key === expeditionKey);
  if (!def) throw AppError.notFound('No such expedition.');
  if (playerLevel < def.unlockLevel) {
    throw new AppError('LOCKED_CONTENT', `That expedition opens at level ${def.unlockLevel}.`);
  }
  if (championIds.length !== def.partySize) {
    throw new AppError(
      'VALIDATION',
      `${def.name} takes a party of ${def.partySize}. You chose ${championIds.length}.`,
    );
  }
  if (new Set(championIds).size !== championIds.length) {
    throw new AppError('VALIDATION', 'A champion cannot be sent twice on the same expedition.');
  }

  await ctx.db.transaction(async (tx) => {
    const slots = slotsFor(bundle.config);
    const inFlight = await tx
      .select({ id: playerExpeditions.id })
      .from(playerExpeditions)
      .where(eq(playerExpeditions.playerId, playerId));
    if (inFlight.length >= slots) {
      throw new AppError('VALIDATION', `Only ${slots} expeditions may run at once.`);
    }

    // Owned, and not already away — checked in one place before anything is written.
    const owned = await tx
      .select({ id: playerChampions.id, championKey: playerChampions.championKey })
      .from(playerChampions)
      .where(eq(playerChampions.playerId, playerId));
    const ownedById = new Map(owned.map((row) => [row.id, row.championKey]));
    for (const id of championIds) {
      if (!ownedById.has(id)) throw AppError.notFound('One of those champions is not yours.');
    }
    await assertAvailable(tx, playerId, championIds);

    const champions = new Map(bundle.champions.map((entry) => [entry.key, entry]));
    const party: FavourCandidate[] = [];
    for (const id of championIds) {
      const championDef = champions.get(ownedById.get(id) as string);
      // A champion whose definition has gone stale can still be sent — it is a copy the
      // player owns — it simply cannot satisfy a favour *about* its definition.
      if (championDef) party.push(candidateOf(championDef));
    }

    const favours: ExpeditionFavourState[] = def.favours.map(
      (favour: ExpeditionDef['favours'][number]) => ({
        kind: favour.kind,
        value: favour.value,
        bonusPct: favour.bonusPct,
        met: favourMet(favour, party),
      }),
    );

    await tx.insert(playerExpeditions).values({
      playerId,
      expeditionKey: def.key,
      championIds: [...championIds],
      // Fixed now, not at claim: the favours this party met were true when it left, and a
      // content edit six hours later must not change what somebody was promised.
      rewards: expeditionYield(def.rewards, favours),
      favours,
      startedAt: now,
      readyAt: new Date(now.getTime() + def.hours * 60 * 60 * 1000),
    });
  });

  return stateFor(ctx, playerId, playerLevel, now);
}

// ── Bringing them home ──────────────────────────────────────────────────────

export interface ClaimOutcome {
  rewards: Record<string, number>;
  championIds: string[];
}

export async function claim(
  ctx: ExpeditionContext,
  playerId: string,
  runId: string,
  now: Date,
): Promise<ClaimOutcome> {
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(playerExpeditions)
      .where(and(eq(playerExpeditions.id, runId), eq(playerExpeditions.playerId, playerId)))
      .for('update');
    if (!row) throw AppError.notFound('No such expedition.');
    if (row.readyAt.getTime() > now.getTime()) {
      throw new AppError('COOLDOWN', 'They are not back yet.');
    }

    // Deleted first, inside the same transaction: a double-tap that got past the row lock
    // would otherwise pay twice, and the row *is* the receipt.
    await tx.delete(playerExpeditions).where(eq(playerExpeditions.id, runId));

    const known = new Set(ctx.content.current().bundle.items.map((item) => item.key));
    const paid = await payRewards(
      tx,
      playerId,
      row.rewards,
      `expedition:${row.expeditionKey}`,
      (key) => known.has(key),
    );
    await track(tx, ctx, playerId, [{ type: 'expeditionClaim', amount: 1 }]);

    return { rewards: paid.applied, championIds: row.championIds };
  });
}

/**
 * Brings a party home early, for nothing.
 *
 * Exists because a misclick otherwise costs twelve hours of a champion, and because a
 * player who suddenly needs that champion for an arena run should be able to choose to
 * lose the yield rather than be locked out of the game they are playing.
 */
export async function recall(
  ctx: ExpeditionContext,
  playerId: string,
  runId: string,
): Promise<string[]> {
  return ctx.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(playerExpeditions)
      .where(and(eq(playerExpeditions.id, runId), eq(playerExpeditions.playerId, playerId)))
      .for('update');
    if (!row) throw AppError.notFound('No such expedition.');
    if (row.readyAt.getTime() <= Date.now()) {
      // Recalling a finished run would throw away rewards the player has already earned,
      // which no misclick should be able to do.
      throw new AppError('VALIDATION', 'They are already back. Collect what they brought.');
    }
    await tx.delete(playerExpeditions).where(eq(playerExpeditions.id, runId));
    return row.championIds;
  });
}
