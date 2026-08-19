import { ARENA_TIER_LABELS, type ArenaTier } from '@mistvale/shared';
import type { TierName } from '@/fui/components/TierBadge.ts';

/**
 * Mistvale's ten Arena tiers, in the emblem's vocabulary.
 *
 * The ladder's rungs are `bronze_1` … `platinum`: a metal and a division within it. The
 * library's badge is built from exactly that pair, so the mapping is a split rather than a
 * translation — and doing it here rather than at three call sites means the ladder, the
 * offer list and a stranger's profile card always show the same emblem for the same rung.
 *
 * A tier the badge has never heard of falls back to bronze rather than drawing nothing:
 * `arena.tierThresholds` is content, and an operator can add a rung.
 */
const METALS: readonly TierName[] = ['bronze', 'silver', 'gold', 'platinum'];

export interface TierEmblem {
  tier: TierName;
  /** Roman numeral within the metal. Absent for an undivided tier like Platinum. */
  division?: number;
}

export function arenaTierEmblem(tier: ArenaTier): TierEmblem {
  const [metal, division] = tier.split('_');
  const known = METALS.find((entry) => entry === metal) ?? 'bronze';
  const numeral = division ? Number(division) : Number.NaN;
  return Number.isFinite(numeral) ? { tier: known, division: numeral } : { tier: known };
}

/** The rung's player-facing name — "Bronze II" — for anywhere the emblem needs words. */
export const arenaTierLabel = (tier: ArenaTier): string => ARENA_TIER_LABELS[tier] ?? tier;
