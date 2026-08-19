import { useMemo } from 'react';
import type { DungeonDef, StageDef } from '@mistvale/shared';
import { StageSelect } from '@/fui/components/StageSelect.ts';
import { Fui } from '@/fui/react';
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

  /**
   * Why the ladder stops.
   *
   * A floor node is a numbered disc with nowhere to put a sentence, and only the first
   * shut one is worth reading — so it is said once, under the grid.
   */
  const shut = floors.find((floor) => standings.get(floor.key)?.open === false);
  const deepestShut = shut ? (standings.get(shut.key)?.lockedReason ?? null) : null;

  return (
    <Modal open title={dungeon.name} onClose={onClose} width={640}>
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
          <>
            {/* A grid rather than the campaign's snaking path: fifteen floors of a keep
                are a ladder to be scanned, not a road to be walked past, and a path that
                long wraps into something nobody can follow. */}
            <Fui
              of={StageSelect}
              className={styles.floors}
              options={{
                subtitle: `${floors.length} floors · you have ${energy} energy`,
                layout: 'grid',
                columns: 5,
                stages: floors.map((floor, index) => {
                  const standing = standings.get(floor.key);
                  const open = standing?.open ?? floor.number === 1;
                  const stars = standing?.stars ?? 0;
                  return {
                    id: floor.key,
                    label: String(floor.number),
                    stars,
                    state: !open
                      ? ('locked' as const)
                      : stars > 0
                        ? ('cleared' as const)
                        : ('current' as const),
                    cost: floor.energyCost,
                    // The deepest floor is the one the keep is named for.
                    ...(index === floors.length - 1 ? { boss: true } : {}),
                  };
                }),
              }}
              on={{
                'stage:select': (node: { id: string }) => {
                  const floor = floors.find((entry) => entry.key === node.id);
                  if (floor) onPick(floor, `${dungeon.name} · Floor ${floor.number}`);
                },
              }}
            />
            {deepestShut && <p className={styles.shut}>{deepestShut}</p>}
          </>
        )}
      </div>
    </Modal>
  );
}
