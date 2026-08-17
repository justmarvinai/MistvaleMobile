import { z } from 'zod';
import {
  MASTERY_MAX_TIER,
  MASTERY_TREES,
  type MasteryDef,
  type MasteryTree,
} from './content/masteries';

/**
 * The mastery build rules.
 *
 * Source-faithful in shape (COMBAT_SYSTEM §9): fifteen picks per champion, spread across
 * at most two of the three trees, and a tier is only reachable once enough has been spent
 * at the tiers below it. That last rule is what makes a build a *ladder* rather than a
 * shopping list.
 *
 * Written here, in shared, rather than in the server: the tree screen has to grey out the
 * same nodes the server will refuse, and a second implementation of a rule this fiddly
 * would disagree with the first within a week.
 */

/** How many picks each tier allows, across both active trees. Index 0 is unused. */
export const MASTERY_PICKS_BY_TIER: readonly number[] = [0, 2, 3, 3, 3, 3, 1];

/** The full build: fifteen nodes. */
export const MASTERY_TOTAL_PICKS = MASTERY_PICKS_BY_TIER.reduce((sum, count) => sum + count, 0);

/** At most two trees may be opened on one champion. */
export const MASTERY_MAX_TREES = 2;

/**
 * Picks needed below a tier before it opens.
 *
 * Counted across the *whole build* rather than per tree, and that is load-bearing: with a
 * fifteen-pick budget and a hard cap per tier, a per-tree gate would make the two-tree
 * build the design promises impossible — split your two Tier-1 picks between two trees and
 * neither would ever have the two-below it needed, leaving the champion stuck at 2/15
 * forever. Counting globally keeps the ladder real (two picks buy Tier 2, four buy Tier 3,
 * and a capstone is ten picks deep) while leaving the choice of *which* two trees free.
 */
export const MASTERY_TIER_GATE = 2;

export const masteryPickSchema = z.object({
  /** `mastery_defs` key. */
  nodeKey: z.string().min(2).max(64),
});

export interface MasteryRuleCheck {
  ok: boolean;
  /** Why the pick is refused, phrased for the player. Null when it is allowed. */
  reason: string | null;
}

const TREE_LABEL: Readonly<Record<MasteryTree, string>> = Object.freeze({
  onslaught: 'Onslaught',
  bulwark: 'Bulwark',
  insight: 'Insight',
});

/** Counts picks per tier and per tree. */
export interface MasteryTally {
  byTier: Record<number, number>;
  byTree: Record<MasteryTree, number>;
  /** Picks at tiers below the given one, which is what the tier gate reads. */
  belowTier: (tier: number) => number;
  total: number;
}

export function tallyMasteries(
  chosen: readonly string[],
  nodes: ReadonlyMap<string, MasteryDef>,
): MasteryTally {
  const byTier: Record<number, number> = {};
  const byTree: Record<MasteryTree, number> = { onslaught: 0, bulwark: 0, insight: 0 };

  for (const key of chosen) {
    const node = nodes.get(key);
    if (!node) continue;
    byTier[node.tier] = (byTier[node.tier] ?? 0) + 1;
    byTree[node.tree] += 1;
  }

  return {
    byTier,
    byTree,
    belowTier: (tier) => {
      let count = 0;
      for (let below = 1; below < tier; below += 1) count += byTier[below] ?? 0;
      return count;
    },
    total: chosen.length,
  };
}

/**
 * Whether one more node may be taken.
 *
 * Order matters only for the message: a player who has already opened two trees should be
 * told *that*, not told they are short on picks in a tree they cannot open anyway.
 */
export function canTakeMastery(
  node: MasteryDef,
  chosen: readonly string[],
  nodes: ReadonlyMap<string, MasteryDef>,
): MasteryRuleCheck {
  if (chosen.includes(node.key)) {
    return { ok: false, reason: 'Already learned.' };
  }

  const tally = tallyMasteries(chosen, nodes);

  const openTrees = MASTERY_TREES.filter((tree) => tally.byTree[tree] > 0);
  if (!openTrees.includes(node.tree) && openTrees.length >= MASTERY_MAX_TREES) {
    return {
      ok: false,
      reason: `A champion may only train two trees — ${openTrees.map((tree) => TREE_LABEL[tree]).join(' and ')}.`,
    };
  }

  const allowed = MASTERY_PICKS_BY_TIER[node.tier] ?? 0;
  if ((tally.byTier[node.tier] ?? 0) >= allowed) {
    const label = node.tier === MASTERY_MAX_TIER ? 'capstone' : `tier ${node.tier} mastery`;
    return {
      ok: false,
      reason:
        allowed === 1
          ? `Only one ${label} may be taken.`
          : `Only ${allowed} tier ${node.tier} masteries may be taken.`,
    };
  }

  const needed = MASTERY_TIER_GATE * (node.tier - 1);
  const held = tally.belowTier(node.tier);
  if (held < needed) {
    return {
      ok: false,
      reason: `Needs ${needed} masteries at lower tiers; you have ${held}.`,
    };
  }

  return { ok: true, reason: null };
}

/** Every node a champion could take right now, for the tree screen's highlighting. */
export function availableMasteries(
  chosen: readonly string[],
  nodes: ReadonlyMap<string, MasteryDef>,
): Map<string, MasteryRuleCheck> {
  const checks = new Map<string, MasteryRuleCheck>();
  for (const node of nodes.values()) checks.set(node.key, canTakeMastery(node, chosen, nodes));
  return checks;
}

// ── DTOs ────────────────────────────────────────────────────────────────────

export const masteryStateSchema = z.object({
  /** Node keys this champion has learned. */
  chosen: z.array(z.string()),
  /** Picks still available per tier, so the screen need not re-derive the rules. */
  remainingByTier: z.record(z.string(), z.number().int()),
  /** Trees with at least one pick. At two, the third is closed. */
  openTrees: z.array(z.enum(MASTERY_TREES)),
  /** What the next reset costs; zero while the first one is still free. */
  resetCost: z.number().int(),
  /** True once the champion is high enough level to train at all. */
  unlocked: z.boolean(),
  /** Why not, when it is not. */
  lockedReason: z.string().nullable(),
});
export type MasteryState = z.infer<typeof masteryStateSchema>;

export const masteryLearnRequestSchema = z.object({
  nodeKey: z.string().min(2).max(64),
  actionId: z.string().min(8).max(64),
});
export type MasteryLearnRequest = z.infer<typeof masteryLearnRequestSchema>;

export const masteryResetRequestSchema = z.object({ actionId: z.string().min(8).max(64) });
export type MasteryResetRequest = z.infer<typeof masteryResetRequestSchema>;
