import type { ChampionDef, RosterChampion } from '@mistvale/shared';
import { ChampionCard as FuiChampionCard } from '@/fui/components/ChampionCard.ts';
import { FuiSlotted } from '@/fui/react';
import { useContentStore } from '../../state/contentStore';
import { championArt } from '../../ui/championArt';
import styles from './ChampionCard.module.scss';

/**
 * One champion in the roster grid.
 *
 * Painted by the library since the design rework — the rarity frame, the star track, the
 * affinity badge, the role pip and the power line are `ChampionCard`, which is the shape
 * this genre has used since the first squad RPG and the reason a legendary reads as a
 * legendary from across the screen.
 *
 * Everything on the card is still a fact the player uses to decide whether to open it: who
 * it is, how far along it is, how strong that has made it, and whether they have protected
 * it. Power comes from the server — the card renders it, it does not derive it.
 */

/** The glyph each role is drawn with. Roles are content; these are how they look. */
const ROLE_GLYPH: Readonly<Record<string, string>> = Object.freeze({
  attack: 'glyph-crossed-swords',
  defense: 'glyph-shield-block',
  hp: 'glyph-ribcage-armor',
  support: 'glyph-holy-totem',
});

export function ChampionCard({
  champion,
  def,
  onOpen,
  selectable,
  selected,
}: {
  champion: RosterChampion;
  def: ChampionDef | undefined;
  onOpen: () => void;
  /** Renders as a picker rather than a link — used by the food and team choosers. */
  selectable?: boolean;
  selected?: boolean;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const art = championArt(def, bundle?.assets);

  const gearWorn = champion.equippedGearIds.length;

  return (
    <FuiSlotted
      of={FuiChampionCard}
      className={styles.card}
      options={{
        name: def?.name ?? champion.championKey,
        ...art,
        rarity: def?.rarity ?? 'common',
        stars: champion.rank,
        maxStars: 6,
        // Ascension is the second, hotter track this genre draws over the star rating,
        // which is exactly what Mistvale's ascension is.
        ...(champion.ascension > 0 ? { awakened: champion.ascension } : {}),
        level: champion.level,
        maxLevel: champion.levelCap,
        ...(def?.element ? { affinity: def.element } : {}),
        ...(def?.role ? { role: ROLE_GLYPH[def.role] ?? 'glyph-crossed-swords' } : {}),
        ...(def?.role ? { roleLabel: def.role } : {}),
        power: champion.power,
        // The padlock is the library's own overlay and means the same thing here: this
        // one is protected and cannot be fed away.
        ...(champion.locked ? { locked: true } : {}),
        ...(selectable ? { selectable: true, selected: Boolean(selected) } : {}),
      }}
      on={{ 'champion:click': () => onOpen(), 'champion:select': () => onOpen() }}
      attrs={{
        title: def?.title || def?.name || champion.championKey,
        // The card's own text is fragments — a name, "1/10", a power figure — and read in
        // sequence they say very little. Composed here into the sentence a player would
        // say out loud, which is both a better reading and the one stable name a test can
        // ask for.
        'aria-label': [
          def?.name ?? champion.championKey,
          def?.rarity,
          `${champion.rank} star`,
          `Lv ${champion.level} of ${champion.levelCap}`,
          champion.ascension > 0 ? `ascension ${champion.ascension}` : '',
          `power ${champion.power.toLocaleString()}`,
          gearWorn > 0 ? `${gearWorn} of 6 relics worn` : 'no relics worn',
          champion.locked ? 'locked' : '',
          champion.favourite ? 'favourite' : '',
        ]
          .filter(Boolean)
          .join(', '),
      }}
    >
      {/* The two things Mistvale's own card carried that the library has no notion of.
          Portalled into its root and positioned over it rather than rebuilt beside it,
          because they belong to the card as much as its stars do.

          The relic pips answer "how much of this one's kit is filled" at a glance, which
          is the question the roster grid exists to answer; the favourite mark is what the
          default sort floats to the top. */}
      <span className={styles.marks} aria-hidden="true">
        {champion.favourite && !champion.locked && <span className={styles.favourite}>✦</span>}
      </span>
      <span className={styles.gearPips} aria-label={`${gearWorn} of 6 relics worn`}>
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} data-filled={index < gearWorn} />
        ))}
      </span>
    </FuiSlotted>
  );
}
