import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  MASTERY_PICKS_BY_TIER,
  MASTERY_TREES,
  canTakeMastery,
  tallyMasteries,
  type MasteryDef,
  type MasteryEffect,
  type MasteryState,
  type MasteryTree,
  type Stat,
} from '@mistvale/shared';
import { playerChampions } from '../../db/schema/index';
import type { Database } from '../../db/client';
import type { ContentCache } from '../../content/cache';
import { AppError } from '../../lib/errors';
import * as rewards from '../rewards/service';

/**
 * Masteries.
 *
 * Two jobs, and they are deliberately separate. Deciding whether a node *may* be taken is
 * the build rules, and those live in shared so the tree screen greys out exactly what the
 * server refuses. Deciding what a node *does* is this module: it resolves a champion's
 * learned nodes into the flat effect list the engine reads, and folds everything that can
 * be settled before a fight into the champion's stats — the same road relics take, which
 * is why the champion screen can show what masteries are worth.
 */

type Executor = Database | Parameters<Parameters<Database['transaction']>[0]>[0];

export interface MasteryCosts {
  /** Emblem item key and quantity per tier. Index 0 is unused. */
  byTier: Readonly<Record<number, { itemKey: string; amount: number }>>;
  /** Crystals for the second and every later reset. */
  resetCrystals: number;
  /** Account level a champion's trainer opens at. */
  unlockLevel: number;
}

const DEFAULT_COSTS: MasteryCosts = Object.freeze({
  byTier: Object.freeze({
    1: { itemKey: 'emblem_bronze', amount: 20 },
    2: { itemKey: 'emblem_bronze', amount: 20 },
    3: { itemKey: 'emblem_silver', amount: 100 },
    4: { itemKey: 'emblem_silver', amount: 100 },
    5: { itemKey: 'emblem_gold', amount: 150 },
    6: { itemKey: 'emblem_gold', amount: 500 },
  }),
  resetCrystals: 150,
  unlockLevel: 14,
});

/**
 * Reads the mastery economy out of published config.
 *
 * Falls back per field rather than wholesale: an operator who edits the reset price and
 * fat-fingers the tier table should lose the table, not the price.
 */
export function costsFrom(config: Readonly<Record<string, unknown>>): MasteryCosts {
  const table = config['economy.masteryCosts'];
  const byTier: Record<number, { itemKey: string; amount: number }> = { ...DEFAULT_COSTS.byTier };

  if (table && typeof table === 'object' && !Array.isArray(table)) {
    for (const [tier, value] of Object.entries(table as Record<string, unknown>)) {
      const parsed = Number.parseInt(tier, 10);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 6) continue;
      if (!value || typeof value !== 'object') continue;
      const entry = value as { itemKey?: unknown; amount?: unknown };
      if (typeof entry.itemKey !== 'string' || typeof entry.amount !== 'number') continue;
      byTier[parsed] = { itemKey: entry.itemKey, amount: Math.max(0, Math.round(entry.amount)) };
    }
  }

  const number = (key: string, fallback: number): number => {
    const value = config[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  };

  return {
    byTier,
    resetCrystals: number('economy.masteryResetCrystals', DEFAULT_COSTS.resetCrystals),
    unlockLevel: number('unlocks.masteryLevel', DEFAULT_COSTS.unlockLevel),
  };
}

/** Published nodes by key. */
export function nodesFrom(content: ContentCache): Map<string, MasteryDef> {
  return new Map(content.current().bundle.masteries.map((node) => [node.key, node]));
}

// ── What a build is worth ───────────────────────────────────────────────────

export interface ResolvedMasteries {
  /** Flat stat additions, ready to add alongside gear. */
  bonuses: Partial<Record<Stat, number>>;
  /** Percentage additions against the champion's base stats, applied by the caller. */
  percentages: Partial<Record<Stat, number>>;
  /** How much relic set bonuses are amplified, as a percentage. */
  setBonusAmplifyPct: number;
  /** Everything the engine has to evaluate during a fight. */
  battleEffects: MasteryEffect[];
}

/**
 * Splits a learned build into the part that can be settled now and the part that cannot.
 *
 * An unconditional `+75 ATK` is knowable the moment a node is learned, so it becomes a
 * number on the champion screen and never costs the engine a thought. `+15% DEF while
 * unbuffed` is not knowable until something is happening, so it rides into the battle.
 * Getting that split right is what keeps the displayed stats honest *and* the simulation
 * cheap.
 */
export function resolveMasteries(
  chosen: readonly string[],
  nodes: ReadonlyMap<string, MasteryDef>,
): ResolvedMasteries {
  const bonuses: Partial<Record<Stat, number>> = {};
  const percentages: Partial<Record<Stat, number>> = {};
  const battleEffects: MasteryEffect[] = [];
  let setBonusAmplifyPct = 0;

  for (const key of chosen) {
    const node = nodes.get(key);
    if (!node) continue; // Content moved on; the pick simply stops doing anything.

    for (const effect of node.effects) {
      if (effect.type === 'setBonusAmplify') {
        setBonusAmplifyPct += effect.pct;
        continue;
      }
      if (effect.type === 'stat' && !effect.condition) {
        if (effect.flat !== 0) bonuses[effect.stat] = (bonuses[effect.stat] ?? 0) + effect.flat;
        if (effect.pct !== 0) {
          percentages[effect.stat] = (percentages[effect.stat] ?? 0) + effect.pct;
        }
        continue;
      }
      battleEffects.push(effect);
    }
  }

  return { bonuses, percentages, setBonusAmplifyPct, battleEffects };
}

/**
 * Folds a resolved build into a stat block.
 *
 * Percentages are taken against the champion's *base* stats, exactly as relic percentages
 * are — otherwise Stonefoot would be worth more on a champion wearing an HP relic than on
 * one that is not, which is not what "+10% health" says.
 */
