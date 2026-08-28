import { and, eq, gte, sql } from 'drizzle-orm';
import {
  CURRENCIES,
  boostedChampionXp,
  extendXpBoost,
  splitRewards,
  type Currency,
} from '@mistvale/shared';
import { economyLog, playerChampions, playerItems, players } from '../../db/schema/index';
import type { Database } from '../../db/client';
import { AppError } from '../../lib/errors';
import { applyAccountXp, computeEnergy, energyCapForLevel } from '../../lib/progression';

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
  /**
   * Energy straight into the bar, **deliberately past the cap** (C24).
   *
   * The cap governs *regeneration* and nothing else: the clock stops filling at it, and a
   * grant does not. That asymmetry is the whole of the overflow rule, and it is what lets
   * the first week hand a new warden a few thousand points to spend at their own pace
   * rather than a bar that is full by breakfast and wasted by lunch.
   */
  energy?: number;
  /** Hours of champion-XP boost, extending whatever is already running. */
  xpBoostHours?: number;
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
      energy: players.energy,
      energyUpdatedAt: players.energyUpdatedAt,
      xpBoostUntil: players.xpBoostUntil,
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

  const now = new Date();

  /**
   * Everything that moves the energy bar, decided in one place.
   *
   * Two things can move it here and they compose rather than compete, which is why they
   * are not two blocks: a **level-up refills** to the new cap (ECONOMY_BALANCE §energy —
   * "level-up: full-bar refill, overfill allowed"), and an **energy reward** is added on
   * top of whatever is there, **past the cap on purpose** (C24). A grant that both levels
   * the account and pays energy must do both, and the old shape — a refill block that
   * returned early — could only do one.
   *
   * Written rather than derived because energy *is* the stored value plus elapsed time,
   * so the settled value has to be stamped with the instant it was reached. `settledAt`
   * carries the unfinished part of the current tick rather than rounding it away, which
   * would otherwise cost a player up to three minutes of regeneration every time any
   * reward at all landed.
   *
   * `Math.max` is the overfill rule: a bar already above the new cap must not be trimmed
   * by the good news of a level.
   */
  const energyGrant = Math.max(0, Math.floor(bundle.energy ?? 0));
  const movesEnergy = progressed.levelsGained > 0 || energyGrant > 0;
  const energyWrite = movesEnergy
    ? (() => {
        const current = computeEnergy({
          storedValue: player.energy,
          updatedAt: player.energyUpdatedAt,
          level: player.level,
          now,
        });
        const refilled =
          progressed.levelsGained > 0
            ? Math.max(current.value, energyCapForLevel(level))
            : current.value;
        return {
          energy: refilled + energyGrant,
          energyUpdatedAt: current.settledAt,
        };
      })()
    : {};
  if (energyGrant > 0) applied.energy = energyGrant;

  /**
   * The champion-XP boost, extended rather than replaced.
   *
   * A duration in the reward map — `{ xpBoostHours: 24 }` — so every content family that
   * pays anything can pay this too, with no mechanism of its own. The ceiling is content
   * as well, because an operator handing out a year of it by typo should produce a long
   * boost and not a permanent one.
   */
  const boostHours = Math.max(0, bundle.xpBoostHours ?? 0);
  const boostWrite =
    boostHours > 0
      ? {
          xpBoostUntil: extendXpBoost(player.xpBoostUntil, boostHours, now),
        }
      : {};
  if (boostHours > 0) applied.xpBoostHours = boostHours;

  await tx
    .update(players)
    .set({
      silver: wallet.silver,
      crystals: wallet.crystals,
      valorMedals: wallet.valorMedals,
      level,
      xp,
      ...energyWrite,
      ...boostWrite,
      updatedAt: now,
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
  /**
   * The account's champion-XP boost, as a multiplier.
   *
   * **Required, and deliberately so.** There is one caller today and a boost that a second
   * one forgot would be a feature that works everywhere except the mode somebody added
   * last — the class of bug `assembleChampion`'s required fifth argument was introduced to
   * make impossible (C10b). A default here would let a new call site silently disagree
   * with the badge the player is looking at. Pass 1 for a payout the boost must not touch.
   */
  boost: number,
): Promise<{ championId: string; level: number; xp: number; levelsGained: number }[]> {
  if (championIds.length === 0 || totalXp <= 0) return [];

  // Boosted on the **total** rather than per champion, so four champions split the same
  // pot they always did and the party's share of a boosted fight adds up to the figure
  // the result screen shows. Rounding per head would lose up to three points a fight.
  const each = Math.floor(boostedChampionXp(totalXp, boost) / championIds.length);
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

export interface PaidRewards {
  /** Everything applied, currencies and items together — what a screen shows. */
  applied: Record<string, number>;
  levelsGained: number;
  newLevel: number;
}

/**
 * Pays a content reward map — `{silver: 5000, sigil_gleaming: 1}` — in full.
 *
 * The one entry point for anything content authored as a flat map: quest and mission
 * rewards, stage first-clear bonuses, chapter star chests, the daily chest. It exists
 * because a map mixes two things that are stored in two different places, and every
 * caller that split them by hand got it subtly wrong in the same direction — folding the
 * map into a currency bundle and *silently discarding* every key it did not recognise. A
 * sigil written into a first-clear reward would validate, publish and pay nothing.
 *
 * Unknown keys are not tolerated here either, but they fail loudly: publish validation
 * resolves every non-currency key against the item catalogue, so the only way to reach
 * this with a bad key is an item deleted between publish and payout, and that is worth an
 * error rather than a shrug.
 */
export async function payRewards(
  tx: Executor,
  playerId: string,
  rewards: Readonly<Record<string, number>>,
  source: string,
  knownItem?: (itemKey: string) => boolean,
): Promise<PaidRewards> {
  const { scalars, items } = splitRewards(rewards);

  if (knownItem) {
    for (const itemKey of Object.keys(items)) {
      if (!knownItem(itemKey)) {
        throw AppError.internal(`Reward names an item that no longer exists: ${itemKey}.`);
      }
    }
  }

  const granted = await grant(tx, playerId, scalars, source);
  const grantedItems = await grantItems(tx, playerId, items, source);

  return {
    applied: { ...granted.applied, ...grantedItems },
    levelsGained: granted.levelsGained,
    newLevel: granted.newLevel,
  };
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
