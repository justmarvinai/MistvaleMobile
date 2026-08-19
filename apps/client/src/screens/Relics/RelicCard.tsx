import type { GearInstance } from '@mistvale/shared';
import { ArtifactCard } from '@/fui/components/ArtifactCard.ts';
import { Fui } from '@/fui/react';
import { useContentStore } from '../../state/contentStore';
import { relicArt, relicGlyph } from '../../ui/relicArt';
import { statLabel } from '../../ui/statLabels';
import styles from './RelicCard.module.scss';

/**
 * One relic.
 *
 * Painted by the library since the design rework — the rarity frame, the set tag, the
 * upgrade level and the roll pips on each substat are `ArtifactCard`, which is the card a
 * squad-RPG's equipment screen is made of.
 *
 * Substats are still the thing a player actually reads: a relic's whole value is usually
 * one lucky line among four, and the roll pips are how that becomes visible rather than
 * arithmetic.
 */

const amount = (value: number, percent: boolean): string => `+${value}${percent ? '%' : ''}`;

export function RelicCard({
  relic,
  selected,
  onSelect,
  compact,
}: {
  relic: GearInstance;
  selected?: boolean;
  onSelect?: () => void;
  /** Hides the substats — for a picker row where the set and the main stat are the choice. */
  compact?: boolean;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const set = bundle?.gearSets.find((entry) => entry.key === relic.setKey);
  const slot = bundle?.gearSlots.find((entry) => entry.key === relic.slot);

  return (
    <Fui
      of={ArtifactCard}
      className={styles.card}
      options={{
        // The set is what a player calls the piece; the slot is where it goes. A relic has
        // no name of its own in Mistvale, and inventing one would be content.
        name: set?.name ?? relic.setKey,
        art: relicArt(relic.slot),
        rarity: relic.rarity,
        slot: slot?.name ?? relic.slot,
        slotGlyph: relicGlyph(relic.slot),
        ...(set ? { set: set.name, setSize: set.pieces } : {}),
        level: relic.level,
        maxLevel: 16,
        mainStat: {
          label: statLabel(relic.main.stat),
          value: amount(relic.main.value, relic.main.percent),
        },
        ...(compact
          ? {}
          : {
              subStats: relic.substats.map((sub) => ({
                label: statLabel(sub.stat),
                value: amount(sub.value, sub.percent),
                ...((sub.rolls ?? 1) > 1 ? { rolls: sub.rolls } : {}),
              })),
            }),
        ...(relic.locked ? { locked: true } : {}),
        ...(relic.equippedChampionId && !compact ? { equippedBy: 'Worn' } : {}),
        ...(onSelect ? { selectable: true, selected: Boolean(selected) } : {}),
      }}
      on={onSelect ? { 'artifact:select': () => onSelect() } : undefined}
      attrs={{
        // The card's own text is a stack of fragments. Composed here into the line a
        // player would say, which is also the one stable name a test can ask for.
        'aria-label': [
          set?.name ?? relic.setKey,
          slot?.name ?? relic.slot,
          `${relic.rank} star`,
          `+${relic.level}`,
          `${statLabel(relic.main.stat)} ${amount(relic.main.value, relic.main.percent)}`,
          relic.locked ? 'locked' : '',
          relic.equippedChampionId ? 'worn' : '',
        ]
          .filter(Boolean)
          .join(', '),
      }}
    />
  );
}
