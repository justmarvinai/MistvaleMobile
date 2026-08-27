import type { GearSetDef } from '@mistvale/shared';
import { statLabel } from './statLabels';

/**
 * A relic set's bonus as one readable line — the same numbers the engine applies.
 *
 * Shared because the vault started grouping its relics by set (C19) and the champion sheet
 * has stated the same sentence since D5. Two copies of one rule is how the two stop
 * agreeing, and this one has four optional halves — a stat, a magnitude, odds and a
 * duration — so there is plenty for a second copy to get wrong.
 *
 * It reads a *definition*, never a count: a set's bonus only lands in complete copies, and
 * this deliberately says nothing about whether the player has enough pieces. The champion
 * sheet answers that from the server's own copy-aware description; here the sentence is
 * what the set is *for*.
 */
export function setEffect(set: GearSetDef): string {
  const { stat, pct, flat, chance, turns } = set.bonus;
  const magnitude = pct != null ? `+${pct}%` : flat != null ? `+${flat}` : '';
  const target = stat ? statLabel(stat) : '';
  const odds = chance != null ? ` (${Math.round(chance * 100)}% chance)` : '';
  const duration = turns != null ? ` for ${turns} turns` : '';
  const head = [target, magnitude].filter(Boolean).join(' ');
  return `${head || set.bonusType}${duration}${odds}`.trim();
}
