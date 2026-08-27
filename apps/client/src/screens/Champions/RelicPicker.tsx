import { useEffect, useMemo, useState } from 'react';
import type { GearInstance, GearPreview, GearSlot } from '@mistvale/shared';
import { Modal } from '../../ui/Modal/Modal';
import { Button } from '../../ui/Button/Button';
import { gameApi } from '../../api/game';
import { useContentStore } from '../../state/contentStore';
import { useInventoryStore } from '../../state/inventoryStore';
import { RelicCard } from '../Relics/RelicCard';
import { Forge } from '../Relics/Forge';
import { Reforge } from '../Relics/Reforge';
import { usePlayerStore } from '../../state/playerStore';
import styles from './RelicPicker.module.scss';
import { statLabel } from '../../ui/labels';
import { RELIC_SLOT_LABEL, relicGlyph } from '../../ui/relicArt';
import { describeSetChange, setChanges } from '../../ui/setChange';
import { Slot } from '@/fui/components/Slot.ts';
import { Fui } from '@/fui/react';

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
  const bundle = useContentStore((state) => state.bundle);
  const gear = useInventoryStore((state) => state.gear);
  const loadInventory = useInventoryStore((state) => state.load);

  /**
   * Forging the piece that is already on.
   *
   * The server never cared whether a relic was worn — `upgrade` only asks who owns it — so
   * this was a hole in the *client*: the only Forge button in the game lived in the vault,
   * whose default filter is "In the vault", which by definition excludes everything a
   * champion is wearing. Levelling the piece you are actually using meant taking it off,
   * finding it among the loose ones, forging it, and putting it back.
   *
   * Offered here because this is where the worn piece is: the player opened the slot to
   * look at it. The stat table behind the modal re-reads on `onChanged`, so the champion's
   * numbers move as the relic does.
   */
  const [forging, setForging] = useState(false);
  const canForge = usePlayerStore((state) => state.unlocks?.relicUpgrading ?? false);
  const [reforging, setReforging] = useState(false);

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
    <Modal open title={`${RELIC_SLOT_LABEL[slot]} relic`} onClose={onClose} size="wide">
      <div className={styles.body}>
        {/* Two columns at this width: what is on, and what could be. They used to stack, so
            comparing the worn piece against a candidate meant scrolling between them —
            which is the one thing this dialog exists to let a player do. */}
        <div className={styles.columns}>
          {/* Always rendered, empty or not. Dropping the column when nothing is worn left a
              one-column grid inside a two-column track — the vault squeezed into 20rem with
              the rest of the dialog blank beside it, which is the collapsed strip the owner
              photographed. An empty socket is also the truer answer: the slot exists, it is
              simply bare. */}
          <section className={styles.current}>
            <h3 className={styles.heading}>Worn now</h3>
            {worn ? (
              <>
                <RelicCard relic={worn} />
                <div className={styles.wornActions}>
                  <Button
                    disabled={busy || !canForge || worn.level >= 16}
                    title={
                      canForge
                        ? worn.level >= 16
                          ? 'Already fully upgraded'
                          : undefined
                        : 'The forge opens at account level 3'
                    }
                    onClick={() => setForging(true)}
                  >
                    {worn.level >= 16 ? 'Maxed' : 'Forge'}
                  </Button>
                  {/* Beside the forge because it is the same kind of decision about the
                      same piece — and on the *worn* relic on purpose, since the one worth
                      rerolling a line on is the one a champion is already wearing. */}
                  <Button
                    variant="ghost"
                    disabled={busy || !canForge || worn.substats.length === 0}
                    title={
                      canForge
                        ? worn.substats.length === 0
                          ? 'This relic has no substats to reforge'
                          : undefined
                        : 'The forge opens at account level 3'
                    }
                    onClick={() => setReforging(true)}
                  >
                    Reforge
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void act(() => gameApi.unequip(worn.id))}
                  >
                    Take it off
                  </Button>
                </div>
              </>
            ) : (
              <div className={styles.socket}>
                <Fui
                  of={Slot}
                  className={styles.socketArt}
                  options={{ size: 'lg', item: null, placeholder: relicGlyph(slot) }}
                  attrs={{
                    role: 'presentation',
                    tabindex: undefined,
                    'aria-label': undefined,
                    title: undefined,
                  }}
                />
                <p className={styles.socketNote}>
                  Nothing in this slot. Pick one from the vault and the numbers below will say
                  exactly what it changes.
                </p>
              </div>
            )}
          </section>

          <section className={styles.vault}>
            <h3 className={styles.heading}>In the vault</h3>
            {candidates.length === 0 ? (
              <p className={styles.empty}>
                No spare {RELIC_SLOT_LABEL[slot].toLowerCase()} relics. They drop from campaign
                stage {slotNumber(slot)} of any chapter, and turn up in the Bazaar.
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
        </div>

        {selected && preview?.championId === championId && (
          <section className={styles.preview}>
            <h3 className={styles.heading}>What that would do</h3>
            <ul className={styles.deltas}>
              {STATS.map((stat) => {
                const delta = Math.round(preview.after.total[stat] - preview.before.total[stat]);
                if (delta === 0) return null;
                return (
                  <li key={stat} data-sign={delta > 0 ? 'up' : 'down'}>
                    {statLabel(stat)} {delta > 0 ? '+' : ''}
                    {delta.toLocaleString()}
                  </li>
                );
              })}
            </ul>

            {/* Why the numbers moved, when the reason is a set.

                The deltas above have always been right and always been unexplained: a
                relic that costs a hundred and forty attack because it broke a four-piece
                set looks exactly like a worse relic, and the one thing a player needs to
                know before pressing Equip is which of those it is. Named rather than
                measured — the arithmetic is already in the line above it. */}
            {setChanges(preview.before.setBonuses, preview.after.setBonuses).map((change) => (
              <p
                key={change.setKey}
                className={styles.setChange}
                data-sign={change.after >= change.before ? 'up' : 'down'}
              >
                {describeSetChange(change)}
                {change.description && <span className={styles.setWhat}>{change.description}</span>}
              </p>
            ))}

            {/* And what comes off. The slot's own panel shows the worn piece, but by the
                time a candidate is selected the eye is down here, and "equip" is really
                "swap" — a player who cannot see both halves is guessing at one of them. */}
            {preview.replaces && (
              <p className={styles.replaces}>
                Takes off{' '}
                {bundle?.gearSets.find((set) => set.key === preview.replaces!.setKey)?.name ??
                  preview.replaces.setKey}{' '}
                · {RELIC_SLOT_LABEL[preview.replaces.slot]} +{preview.replaces.level}
              </p>
            )}

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

      {reforging && worn && (
        <Reforge
          relic={worn}
          onClose={() => setReforging(false)}
          onChanged={async () => {
            await loadInventory();
            await onChanged();
          }}
        />
      )}

      {forging && worn && (
        <Forge
          relic={worn}
          onClose={() => setForging(false)}
          onChanged={async () => {
            // The vault list and the champion behind this modal both moved: the relic gained
            // a level and the stats it grants went up with it.
            await loadInventory();
            await onChanged();
          }}
        />
      )}
    </Modal>
  );
}

/** Which campaign stage number farms this slot — the source game's convention. */
function slotNumber(slot: GearSlot): string {
  const order: GearSlot[] = ['weapon', 'helm', 'shield', 'gauntlets', 'cuirass', 'boots'];
  const index = order.indexOf(slot);
  return index >= 0 ? String(index + 1) : 'bosses';
}
