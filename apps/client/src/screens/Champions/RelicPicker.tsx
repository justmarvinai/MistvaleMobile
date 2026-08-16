import { useEffect, useMemo, useState } from 'react';
import type { GearInstance, GearPreview, GearSlot } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { gameApi } from '../../api/game';
import { useInventoryStore } from '../../state/inventoryStore';
import { RelicCard } from '../Relics/RelicCard';
import styles from './RelicPicker.module.scss';

/**
 * Choosing a relic for one slot.
 *
 * Selecting a candidate asks the server what equipping it would do and shows the real
 * difference — set bonuses appearing or vanishing included, which is exactly the case a
 * client-side sum would get wrong. The player sees true numbers before they commit.
 */

const STATS = ['hp', 'atk', 'def', 'spd', 'critRate', 'critDmg', 'res', 'acc'] as const;

export function RelicPicker({
  slot,
  championId,
  worn,
  onClose,
  onChanged,
}: {
  slot: GearSlot;
  championId: string;
  worn: GearInstance | null;
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}): JSX.Element {
  const gear = useInventoryStore((state) => state.gear);
  const loadInventory = useInventoryStore((state) => state.load);

  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<GearPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadInventory();
  }, [loadInventory]);

  const candidates = useMemo(
    () =>
      gear
        .filter((piece) => piece.slot === slot && piece.id !== worn?.id)
        .filter((piece) => piece.equippedChampionId === null)
        .sort((a, b) => b.rank - a.rank || b.level - a.level),
    [gear, slot, worn],
  );

  useEffect(() => {
    if (!selected) return;
    let cancelled = false;
    void gameApi
      .previewGear(selected, championId)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch(() => {
        if (!cancelled) setPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, championId]);

  const act = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await loadInventory();
      await onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'That did not work.');
      setBusy(false);
    }
  };

  return (
    <Modal open title={`${slot} relic`} onClose={onClose}>
      <div className={styles.body}>
        {worn && (
          <section className={styles.current}>
            <h3 className={styles.heading}>Worn now</h3>
            <RelicCard relic={worn} />
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => void act(() => gameApi.unequip(worn.id))}
            >
              Take it off
            </Button>
          </section>
        )}

        <section>
          <h3 className={styles.heading}>In the vault</h3>
          {candidates.length === 0 ? (
            <p className={styles.empty}>
              No spare {slot} relics. They drop from campaign stage {slotNumber(slot)} and from the
              Bazaar.
            </p>
          ) : (
            <div className={styles.grid}>
              {candidates.map((piece) => (
                <RelicCard
                  key={piece.id}
                  relic={piece}
                  selected={selected === piece.id}
                  onSelect={() => setSelected(piece.id === selected ? null : piece.id)}
                />
              ))}
            </div>
          )}
        </section>

        {selected && preview?.championId === championId && (
          <section className={styles.preview}>
            <h3 className={styles.heading}>What that would do</h3>
            <ul className={styles.deltas}>
              {STATS.map((stat) => {
                const delta = Math.round(preview.after.total[stat] - preview.before.total[stat]);
                if (delta === 0) return null;
                return (
                  <li key={stat} data-sign={delta > 0 ? 'up' : 'down'}>
                    {stat.toUpperCase()} {delta > 0 ? '+' : ''}
                    {delta.toLocaleString()}
                  </li>
                );
              })}
            </ul>
            <div className={styles.power}>
              Power {preview.before.power.toLocaleString()} →{' '}
              <strong>{preview.after.power.toLocaleString()}</strong>
            </div>
          </section>
        )}

        {error && <p className={styles.error}>{error}</p>}

        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          <Button
            disabled={!selected || busy}
            onClick={() => selected && void act(() => gameApi.equip(selected, championId))}
          >
            Equip
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Which campaign stage number farms this slot — the source game's convention. */
function slotNumber(slot: GearSlot): string {
  const order: GearSlot[] = ['weapon', 'helm', 'shield', 'gauntlets', 'cuirass', 'boots'];
  const index = order.indexOf(slot);
  return index >= 0 ? String(index + 1) : 'bosses';
}
