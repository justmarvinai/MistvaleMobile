import { useMemo, useState } from 'react';
import type { ChampionDetail } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { useContentStore } from '../../state/contentStore';
import { useRosterStore } from '../../state/rosterStore';
import { useInventoryStore, itemCount } from '../../state/inventoryStore';
import { ChampionCard } from '../../ui/ChampionCard/ChampionCard';
import styles from './FoodPicker.module.scss';

/** The one XP consumable, mirrored from the server's `BREW_ITEM_KEY`. */
const BREW_KEY = 'xp_brew';

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
  onConfirm: (ids: string[], brews: number) => Promise<void> | void;
}): JSX.Element {
  const roster = useRosterStore((state) => state.champions);
  const bundle = useContentStore((state) => state.bundle);
  const [chosen, setChosen] = useState<string[]>([]);
  /**
   * Brews poured in alongside the bodies.
   *
   * On the same dialog rather than a second one, because it is the same decision: how much
   * experience am I willing to spend on this champion. Rank-up has no brews — a star is
   * bought with bodies and nothing else — so the stepper only exists in `level` mode.
   */
  const [brews, setBrews] = useState(0);
  const held = useInventoryStore((state) => itemCount(state.items, BREW_KEY));

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
      size="wide"
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

        {/* Brews sit with the bodies because they answer the same question — how much
            experience is this champion worth to me — and separating them into a second
            dialog would make "a few brews and one broodling" two errands. */}
        {mode === 'level' && (
          <div className={styles.brews}>
            <span className={styles.brewLabel}>
              Mistbrew
              <span className={styles.brewHeld}>{held} held</span>
            </span>
            <div className={styles.stepper}>
              <button
                type="button"
                className={styles.step}
                onClick={() => setBrews((value) => Math.max(0, value - 10))}
                disabled={brews <= 0}
                aria-label="Ten fewer brews"
              >
                −10
              </button>
              <button
                type="button"
                className={styles.step}
                onClick={() => setBrews((value) => Math.max(0, value - 1))}
                disabled={brews <= 0}
                aria-label="One fewer brew"
              >
                −
              </button>
              <span className={styles.stepValue} aria-live="polite">
                {brews}
              </span>
              <button
                type="button"
                className={styles.step}
                onClick={() => setBrews((value) => Math.min(held, value + 1))}
                disabled={brews >= held}
                aria-label="One more brew"
              >
                +
              </button>
              <button
                type="button"
                className={styles.step}
                onClick={() => setBrews((value) => Math.min(held, value + 10))}
                disabled={brews >= held}
                aria-label="Ten more brews"
              >
                +10
              </button>
              <Button variant="ghost" disabled={held === 0} onClick={() => setBrews(held)}>
                All
              </Button>
            </div>
          </div>
        )}

        <div className={styles.actions}>
          <span className={styles.count}>
            {chosen.length}
            {requirement ? ` / ${requirement.foodCount}` : ''} selected
            {mode === 'level' && brews > 0 ? ` · ${brews} brew${brews === 1 ? '' : 's'}` : ''}
          </span>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={mode === 'level' ? chosen.length === 0 && brews === 0 : !ready}
            onClick={() => void onConfirm(chosen, brews)}
          >
            {mode === 'level' ? 'Feed' : 'Rank up'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
