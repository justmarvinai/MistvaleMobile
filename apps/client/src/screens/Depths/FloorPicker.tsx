import { useMemo } from 'react';
import type { DungeonDef, StageDef } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { useContentStore } from '../../state/contentStore';
import { usePlayerStore } from '../../state/playerStore';
import { useProgressStore } from '../../state/progressStore';
import styles from './FloorPicker.module.scss';

/**
 * Choosing a floor.
 *
 * A ladder, drawn as one: every floor down to the deepest that is open, and a marker on
 * the best a player has managed. Which floors are open comes from the same progress
 * payload the campaign map reads, computed with the rule the battle route enforces.
 */
export function FloorPicker({
  dungeon,
  onClose,
  onPick,
}: {
  dungeon: DungeonDef;
  onClose: () => void;
  onPick: (stage: StageDef, title: string) => void;
}): JSX.Element {
  const bundle = useContentStore((state) => state.bundle);
  const standings = useProgressStore((state) => state.stages);
  const energy = usePlayerStore((state) => state.player?.energy.value ?? 0);

  const floors = useMemo(
    () =>
      (bundle?.stages ?? [])
        .filter((stage) => stage.parentKey === dungeon.key)
        .sort((a, b) => a.number - b.number),
    [bundle, dungeon.key],
  );

  const sets = useMemo(() => {
    const names = new Map((bundle?.gearSets ?? []).map((set) => [set.key, set.name]));
    return dungeon.setKeys.map((key) => names.get(key) ?? key);
  }, [bundle, dungeon.setKeys]);

  return (
    <Modal open title={dungeon.name} onClose={onClose}>
      <div className={styles.body}>
        <p className={styles.lore}>{dungeon.lore}</p>

        {sets.length > 0 && (
          <p className={styles.sets}>
            <span className={styles.setsLabel}>Relics</span> {sets.join(' · ')}
          </p>
        )}

        {floors.length === 0 ? (
          <p className={styles.empty}>No floors are published for this keep yet.</p>
        ) : (
          <div className={styles.floors}>
            {floors.map((floor) => {
              const standing = standings.get(floor.key);
              const open = standing?.open ?? floor.number === 1;
              const stars = standing?.stars ?? 0;
              const affordable = energy >= floor.energyCost;

              return (
                <button
                  key={floor.key}
                  type="button"
                  className={styles.floor}
                  disabled={!open}
                  data-cleared={stars > 0 ? 'true' : undefined}
                  onClick={() => onPick(floor, `${dungeon.name} · Floor ${floor.number}`)}
                  title={
                    !open
                      ? (standing?.lockedReason ?? 'Not open yet.')
                      : affordable
                        ? `${floor.energyCost} energy`
                        : `Needs ${floor.energyCost} energy — you have ${energy}`
                  }
                >
                  <span className={styles.floorHead}>
                    <span className={styles.floorNumber}>Floor {floor.number}</span>
                    <span className={styles.floorStars} aria-label={`${stars} of 3 stars`}>
                      {'★'.repeat(stars)}
                      {'☆'.repeat(3 - stars)}
                    </span>
                  </span>
                  <span className={styles.floorMeta}>
                    {open ? `${floor.energyCost} energy` : (standing?.lockedReason ?? 'Shut')}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
