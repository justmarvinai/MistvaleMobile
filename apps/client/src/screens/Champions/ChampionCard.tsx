import type { ChampionDef, RosterChampion } from '@mistvale/shared';
import { avatarPath } from '../../game/sprites';
import { useContentStore } from '../../state/contentStore';
import styles from './ChampionCard.module.scss';
import { Portrait } from '../../ui/Portrait/Portrait';
import { Icon } from '../../ui/Icon/Icon';

/**
 * One champion in the roster grid.
 *
 * Everything on the card is a fact the player uses to decide whether to open it: who it
 * is, how far along it is, how strong that has made it, and whether they have protected
 * it. Power comes from the server — the card renders it, it does not derive it.
 */

const STARS = (rank: number): string => '★'.repeat(rank) + '☆'.repeat(Math.max(0, 6 - rank));

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
  const asset = bundle?.assets.find((entry) => entry.key === def?.assetKey);
  const art = asset ? avatarPath(asset.basePath) : null;

  return (
    <button
      type="button"
      className={styles.card}
      data-rarity={def?.rarity ?? 'common'}
      data-selected={selected ? 'true' : undefined}
      aria-pressed={selectable ? Boolean(selected) : undefined}
      onClick={onOpen}
      title={def?.title || def?.name}
    >
      <span className={styles.portrait}>
        <Portrait src={art} name={def?.name} size={112} className={styles.art} />
        {champion.locked && (
          <span className={styles.badge} title="Locked — cannot be fed away">
            <Icon name="nav-locked" size={12} />
          </span>
        )}
        {champion.favourite && !champion.locked && (
          <span className={styles.badge} title="Favourite">
            ✦
          </span>
        )}
      </span>

      <span className={styles.name}>{def?.name ?? champion.championKey}</span>
      <span className={styles.stars} aria-label={`${champion.rank} stars`}>
        {STARS(champion.rank)}
      </span>

      <span className={styles.meta}>
        Lv {champion.level}/{champion.levelCap}
        {champion.ascension > 0 && <span className={styles.asc}> · A{champion.ascension}</span>}
      </span>
      <span className={styles.power}>{champion.power.toLocaleString()}</span>

      {/* Six pips: at a glance, how much of this champion's relic kit is filled. */}
      <span className={styles.gearPips} aria-label={`${champion.equippedGearIds.length} relics`}>
        {Array.from({ length: 6 }, (_, index) => (
          <span key={index} data-filled={index < champion.equippedGearIds.length} />
        ))}
      </span>
    </button>
  );
}