export function applyMasteryStats(
  base: Readonly<Record<Stat, number>>,
  resolved: ResolvedMasteries,
): Partial<Record<Stat, number>> {
  const total: Partial<Record<Stat, number>> = { ...resolved.bonuses };
  for (const [stat, pct] of Object.entries(resolved.percentages) as [Stat, number][]) {
    total[stat] = Math.round((total[stat] ?? 0) + (base[stat] * pct) / 100);
  }
  return total;
}

// ── The player-facing state ─────────────────────────────────────────────────

export function stateFor(
  champion: { masteries: string[]; masteryResets: number; level: number },
  nodes: ReadonlyMap<string, MasteryDef>,
  costs: MasteryCosts,
  playerLevel: number,
): MasteryState {
  const tally = tallyMasteries(champion.masteries, nodes);
  const remainingByTier: Record<string, number> = {};
  for (let tier = 1; tier <= 6; tier += 1) {
    remainingByTier[String(tier)] = Math.max(
      0,
      (MASTERY_PICKS_BY_TIER[tier] ?? 0) - (tally.byTier[tier] ?? 0),
    );
  }

  const unlocked = playerLevel >= costs.unlockLevel;
  return {
    chosen: [...champion.masteries],
    remainingByTier,
    openTrees: MASTERY_TREES.filter((tree: MasteryTree) => tally.byTree[tree] > 0),
    resetCost: champion.masteryResets === 0 ? 0 : costs.resetCrystals,
    unlocked,
    lockedReason: unlocked ? null : `Masteries open at account level ${costs.unlockLevel}.`,
  };
}

// ── Spending ────────────────────────────────────────────────────────────────

export interface LearnOutcome {
  chosen: string[];
  /** What the node cost, for the results line. */
  spent: { itemKey: string; amount: number };
}

/**
 * Learns one node.
 *
 * Refuses before it spends, in this order: the trainer has to be open, the node has to
 * exist, the build rules have to allow it, and only then are emblems taken. A player who
 * cannot afford a node they were allowed to pick is told what it costs rather than being
 * charged for half of it.
 */
export async function learn(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  options: {
    playerId: string;
    playerLevel: number;
    championId: string;
    nodeKey: string;
    nodes: ReadonlyMap<string, MasteryDef>;
    costs: MasteryCosts;
  },
): Promise<LearnOutcome> {
  if (options.playerLevel < options.costs.unlockLevel) {
    throw new AppError(
      'LOCKED_CONTENT',
      `Masteries open at account level ${options.costs.unlockLevel}.`,
    );
  }

  const node = options.nodes.get(options.nodeKey);
  if (!node) throw AppError.notFound(`No mastery "${options.nodeKey}".`);

  const [champion] = await tx
    .select()
    .from(playerChampions)
    .where(
      and(
        eq(playerChampions.id, options.championId),
        eq(playerChampions.playerId, options.playerId),
      ),
    )
    .for('update');
  if (!champion) throw AppError.notFound('You do not own that champion.');

  const check = canTakeMastery(node, champion.masteries, options.nodes);
  if (!check.ok) throw new AppError('VALIDATION', check.reason ?? 'That mastery cannot be taken.');

  const cost = options.costs.byTier[node.tier];
  if (!cost) throw new AppError('CONTENT_STALE', `Tier ${node.tier} has no published cost.`);

  if (cost.amount > 0) {
    // `grantItems` with a negative quantity is the spend path: it refuses in one
    // statement rather than reading then writing, so a double-tap cannot go negative.
    await rewards.grantItems(
      tx,
      options.playerId,
      { [cost.itemKey]: -cost.amount },
      `mastery:${node.key}`,
    );
  }

  const chosen = [...champion.masteries, node.key];
  await tx
    .update(playerChampions)
    .set({ masteries: chosen, updatedAt: new Date() })
    .where(eq(playerChampions.id, options.championId));

  return { chosen, spent: cost };
}

/**
 * Unlearns everything.
 *
 * The first reset on a champion is free, source-faithful: a player experimenting with
 * their first build should not be taxed for learning what the trees do.
 */
export async function reset(
  tx: Parameters<Parameters<Database['transaction']>[0]>[0],
  options: { playerId: string; championId: string; costs: MasteryCosts },
): Promise<{ crystalsSpent: number }> {
  const [champion] = await tx
    .select()
    .from(playerChampions)
    .where(
      and(
        eq(playerChampions.id, options.championId),
        eq(playerChampions.playerId, options.playerId),
      ),
    )
    .for('update');
  if (!champion) throw AppError.notFound('You do not own that champion.');
  if (champion.masteries.length === 0) {
    throw new AppError('VALIDATION', 'That champion has learned nothing to forget.');
  }

  const crystalsSpent = champion.masteryResets === 0 ? 0 : options.costs.resetCrystals;
  if (crystalsSpent > 0) {
    await rewards.spend(tx, options.playerId, { crystals: crystalsSpent }, `mastery:reset`);
  }

  await tx
    .update(playerChampions)
    .set({
      masteries: [],
      masteryResets: sql`${playerChampions.masteryResets} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(playerChampions.id, options.championId));

  return { crystalsSpent };
}

/** The learned nodes of a set of champions, keyed by champion id. */
export async function masteriesByChampion(
  db: Executor,
  championIds: readonly string[],
): Promise<Map<string, string[]>> {
  if (championIds.length === 0) return new Map();
  const rows = await db
    .select({ id: playerChampions.id, masteries: playerChampions.masteries })
    .from(playerChampions)
    .where(inArray(playerChampions.id, [...championIds]));
  return new Map(rows.map((row) => [row.id, row.masteries]));
}
