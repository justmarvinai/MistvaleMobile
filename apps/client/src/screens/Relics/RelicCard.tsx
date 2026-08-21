import type { GearInstance } from '@mistvale/shared';
import { ArtifactCard } from '@/fui/components/ArtifactCard.ts';
import { Fui } from '@/fui/react';
import { useContentStore } from '../../state/contentStore';
import { relicArt, relicGlyph } from '../../ui/relicArt';
import { statLabel } from '../../ui/statLabels';
import { relicTip } from '../../ui/Tooltip/tips';
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
  wornBy,
  selected,
  onSelect,
  compact,
}: {
  relic: GearInstance;
  /**
   * The champion wearing it, where the caller knows and it is worth saying.
   *
   * The vault knows the name and says it; the champion sheet's own slot dialog does not
   * pass one, because "worn by the champion whose sheet you are looking at" is a sentence
   * about the obvious.
   */
  wornBy?: string;
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
      // `ArtifactCard` has no setters — it paints its stats once, at construction — so a
      // change is a rebuild. Keyed on exactly what a forge run moves: the level, and the
      // substats it rolls on the way. Without it a relic upgraded to +4 still read +0 on
      // every card in the vault until the page was reloaded.
      key={`${relic.level}:${relic.substats.map((sub) => `${sub.stat}${sub.value}${sub.rolls ?? 1}`).join(',')}`}
      of={ArtifactCard}
      className={styles.card}
      // The same card the champion sheet's socket shows, so a relic answers the same
      // question wherever it is hovered: which set, what it does complete, and how far
      // off complete it is. In the vault it belongs to nobody, so there is no count to
      // give and the tooltip says what the set *does* instead.
      tip={relicTip(relic, {
        set,
        ...(wornBy ? { wornBy } : {}),
        ...(onSelect ? { hint: 'Click to choose it' } : {}),
      })}
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
        // Who is wearing it, when the caller knows and it is worth saying. It used to pass
        // the literal string "Worn", which the library dutifully drew as "Equipped by
        // Worn" — a sentence about nobody.
        ...(wornBy && !compact ? { equippedBy: wornBy } : {}),
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
