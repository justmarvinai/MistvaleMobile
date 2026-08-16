import { and, eq, gte, sql } from 'drizzle-orm';
import { CURRENCIES, type Currency } from '@mistvale/shared';
import { economyLog, playerChampions, playerItems, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import { AppError } from '../../lib/errors';
import { applyAccountXp } from '../../lib/progression';

/** Anything that can run a query: the pool, or a transaction inside it. */
type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * The one way resources move.
 *
 * Every grant and every spend in the game goes through here (CLAUDE.md conventions), for
 * two reasons: a single place enforces the floors — no negative wallet, no level past the
 * cap — and every movement lands in `economy_log`, which is what makes an economy
 * auditable later. A route that touches `players.silver` directly is a bug.
 *
 * Always call inside the caller's transaction, holding the player row lock, so a grant
 * and the thing that earned it commit together or not at all.
 */

export interface RewardBundle {
  silver?: number;
  crystals?: number;
  valorMedals?: number;
  /** Account XP, which may carry the player up several levels. */
  playerXp?: number;
  /** Champion XP, split across the champions that fought. */
  championXp?: number;
}

export interface GrantResult {
  /** Signed deltas actually applied, after clamping. */
  applied: Record<string, number>;
  levelsGained: number;
  newLevel: number;
}

function isCurrency(key: string): key is Currency {
  return (CURRENCIES as readonly string[]).includes(key);
}

/**
 * Applies a bundle to a player and records it.
 *
 * `source` is what the audit trail will show — `battle:c01_s3_normal`, `summon:gleaming`,
 * `admin:marvin`. Make it specific: a row reading "battle" tells nobody anything a year
 * from now.
 */
export async function grant(
  tx: Executor,
  playerId: string,
  bundle: RewardBundle,
  source: string,
): Promise<GrantResult> {
  const [player] = await tx
    .select({
      level: players.level,
      xp: players.xp,
      silver: players.silver,
      crystals: players.crystals,
      valorMedals: players.valorMedals,
    })
    .from(players)
    .where(eq(players.id, playerId));

  if (!player) throw AppError.notFound('No such player.');

  const applied: Record<string, number> = {};

  const wallet: Record<Currency, number> = {
    silver: player.silver,
    crystals: player.crystals,
    valorMedals: player.valorMedals,
  };

  for (const currency of CURRENCIES) {
    const delta = bundle[currency] ?? 0;
    if (delta === 0) continue;
    const next = wallet[currency] + delta;
    if (next < 0) {
      throw new AppError('INSUFFICIENT_FUNDS', `Not enough ${currency}.`);
    }
    wallet[currency] = next;
    applied[currency] = delta;
  }

  // Account XP can carry several levels at once; the curve lives in progression.ts.
  if (bundle.playerXp) applied.playerXp = bundle.playerXp;
  const progressed = applyAccountXp(player, bundle.playerXp ?? 0);
  const { level, xp } = progressed;

  await tx
    .update(players)
    .set({
      silver: wallet.silver,
      crystals: wallet.crystals,
      valorMedals: wallet.valorMedals,
      level,
      xp,
      updatedAt: new Date(),
    })
    .where(eq(players.id, playerId));

  if (bundle.championXp) applied.championXp = bundle.championXp;

  if (Object.keys(applied).length > 0) {
    await tx.insert(economyLog).values({ playerId, source, deltas: applied });
  }

  return { applied, levelsGained: progressed.levelsGained, newLevel: level };
}

/** Convenience for spends: the same path, with the signs flipped. */
export async function spend(
  tx: Executor,
  playerId: string,
  cost: Partial<Record<Currency, number>>,
  source: string,
): Promise<GrantResult> {
  const bundle: RewardBundle = {};
  for (const [currency, amount] of Object.entries(cost)) {
    if (!isCurrency(currency) || !amount) continue;
    bundle[currency] = -Math.abs(amount);
  }
  return grant(tx, playerId, bundle, source);
}

/**
 * Splits champion XP across the champions that fought and levels them up.
 *
 * A champion's level is capped by its star rank (`LEVEL_CAP_BY_RANK`), so XP earned past
 * the cap is held rather than lost — ranking the champion up releases it.
 */
export async function grantChampionXp(
  tx: Executor,
  championIds: readonly string[],
  totalXp: number,
  levelCapFor: (rank: number) => number,
): Promise<{ championId: string; level: number; xp: number; levelsGained: number }[]> {
  if (championIds.length === 0 || totalXp <= 0) return [];

  const each = Math.floor(totalXp / championIds.length);
  if (each <= 0) return [];

  const results: { championId: string; level: number; xp: number; levelsGained: number }[] = [];

  for (const championId of championIds) {
    const [owned] = await tx
      .select({
        id: playerChampions.id,
        level: playerChampions.level,
        rank: playerChampions.rank,
        xp: playerChampions.xp,
      })
      .from(playerChampions)
      .where(eq(playerChampions.id, championId));
    if (!owned) continue;

    const cap = levelCapFor(owned.rank);
    let level = owned.level;
    let xp = owned.xp + each;
    const startingLevel = level;

    while (level < cap) {
      const needed = championXpToNextLevel(level);
      if (xp < needed) break;
      xp -= needed;
      level += 1;
    }

    await tx
      .update(playerChampions)
      .set({ level, xp, updatedAt: new Date() })
      .where(eq(playerChampions.id, championId));

    results.push({ championId, level, xp, levelsGained: level - startingLevel });
  }

  return results;
}

/**
 * XP a champion needs for its next level.
 *
 * Steeper than the account curve on purpose: levelling a champion is the sink food units
 * and campaign farming feed (docs/ECONOMY_BALANCE.md).
 */
export function championXpToNextLevel(level: number): number {
  return Math.round(180 * Math.pow(1.16, Math.max(0, level - 1)));
}

/**
 * Adds to (or takes from) a player's stackable items.
 *
 * Same contract as `grant`: it enforces the floor, it writes to `economy_log`, and it is
 * the only way `player_items` moves. Quantities are signed, so a tome spend and a drop
 * grant are the same call with opposite signs and one audit row each.
 *
 * The upsert is `on conflict do update` against the unique `(player_id, item_key)` index
 * rather than a read-then-write, so two concurrent grants cannot lose one another.
 */
export async function grantItems(
  tx: Executor,
  playerId: string,
  items: Readonly<Record<string, number>>,
  source: string,
): Promise<Record<string, number>> {
  const applied: Record<string, number> = {};
  const entries = Object.entries(items).filter(([, quantity]) => quantity !== 0);
  if (entries.length === 0) return applied;

  for (const [itemKey, quantity] of entries) {
    if (quantity > 0) {
      await tx
        .insert(playerItems)
        .values({ playerId, itemKey, quantity })
        .onConflictDoUpdate({
          target: [playerItems.playerId, playerItems.itemKey],
          set: { quantity: sql`${playerItems.quantity} + ${quantity}`, updatedAt: new Date() },
        });
      applied[itemKey] = quantity;
      continue;
    }

    // A spend must not drive the stack negative. The `where` makes the check and the
    // write one statement, so a double-spend races to zero rows rather than to −1.
    const needed = Math.abs(quantity);
    const updated = await tx
      .update(playerItems)
      .set({ quantity: sql`${playerItems.quantity} - ${needed}`, updatedAt: new Date() })
      .where(
        and(
          eq(playerItems.playerId, playerId),
          eq(playerItems.itemKey, itemKey),
          gte(playerItems.quantity, needed),
        ),
      )
      .returning({ id: playerItems.id });

    if (updated.length === 0) {
      throw new AppError('INSUFFICIENT_FUNDS', `Not enough ${itemKey}.`);
    }
    applied[itemKey] = quantity;
  }

  await tx.insert(economyLog).values({ playerId, source, deltas: applied });
  return applied;
}

/** How many of an item a player holds. */
export async function itemQuantities(tx: Executor, playerId: string): Promise<Map<string, number>> {
  const rows = await tx
    .select({ itemKey: playerItems.itemKey, quantity: playerItems.quantity })
    .from(playerItems)
    .where(eq(playerItems.playerId, playerId));
  return new Map(rows.map((row) => [row.itemKey, row.quantity]));
}

/** Rolls a stage's silver payout. Uses the caller's seeded RNG so a replay pays the same. */
export function rollSilver(min: number, max: number, roll: () => number): number {
  if (max <= min) return Math.max(0, min);
  return min + Math.floor(roll() * (max - min + 1));
}

/** Marks a source string for the economy log. */
export function battleSource(mode: string, stageKey: string): string {
  return `battle:${mode}:${stageKey}`;
}
