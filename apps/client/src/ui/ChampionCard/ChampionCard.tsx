import { ROLE_NAMES, type ChampionDef, type RosterChampion } from '@mistvale/shared';
import { ChampionCard as FuiChampionCard } from '@/fui/components/ChampionCard.ts';
import { FuiSlotted } from '@/fui/react';
import { useContentStore } from '../../state/contentStore';
import { championArt } from '../championArt';
import { championTip } from '../Tooltip/tips';
import styles from './ChampionCard.module.scss';

/**
 * One champion, as a card — everywhere a champion is chosen.
 *
 * Promoted out of the roster screen because it stopped being a roster detail: the owner's
 * note was that picking a team for a stage, an Arena attack or a Depths floor showed a name
 * and a level in a plain row, so *which* champion you were choosing — its rarity, its
 * affinity, how far along it is, how strong that has made it — was invisible at exactly the
 * moment it decides the fight. One card, one look, in all six places.
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
  size,
  badge,
}: {
  champion: RosterChampion;
  def: ChampionDef | undefined;
  onOpen: () => void;
  /** Renders as a picker rather than a link — used by the food and team choosers. */
  selectable?: boolean;
  selected?: boolean;
  /**
   * Card width in pixels. The library scales everything inside from it — the portrait, the
   * star track, the level line, the type — so a smaller card is the *same* card rather than
   * a second, plainer component. That is what lets the roster's rail (C19) and every picker
   * in the game draw one champion one way.
   */
  size?: number;
  /**
   * A short mark over the card's corner, where the pick's *position* matters.
   *
   * The profile showcase is the case: four champions in the order the player chose them,
   * and a picker that showed only "selected" would lose the ordering the card is built on.
   * Kept as a string rather than a number so a caller can put anything short there.
   */
  badge?: string;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const art = championArt(def, bundle?.assets);
  const faction = bundle?.factions.find((entry) => entry.key === def?.factionKey);

  const gearWorn = champion.equippedGearIds.length;

  return (
    <FuiSlotted
      of={FuiChampionCard}
      className={styles.card}
      // The card is 150px and already carries five facts. What a hover adds is the two it
      // cannot fit and a player choosing a team is actually asking: which affinity this
      // one brings, and how much of its kit is on.
      tip={championTip(champion, def, {
        faction: faction?.name,
        hint: selectable ? 'Click to pick' : 'Click to open',
      })}
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
        // The word rather than the key: `hp` reads as "Hp" in a tooltip otherwise, which
        // is what the roster screen has always called "Health" two clicks away.
        ...(def?.role ? { roleLabel: ROLE_NAMES[def.role] ?? def.role } : {}),
        power: champion.power,
        ...(size === undefined ? {} : { size }),
        // The padlock is the library's own overlay and means the same thing here: this
        // one is protected and cannot be fed away.
        ...(champion.locked ? { locked: true } : {}),
        ...(selectable ? { selectable: true, selected: Boolean(selected) } : {}),
      }}
      // **One event, not both.** A selectable card emits `champion:select` *and*
      // `champion:click` for a single press, so wiring both ran the handler twice — which
      // in the food picker meant every card selected itself and immediately deselected
      // itself, the count stayed at "0 selected", and the Feed button never enabled. It
      // held up the tutorial at the step that asks a player to feed a champion.
      on={selectable ? { 'champion:select': () => onOpen() } : { 'champion:click': () => onOpen() }}
      // The library toggles its own selection ring on click, before React has decided
      // anything. `setSelected` puts it back where the state says — which matters when the
      // press is *refused*, as it is once a rank-up has its full count of food.
      apply={(card, next) => {
        card.setSelected(Boolean(next.selected));
        card.setLevel(champion.level, champion.levelCap);
        card.setPower(champion.power);
      }}
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
        {badge && <span className={styles.badge}>{badge}</span>}
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
