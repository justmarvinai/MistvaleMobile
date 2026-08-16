import type { GearInstance } from '@mistvale/shared';
import { useContentStore } from '../../state/contentStore';
import styles from './RelicCard.module.scss';

/**
 * One relic.
 *
 * The genre's card: set, slot, rank, upgrade level, main stat, substats. Substats are the
 * thing a player actually reads, so they get the room — a relic's whole value is usually
 * one lucky line among four.
 */

const statLabel: Record<string, string> = {
  hp: 'HP',
  atk: 'ATK',
  def: 'DEF',
  spd: 'SPD',
  critRate: 'C.RATE',
  critDmg: 'C.DMG',
  res: 'RES',
  acc: 'ACC',
};

const line = (stat: string, value: number, percent: boolean): string =>
  `${statLabel[stat] ?? stat.toUpperCase()} +${value}${percent ? '%' : ''}`;

export function RelicCard({
  relic,
  selected,
  onSelect,
  compact,
}: {
  relic: GearInstance;
  selected?: boolean;
  onSelect?: () => void;
  compact?: boolean;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const set = bundle?.gearSets.find((entry) => entry.key === relic.setKey);
  const slot = bundle?.gearSlots.find((entry) => entry.key === relic.slot);

  const content = (
    <>
      <div className={styles.head}>
        <span className={styles.slot}>{slot?.name ?? relic.slot}</span>
        <span className={styles.level}>+{relic.level}</span>
      </div>

      <div className={styles.set} data-rarity={relic.rarity}>
        {set?.name ?? relic.setKey}
        <span className={styles.rank}>{'★'.repeat(relic.rank)}</span>
      </div>

      <div className={styles.main}>
        {line(relic.main.stat, relic.main.value, relic.main.percent)}
      </div>

      {!compact && (
        <ul className={styles.subs}>
          {relic.substats.map((sub, index) => (
            <li key={`${sub.stat}-${sub.percent}-${index}`}>
              {line(sub.stat, sub.value, sub.percent)}
              {(sub.rolls ?? 1) > 1 && <span className={styles.rolls}>×{sub.rolls}</span>}
            </li>
          ))}
          {relic.substats.length === 0 && <li className={styles.none}>No substats</li>}
        </ul>
      )}

      {relic.locked && (
        <span className={styles.lock} title="Locked — protected from a mass sell">
          ⚿
        </span>
      )}
      {relic.equippedChampionId && !compact && <span className={styles.worn}>Worn</span>}
    </>
  );

  if (!onSelect) return <div className={styles.card}>{content}</div>;

  return (
    <button
      type="button"
      className={styles.card}
      data-selected={selected ? 'true' : undefined}
      aria-pressed={Boolean(selected)}
      onClick={onSelect}
    >
      {content}
    </button>
  );
}
