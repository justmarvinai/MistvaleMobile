import { useMemo, useState } from 'react';
import type { ChampionDetail } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { useRosterStore } from '../../state/rosterStore';
import { ChampionCard } from './ChampionCard';
import styles from './FoodPicker.module.scss';

/**
 * Choosing what to feed.
 *
 * The same picker serves both ladders because the decision is the same one — which
 * champions am I willing to lose — but the rules differ, so the two modes filter
 * differently: levelling takes anything unprotected, ranking up takes exactly N champions
 * of exactly the right star rank. Filtering rather than erroring is the point: a player
 * should not be able to select something the server will refuse.
 */

export function FoodPicker({
  mode,
  champion,
  onClose,
  onConfirm,
}: {
  mode: 'level' | 'rank';
  champion: ChampionDetail;
  onClose: () => void;
  onConfirm: (ids: string[]) => Promise<void> | void;
}): JSX.Element {
  const roster = useRosterStore((state) => state.champions);
  const bundle = useContentStore((state) => state.bundle);
  const [chosen, setChosen] = useState<string[]>([]);

  const defs = useMemo(
    () => new Map((bundle?.champions ?? []).map((entry) => [entry.key, entry])),
    [bundle],
  );

  const requirement = mode === 'rank' ? champion.costs.rankUp : null;

  const eligible = useMemo(
    () =>
      roster.filter((entry) => {
        if (entry.id === champion.champion.id) return false;
        if (entry.locked || entry.favourite) return false;
        // A champion still wearing relics would be refused server-side; do not offer it.
        if (entry.equippedGearIds.length > 0) return false;
        if (requirement && entry.rank !== requirement.foodRank) return false;
        return true;
      }),
    [roster, champion.champion.id, requirement],
  );

  const limit = requirement?.foodCount ?? 20;
  const ready = requirement ? chosen.length === requirement.foodCount : chosen.length > 0;

  const toggle = (id: string): void => {
    setChosen((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id);
      if (current.length >= limit) return current;
      return [...current, id];
    });
  };

  return (
    <Modal
      open
      title={mode === 'level' ? 'Feed for experience' : `Rank up to ★${champion.champion.rank + 1}`}
      onClose={onClose}
      width={720}
    >
      <div className={styles.body}>
        <p className={styles.rule}>
          {requirement
            ? `Choose exactly ${requirement.foodCount} ★${requirement.foodRank} champions. Costs ${requirement.silver.toLocaleString()} silver.`
            : 'Choose champions to consume. A levelled champion is worth more than an unlevelled one.'}
        </p>

        {eligible.length === 0 ? (
          <p className={styles.empty}>
            {requirement
              ? `No unprotected ★${requirement.foodRank} champions are available. Farm some, or buy them at the Bazaar.`
              : 'Nothing to feed. Locked, favourited and equipped champions are never offered.'}
          </p>
        ) : (
          <div className={styles.grid}>
            {eligible.map((entry) => (
              <ChampionCard
                key={entry.id}
                champion={entry}
                def={defs.get(entry.championKey)}
                selectable
                selected={chosen.includes(entry.id)}
                onOpen={() => toggle(entry.id)}
              />
            ))}
          </div>
        )}

        <div className={styles.actions}>
          <span className={styles.count}>
            {chosen.length}
            {requirement ? ` / ${requirement.foodCount}` : ''} selected
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!ready} onClick={() => void onConfirm(chosen)}>
            {mode === 'level' ? 'Feed' : 'Rank up'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
